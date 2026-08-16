let scenesData = [];
let matrixPtr = null;
let currentIndex = 0;

let initSeed = null;
let selectNextScene = null;
let allocateMatrix = null;
let isAppStarted = false; // 二重実行防止フラグ

async function startApp() {
  if (isAppStarted) return;
  isAppStarted = true;

  const btn = document.getElementById('next-btn');
  if (btn) btn.onclick = showNextScene;

  // 1. words.json 読み込み
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    scenesData = await res.json();
  } catch (err) {
    console.error("Failed to load words.json:", err);
    renderError("words.json の読み込みに失敗しました。");
    return;
  }

  // 2. WASM関数バインド
  try {
    if (typeof Module !== 'undefined' && typeof Module.cwrap === 'function') {
      initSeed = Module.cwrap('init_seed', null, []);
      selectNextScene = Module.cwrap('select_next_scene', 'number', ['number', 'number', 'number']);
      allocateMatrix = Module.cwrap('allocate_matrix', 'number', ['number']);
      
      if (initSeed) initSeed();
      if (scenesData.length > 0 && allocateMatrix) {
        buildAndUploadMatrix();
      }
    }
  } catch (wasmErr) {
    console.warn("WASM error, fallback active:", wasmErr);
  }

  // 初回表示
  showNextScene();
}

function buildAndUploadMatrix() {
  const n = scenesData.length;
  const matrix = new Int32Array(n * n);

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
      matrix[i * n + j] = matches;
    }
  }

  if (typeof allocateMatrix === 'function') {
    matrixPtr = allocateMatrix(matrix.length);
    if (matrixPtr && Module.HEAP32) {
      Module.HEAP32.set(matrix, matrixPtr / 4);
    }
  }
}

function showNextScene() {
  if (!scenesData || scenesData.length === 0) return;

  if (selectNextScene && matrixPtr) {
    currentIndex = selectNextScene(currentIndex, matrixPtr, scenesData.length);
  } else {
    currentIndex = (currentIndex + 1) % scenesData.length;
  }

  const scene = scenesData[currentIndex];
  
  // シーンID表示
  const sceneEl = document.getElementById('scene-id');
  if (sceneEl) sceneEl.textContent = scene.sceneId || `SCENE ${currentIndex + 1}`;

  const container = document.getElementById('content-container');
  
  if (container) {
    // 新UI構造（動的要素生成）
    container.innerHTML = '';
    renderSection(container, 'Chunk', scene.chunks, 'chunk');
    renderSection(container, 'Idiom', scene.idioms, 'idiom');
    renderSection(container, 'Word', scene.words, 'word');
  } else {
    // 旧UI構造へのフォールバック（コンテナがない場合）
    updateOldUiField('chunk-en', 'chunk-ja', scene.chunks);
    updateOldUiField('idiom-en', 'idiom-ja', scene.idioms);
    updateOldUiField('word-en', 'word-ja', scene.words);
  }
}

function renderSection(container, typeLabel, items, cssClass) {
  if (!items || !Array.isArray(items) || items.length === 0) return;

  items.forEach(item => {
    const sec = document.createElement('div');
    sec.className = `section ${cssClass}`;

    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = typeLabel;

    const en = document.createElement('div');
    en.className = 'en';
    en.textContent = item.en || '-';

    const ja = document.createElement('div');
    ja.className = 'ja';
    ja.textContent = item.ja || '-';

    sec.appendChild(tag);
    sec.appendChild(en);
    sec.appendChild(ja);

    container.appendChild(sec);
  });
}

function updateOldUiField(enId, jaId, items) {
  const enEl = document.getElementById(enId);
  const jaEl = document.getElementById(jaId);
  if (items && items.length > 0) {
    if (enEl) enEl.textContent = items[0].en || '-';
    if (jaEl) jaEl.textContent = items[0].ja || '-';
  } else {
    if (enEl) enEl.textContent = '-';
    if (jaEl) jaEl.textContent = '-';
  }
}

function renderError(msg) {
  const container = document.getElementById('content-container');
  if (container) {
    container.innerHTML = `<div class="section"><div class="en" style="color:red;">Error</div><div class="ja">${msg}</div></div>`;
  } else {
    alert(msg);
  }
}

// WASMロードイベントの登録
if (typeof Module !== 'undefined') {
  Module.onRuntimeInitialized = startApp;
}

// 画面読み込み完了時のフォールバック発火
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!isAppStarted) startApp();
  }, 500);
});