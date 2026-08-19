// --- グローバル状態管理 ---
let scenesData = [];
let currentSceneIndex = 0;
let currentCardIndex = 0; // シーン内のカード位置
let currentView = 'study'; // 'study' | 'typing'

// タイピング・応答時間計測用
let startTime = 0;
let timerInterval = null;
const TIME_LIMIT_SEC = 5.0;

// WASM関数バインド用
let wasmInitEngine = null;
let wasmSetMatrixCell = null;
let wasmSelectNextScene = null;

// --- Web Audio API（効果音生成） ---
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function playErrorSound() {
  initAudio();
  if (!audioCtx) return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(150, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.25);

  gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.25);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start();
  osc.stop(audioCtx.currentTime + 0.25);
}

function playSuccessSound() {
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, now);
  osc.frequency.setValueAtTime(659.25, now + 0.1);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.3);
}

// --- 英語音声読み上げ（Web Speech API） ---
let englishVoice = null;

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  englishVoice = voices.find(v => v.lang === 'en-US') || 
                 voices.find(v => v.lang.startsWith('en'));
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

function speakEnglish(text) {
  if (!('speechSynthesis' in window) || !text) return;

  window.speechSynthesis.cancel();

  const uttr = new SpeechSynthesisUtterance(text);
  uttr.lang = 'en-US';
  uttr.rate = 1.0;

  if (englishVoice) {
    uttr.voice = englishVoice;
  }

  setTimeout(() => {
    window.speechSynthesis.speak(uttr);
  }, 30);
}

// --- 初期ロード処理 ---
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('study-next-btn').addEventListener('click', onNextBtnClick);
  document.getElementById('typing-next-btn').addEventListener('click', onNextBtnClick);

  const typeInput = document.getElementById('typing-input');
  typeInput.addEventListener('input', onTypingInput);
  typeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      checkTypingAnswer(true);
    }
  });

  const unlockAudio = () => {
    initAudio();
    if ('speechSynthesis' in window) {
      loadVoices();
      const u = new SpeechSynthesisUtterance('');
      window.speechSynthesis.speak(u);
    }
  };
  document.body.addEventListener('click', unlockAudio, { once: true });
  document.body.addEventListener('keydown', unlockAudio, { once: true });

  fetch('words.json')
    .then(res => res.json())
    .then(data => {
      scenesData = data;
      renderCurrentScene();
    })
    .catch(err => {
      console.error('words.jsonの読み込みに失敗しました:', err);
    });
});

// --- シーン内の全カードを配列化 ---
function getAllCardsInScene(scene) {
  if (!scene) return [];
  let list = [];
  if (scene.chunks) list = list.concat(scene.chunks);
  if (scene.idioms) list = list.concat(scene.idioms);
  if (scene.words) list = list.concat(scene.words);
  return list;
}

// --- ビュー切り替え ---
function switchView(viewName) {
  initAudio();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  
  currentView = viewName;
  currentCardIndex = 0;

  document.getElementById('tab-study').classList.toggle('active', viewName === 'study');
  document.getElementById('tab-typing').classList.toggle('active', viewName === 'typing');

  document.getElementById('view-study').classList.toggle('active', viewName === 'study');
  document.getElementById('view-typing').classList.toggle('active', viewName === 'typing');

  // ビューごとの下部コントロール表示切り替え
  const studyControls = document.getElementById('study-controls');
  if (studyControls) {
    studyControls.style.display = viewName === 'study' ? 'block' : 'none';
  }

  if (viewName === 'study') {
    stopTimer();
  } else {
    resetTypingState();
  }
}

// --- 画面描画ロジック ---
function renderCurrentScene() {
  if (scenesData.length === 0) return;

  const scene = scenesData[currentSceneIndex];
  const sceneLabel = scene.sceneId ? scene.sceneId.toUpperCase() : `SCENE ${currentSceneIndex + 1}`;
  document.getElementById('scene-id').textContent = sceneLabel;

  const cards = getAllCardsInScene(scene);

  // 1. 閲覧モードの描画
  const studyContainer = document.getElementById('study-cards-container');
  if (studyContainer) {
    studyContainer.innerHTML = '';
    cards.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.style.cursor = 'pointer';
      
      cardEl.innerHTML = `
        <div class="card-content">
          <div class="en">${card.en}</div>
          <div class="ja">${card.ja}</div>
        </div>
        <button class="speaker-btn" aria-label="音声再生">🔊</button>
      `;

      cardEl.addEventListener('click', () => {
        const btn = cardEl.querySelector('.speaker-btn');
        if (btn) {
          btn.classList.add('playing');
          setTimeout(() => btn.classList.remove('playing'), 300);
        }
        speakEnglish(card.en);
      });

      studyContainer.appendChild(cardEl);
    });
  }

  // 2. 早打ちモードの描画
  if (currentView === 'typing') {
    resetTypingState();
  }
}

