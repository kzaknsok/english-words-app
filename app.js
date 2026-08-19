let scenesData = [];
let currentIndex = 0;

let initEngine = null;
let setMatrixCell = null;
let selectNextScene = null;
let isAppStarted = false;

// ==========================================
// Web Speech API (音声読み上げ機能)
// ==========================================
function speakEnglish(text) {
  if (!('speechSynthesis' in window)) {
    console.warn("このブラウザは音声合成に対応していません。");
    return;
  }

  // 直前のアニメーション・読み上げを一度キャンセル
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US'; // アメリカ英語
  utterance.rate = 0.9;     // 少しゆっくりめ
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

async function startApp() {
  if (isAppStarted) return;

  const btn = document.getElementById('next-btn');
  if (btn) {
    btn.disabled = false;
    btn.onclick = showNextScene;
  }

  try {
    const res = await fetch('words.json?v=' + Date.now());
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    scenesData = await res.json();

    if (!Array.isArray(scenesData) || scenesData.length === 0) {
      throw new Error("words.json が空です");
    }
  } catch (err) {
    console.error("Failed to load words.json:", err);
    renderError(`words.json 読み込み失敗: ${err.message}`);
    return;
  }

  isAppStarted = true;

  // WASM関数のバインドとマトリクス初期化
  try {
    if (typeof Module !== 'undefined' && typeof Module.cwrap === 'function') {
      initEngine = Module.cwrap('init_engine', null, ['number']);
      setMatrixCell = Module.cwrap('set_matrix_cell', null, ['number', 'number', 'number']);
      selectNextScene = Module.cwrap('select_next_scene', 'number', ['number']);

      if (scenesData.length > 0 && initEngine && setMatrixCell) {
        buildAndUploadMatrix();
      }
    }
  } catch (wasmErr) {
    console.warn("WASM bind warning (fallback active):", wasmErr);
  }

  showNextScene();
}

function buildAndUploadMatrix() {
  const n = scenesData.length;
  if (n === 0 || !initEngine || !setMatrixCell) return;

  initEngine(n);

  for (let i = 0; i < n; i++) {
    const wordsI = (scenesData[i].words || []).map(w => (w.en || '').toLowerCase());
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const wordsJ = (scenesData[j].words || []).map(w => (w.en || '').toLowerCase());

      let matches = 0;
      wordsI.forEach(wi => {
        if (!wi) return;
        wordsJ.forEach(wj => {
          if (wj && (wi === wj || wi.includes(wj) || wj.includes(wi))) matches++;
        });
      });

      setMatrixCell(i, j, matches);
    }
  }
}

function showNextScene() {
  if (!scenesData || scenesData.length === 0) return;

  if (typeof selectNextScene === 'function') {
    try {
      currentIndex = selectNextScene(currentIndex);
    } catch (e) {
      console.warn("WASM call failed, fallback:", e);
      currentIndex = (currentIndex + 1) % scenesData.length;
    }
  } else {
    currentIndex = (currentIndex + 1) % scenesData.length;
  }

  const scene = scenesData[currentIndex];

  const sceneEl = document.getElementById('scene-id');
  if (sceneEl) sceneEl.textContent = scene.sceneId || `SCENE ${currentIndex + 1}`;

  const container = document.getElementById('content-container');
  if (container) {
    container.innerHTML = '';
    renderSection(container, 'Chunk', scene.chunks, 'chunk');
    renderSection(container, 'Idiom', scene.idioms, 'idiom');
    renderSection(container, 'Word', scene.words, 'word');
  }
}

// ==========================================
// カード描画関数（タップ読み上げ対応）
// ==========================================
// app.js 内の renderSection 関数を以下に差し替えてください
function renderSection(container, typeLabel, items, cssClass) {
  if (!items || !Array.isArray(items) || items.length === 0) return;

  items.forEach(item => {
    const sec = document.createElement('div');
    sec.className = `section ${cssClass}`;
    sec.style.cursor = 'pointer';

    // タップで音声再生
    if (item.en) {
      sec.onclick = () => speakEnglish(item.en);
    }

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = typeLabel;

    const en = document.createElement('div');
    en.className = 'en';
    
    // 英文テキスト + スピーカー用SVGアイコン
    const textSpan = document.createElement('span');
    textSpan.textContent = item.en || '-';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'speaker-icon';
    iconSpan.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;

    en.appendChild(textSpan);
    en.appendChild(iconSpan);

    const ja = document.createElement('div');
    ja.className = 'ja';
    ja.textContent = item.ja || '-';

    sec.appendChild(tag);
    sec.appendChild(en);
    sec.appendChild(ja);

    container.appendChild(sec);
  });
}

function renderError(msg) {
  const container = document.getElementById('content-container');
  if (container) {
    container.innerHTML = `<div class="section"><div class="en" style="color:red;">Error</div><div class="ja">${msg}</div></div>`;
  }
}

// WASMロード待ち
if (typeof Module !== 'undefined') {
  Module.onRuntimeInitialized = () => {
    startApp();
  };
} else {
  window.addEventListener('DOMContentLoaded', () => {
    startApp();
  });
}