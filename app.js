// --- グローバル状態管理 ---
let scenesData = [];
let currentSceneIndex = 0;
let currentView = 'study'; // 'study' | 'typing'

// タイピング・応答時間計測用
let startTime = 0;
let timerInterval = null;
const TIME_LIMIT_SEC = 5.0; // タイマー制限時間（秒）

// WASM関数バインド用
let wasmInitEngine = null;
let wasmSetMatrixCell = null;
let wasmSelectNextScene = null;

// --- Web Audio API（効果音生成エンジン） ---
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

// 1. ミス時のブザー音（低音の鋸波）
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

// 2. 正解時のピンポン音
function playSuccessSound() {
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(523.25, now); // C5
  osc.frequency.setValueAtTime(659.25, now + 0.1); // E5

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

  osc.connect(gain);
  gain.connect(audioCtx.destination);

  osc.start(now);
  osc.stop(now + 0.3);
}

// 3. 英語の音声読み上げ (SpeechSynthesis)
function speakEnglish(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel(); // 前の音声を停止
  const uttr = new SpeechSynthesisUtterance(text);
  uttr.lang = 'en-US';
  uttr.rate = 1.0;
  window.speechSynthesis.speak(uttr);
}

// --- WASM (Emscripten) 初期化 ---
if (typeof Module !== 'undefined') {
  Module.onRuntimeInitialized = () => {
    try {
      wasmInitEngine = Module.cwrap('init_engine', null, ['number']);
      wasmSetMatrixCell = Module.cwrap('set_matrix_cell', null, ['number', 'number', 'number']);
      wasmSelectNextScene = Module.cwrap('select_next_scene', 'number', ['number', 'number', 'number']);

      if (scenesData.length > 0 && wasmInitEngine) {
        wasmInitEngine(scenesData.length);
      }
      console.log('WASM Engine Loaded Successfully');
    } catch (e) {
      console.warn('WASM initialization skipped or failed:', e);
    }
  };
}

// --- 初期ロード処理 ---
document.addEventListener('DOMContentLoaded', () => {
  // イベントリスナーの登録
  document.getElementById('next-btn').addEventListener('click', onNextBtnClick);
  
  const typeInput = document.getElementById('typing-input');
  typeInput.addEventListener('input', onTypingInput);
  typeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      checkTypingAnswer(true); // Enterで強制判定
    }
  });

  // ユーザーのファーストタップでAudioContextを有効化
  document.body.addEventListener('click', initAudio, { once: true });

  // データ読み込み
  fetch('words.json')
    .then(res => res.json())
    .then(data => {
      scenesData = data;
      if (wasmInitEngine && scenesData.length > 0) {
        wasmInitEngine(scenesData.length);
      }
      renderCurrentScene();
    })
    .catch(err => {
      console.error('Failed to load words.json:', err);
    });
});

// --- ビューの切り替え ---
function switchView(viewName) {
  initAudio();
  currentView = viewName;

  document.getElementById('tab-study').classList.toggle('active', viewName === 'study');
  document.getElementById('tab-typing').classList.toggle('active', viewName === 'typing');

  document.getElementById('view-study').classList.toggle('active', viewName === 'study');
  document.getElementById('view-typing').classList.toggle('active', viewName === 'typing');

  const btnText = document.getElementById('btn-text');
  if (viewName === 'study') {
    btnText.textContent = '次のシーンへ';
    stopTimer();
  } else {
    btnText.textContent = 'スキップして次へ';
    resetTypingState();
  }
}

// --- 画面描画ロジック ---
function renderCurrentScene() {
  if (scenesData.length === 0) return;

  const scene = scenesData[currentSceneIndex];
  document.getElementById('scene-id').textContent = `SCENE ${scene.id + 1}`;

  // 1. 閲覧ビューの更新
  const studyContainer = document.getElementById('study-cards-container');
  studyContainer.innerHTML = '';

  if (scene.cards && scene.cards.length > 0) {
    scene.cards.forEach(card => {
      const cardEl = document.createElement('div');
      cardEl.className = 'card';
      cardEl.innerHTML = `
        <div class="en">${card.en}</div>
        <div class="ja">${card.ja}</div>
      `;
      studyContainer.appendChild(cardEl);
    });
  } else {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.innerHTML = `
      <div class="en">${scene.en}</div>
      <div class="ja">${scene.ja}</div>
    `;
    studyContainer.appendChild(cardEl);
  }

  // 2. 早撃ちビューの更新
  if (currentView === 'typing') {
    resetTypingState();
  }
}