// --- 早撃ちタイピング処理 ---
function resetTypingState() {
  const scene = scenesData[currentSceneIndex];
  if (!scene) return;

  const cards = getAllCardsInScene(scene);

  if (currentCardIndex >= cards.length) {
    advanceNextScene(1.0, true);
    return;
  }

  const currentCard = cards[currentCardIndex];

  document.getElementById('typing-ja').textContent = currentCard.ja;
  document.getElementById('scene-id').textContent = 
    `${scene.sceneId ? scene.sceneId.toUpperCase() : 'SCENE'} (${currentCardIndex + 1}/${cards.length})`;

  const input = document.getElementById('typing-input');
  input.value = '';
  input.className = 'type-input';
  input.disabled = false;
  input.focus();

  document.getElementById('typing-feedback').textContent = '即打ちでスピーキング脳を育成';
  document.getElementById('typing-feedback').style.color = 'var(--text-muted)';

  speakEnglish(currentCard.en);
  startTimer();
}

function startTimer() {
  stopTimer();
  startTime = performance.now();
  const timerBar = document.getElementById('timer-bar');

  timerInterval = setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    const remainingRatio = Math.max(0, (TIME_LIMIT_SEC - elapsed) / TIME_LIMIT_SEC);
    if (timerBar) timerBar.style.width = `${remainingRatio * 100}%`;

    if (elapsed >= TIME_LIMIT_SEC) {
      stopTimer();
      handleWrongAnswer("時間切れ！");
    }
  }, 50);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function normalizeText(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function onTypingInput() {
  checkTypingAnswer(false);
}

function checkTypingAnswer(isForce) {
  const scene = scenesData[currentSceneIndex];
  if (!scene) return;

  const cards = getAllCardsInScene(scene);
  if (currentCardIndex >= cards.length) return;

  const currentCard = cards[currentCardIndex];
  const inputEl = document.getElementById('typing-input');
  const userText = normalizeText(inputEl.value);
  const targetText = normalizeText(currentCard.en);

  if (userText === targetText && targetText.length > 0) {
    stopTimer();
    const responseTime = (performance.now() - startTime) / 1000;

    inputEl.className = 'type-input correct';
    inputEl.disabled = true;

    document.getElementById('typing-feedback').textContent = `🎯 PERFECT! (${responseTime.toFixed(2)}秒)`;
    document.getElementById('typing-feedback').style.color = 'var(--accent-green)';

    playSuccessSound();

    setTimeout(() => {
      currentCardIndex++;
      resetTypingState();
    }, 800);

  } else if (isForce && userText.length > 0) {
    handleWrongAnswer("惜しい！もう一度確認しよう");
  }
}

function handleWrongAnswer(message) {
  const inputEl = document.getElementById('typing-input');
  inputEl.className = 'type-input wrong';

  document.getElementById('typing-feedback').textContent = message;
  document.getElementById('typing-feedback').style.color = 'var(--accent-red)';

  playErrorSound();

  const responseTime = (performance.now() - startTime) / 1000;
  if (wasmSelectNextScene) {
    wasmSelectNextScene(currentSceneIndex, responseTime, 0);
  }
}

// --- 「次へ / スキップ」ボタン処理 ---
function onNextBtnClick() {
  initAudio();
  if (currentView === 'study') {
    advanceNextScene(1.0, true);
  } else {
    stopTimer();
    currentCardIndex = 0;
    advanceNextScene(TIME_LIMIT_SEC, false);
  }
}

function advanceNextScene(responseTimeSec, isCorrect) {
  if (scenesData.length === 0) return;

  currentCardIndex = 0;

  if (wasmSelectNextScene) {
    currentSceneIndex = wasmSelectNextScene(currentSceneIndex, responseTimeSec, isCorrect ? 1 : 0);
  } else {
    currentSceneIndex = (currentSceneIndex + 1) % scenesData.length;
  }

  renderCurrentScene();
}