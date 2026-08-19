let scenesData = [];
let currentIndex = 0;
let currentView = 'study';

// タイピング関連の状態管理
let typingQuestions = [];
let currentQIndex = 0;
let typingTimer = null;
let startTime = 0;
const TIME_LIMIT_SEC = 5;

// WASMバインディング関数
let wasmInitEngine = null;
let wasmGetNextScene = null;

// 音声再生（Web Speech API）
function speakEnglish(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
}

// 画面切り替え (SPA)
function switchView(viewName) {
  currentView = viewName;
  document.querySelectorAll('.tab-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', (idx === 0 && viewName === 'study') || (idx === 1 && viewName === 'typing'));
  });

  document.getElementById('view-study').classList.toggle('active', viewName === 'study');
  document.getElementById('view-typing').classList.toggle('active', viewName === 'typing');

  const btnText = document.getElementById('btn-text');
  if (viewName === 'study') {
    if (btnText) btnText.textContent = '次のシーンへ';
    clearInterval(typingTimer);
  } else {
    if (btnText) btnText.textContent = 'スキップ / 次へ';
    startTypingSession();
  }
}

async function initApp() {
  // WASMの初期化チェック (C言語関数が存在すればロード)
  if (typeof Module !== 'undefined' && Module.cwrap) {
    Module.onRuntimeInitialized = () => {
      wasmInitEngine = Module.cwrap('init_engine', null, ['number']);
      wasmGetNextScene = Module.cwrap('get_next_recommended_scene', 'number', ['number', 'number', 'number']);
      if (scenesData.length > 0) wasmInitEngine(scenesData.length);
    };
  }

  // ボタンイベント接続
  document.getElementById('next-btn').onclick = () => {
    if (currentView === 'study') {
      showNextScene();
    } else {
      nextTypingQuestion(false, TIME_LIMIT_SEC); // 手動スキップはミス扱い
    }
  };

  // 1. JSONデータのロード
  try {
    const res = await fetch('words.json?v=' + Date.now());
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    scenesData = await res.json();
    if (wasmInitEngine) wasmInitEngine(scenesData.length);
  } catch (err) {
    console.error("Failed to load words.json:", err);
    return;
  }

  showNextScene();
  setupTypingInput();
}

// ------------------------------------------
// 閲覧モード処理
// ------------------------------------------
function showNextScene() {
  if (!scenesData || scenesData.length === 0) return;
  const scene = scenesData[currentIndex];

  document.getElementById('scene-id').textContent = scene.sceneId || `SCENE ${currentIndex + 1}`;
  const container = document.getElementById('view-study');
  container.innerHTML = '';

  const items = [...(scene.chunks || []), ...(scene.idioms || []), ...(scene.words || [])];
  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => speakEnglish(item.en);
    card.innerHTML = `<div class="en">${item.en} 🔊</div><div class="ja">${item.ja}</div>`;
    container.appendChild(card);
  });
}

// ------------------------------------------
// 早撃ちタイピング処理
// ------------------------------------------
function startTypingSession() {
  const scene = scenesData[currentIndex];
  typingQuestions = [...(scene.chunks || []), ...(scene.idioms || []), ...(scene.words || [])];
  
  if (typingQuestions.length === 0) {
    showNextScene();
    return;
  }

  currentQIndex = 0;
  loadTypingQuestion();
}

function loadTypingQuestion() {
  clearInterval(typingTimer);
  const q = typingQuestions[currentQIndex];
  if (!q) {
    // シーン内の全問題が終了 ➔ WASM側にお勧めの「次のシーン」を聞く
    if (wasmGetNextScene) {
      currentIndex = wasmGetNextScene(currentIndex, 1.5, 1);
    } else {
      currentIndex = (currentIndex + 1) % scenesData.length;
    }
    showNextScene();
    startTypingSession();
    return;
  }

  const jaEl = document.getElementById('typing-ja');
  const inputEl = document.getElementById('typing-input');
  const feedbackEl = document.getElementById('typing-feedback');
  
  jaEl.textContent = q.ja;
  inputEl.value = '';
  inputEl.className = 'type-input';
  inputEl.focus();
  feedbackEl.textContent = '打ち終えた瞬間に正解音声を自動再生';

  startTimer();
}

function startTimer() {
  const bar = document.getElementById('timer-bar');
  let timeLeft = TIME_LIMIT_SEC * 100;
  startTime = Date.now();
  bar.style.width = '100%';

  typingTimer = setInterval(() => {
    timeLeft -= 5;
    const percentage = Math.max(0, (timeLeft / (TIME_LIMIT_SEC * 100)) * 100);
    bar.style.width = percentage + '%';

    if (timeLeft <= 0) {
      clearInterval(typingTimer);
      nextTypingQuestion(false, TIME_LIMIT_SEC);
    }
  }, 50);
}

function setupTypingInput() {
  const inputEl = document.getElementById('typing-input');
  
  inputEl.addEventListener('input', () => {
    const q = typingQuestions[currentQIndex];
    if (!q) return;

    const userVal = normalizeText(inputEl.value);
    const targetVal = normalizeText(q.en);

    if (userVal === targetVal) {
      clearInterval(typingTimer);
      const timeTakenSec = (Date.now() - startTime) / 1000;
      
      inputEl.className = 'type-input correct';
      document.getElementById('typing-feedback').textContent = `CLEAR! (${timeTakenSec.toFixed(2)}秒)`;
      
      // コンマ数秒後に正解音声を流してシャドーイングを促す
      speakEnglish(q.en);

      setTimeout(() => {
        nextTypingQuestion(true, timeTakenSec);
      }, 1200);
    }
  });
}

function normalizeText(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function nextTypingQuestion(isCorrect, responseTimeSec) {
  // WASMへ今回の結果（応答時間・正誤）をインプット
  if (wasmGetNextScene) {
    wasmGetNextScene(currentIndex, responseTimeSec, isCorrect ? 1 : 0);
  }

  currentQIndex++;
  loadTypingQuestion();
}

window.addEventListener('DOMContentLoaded', initApp);