// --- 早撃ちタイピング処理 ---
function resetTypingState() {
  const scene = scenesData[currentSceneIndex];
  if (!scene) return;

  document.getElementById('typing-ja').textContent = scene.ja;
  const input = document.getElementById('typing-input');
  input.value = '';
  input.className = 'type-input';
  input.disabled = false;
  input.focus();

  document.getElementById('typing-feedback').textContent = '即打ちでスピーキング脳を育成';
  document.getElementById('typing-feedback').style.color = 'var(--text-muted)';

  startTimer();
}

function startTimer() {
  stopTimer();
  startTime = performance.now();
  const timerBar = document.getElementById('timer-bar');

  timerInterval = setInterval(() => {
    const elapsed = (performance.now() - startTime) / 1000;
    const remainingRatio = Math.max(0, (TIME_LIMIT_SEC - elapsed) / TIME_LIMIT_SEC);
    timerBar.style.width = `${remainingRatio * 100}%`;

    if (elapsed >= TIME_LIMIT_SEC) {
      // タイムオーバー
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

// 文字列比較の正規化（記号・大文字小文字の差異を無視）
function normalizeText(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

function onTypingInput() {
  checkTypingAnswer(false);
}

function checkTypingAnswer(isForce) {
  const scene = scenesData[currentSceneIndex];
  if (!scene) return;

  const inputEl = document.getElementById('typing-input');
  const userText = normalizeText(inputEl.value);
  const targetText = normalizeText(scene.en);

  if (userText === targetText) {
    // 正解処理
    stopTimer();
    const responseTime = (performance.now() - startTime) / 1000;

    inputEl.className = 'type-input correct';
    inputEl.disabled = true;

    document.getElementById('typing-feedback').textContent = `🎯 PERFECT! (${responseTime.toFixed(2)}秒)`;
    document.getElementById('typing-feedback').style.color = 'var(--accent-green)';

    playSuccessSound();
    speakEnglish(scene.en);

    // WASMに結果を送り、1.2秒後に次のシーンへ
    setTimeout(() => {
      advanceNextScene(responseTime, true);
    }, 1200);

  } else if (isForce && userText.length > 0) {
    // Enterキー等で間違えた場合
    handleWrongAnswer("惜しい！もう一度確認しよう");
  }
}

function handleWrongAnswer(message) {
  const inputEl = document.getElementById('typing-input');
  inputEl.className = 'type-input wrong';

  document.getElementById('typing-feedback').textContent = message;
  document.getElementById('typing-feedback').style.color = 'var(--accent-red)';

  // 間違えた場合の警告音を再生
  playErrorSound();

  // WASMへ間違い（is_correct = 0）として登録
  const responseTime = (performance.now() - startTime) / 1000;
  if (wasmSelectNextScene) {
    wasmSelectNextScene(currentSceneIndex, responseTime, 0);
  }
}

// --- 次のシーンへの遷移統括 ---
function onNextBtnClick() {
  initAudio();
  if (currentView === 'study') {
    // 閲覧モード時の「次へ」ボタン
    const scene = scenesData[currentSceneIndex];
    if (scene) speakEnglish(scene.en); // 英語音声を再生
    advanceNextScene(1.0, true);
  } else {
    // 早撃ちモード時の「スキップ」ボタン
    stopTimer();
    advanceNextScene(TIME_LIMIT_SEC, false);
  }
}

function advanceNextScene(responseTimeSec, isCorrect) {
  if (scenesData.length === 0) return;

  // WASMエンジンから次の最適なシーンインデックスを取得
  if (wasmSelectNextScene) {
    currentSceneIndex = wasmSelectNextScene(currentSceneIndex, responseTimeSec, isCorrect ? 1 : 0);
  } else {
    // WASM未読み込み時のフォールバック（順番送り）
    currentSceneIndex = (currentSceneIndex + 1) % scenesData.length;
  }

  renderCurrentScene();
}