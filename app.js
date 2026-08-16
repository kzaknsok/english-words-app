let scenesData = [];
let matrixPtr = null;
let currentIndex = 0;

let initSeed = null;
let selectNextScene = null;

// アプリの起動処理
async function startApp() {
  const btn = document.getElementById('next-btn');
  if (btn) btn.onclick = showNextScene;

  // 1. words.json の取得
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    scenesData = await res.json();
  } catch (err) {
    console.error("Failed to load words.json:", err);
    renderError("words.json の読み込みに失敗しました。ファイル構造を確認してください。");
    return;
  }

  // 2. WASM関数のセットアップ（準備できていれば）
  try {
    if (typeof Module !== 'undefined' && typeof Module.cwrap === 'function') {
      initSeed = Module.cwrap('init_seed', null, []);
      selectNextScene = Module.cwrap('select_next_scene', 'number', ['number', 'number', 'number']);
      
      if (initSeed) initSeed();
      if (scenesData.length > 0) buildAndUploadMatrix();
    }
  } catch (wasmErr) {
    console.warn("WASM Initialization Warning (Fallback mode):", wasmErr);
  }

  // 初回カード表示
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

  const mallocFunc = Module._malloc || (Module.exports && Module.exports.malloc);
  if (typeof mallocFunc === 'function') {
    matrixPtr = mallocFunc(matrix.length * 4);
    Module.HEAP32.set(matrix, matrixPtr / 4);
  }
}

// 次のシーンを表示（空データスキップ & 動的レンダリング）
function showNextScene() {
  if (!scenesData || scenesData.length === 0) return;

  // WASMが使えればアルゴリズム選択、使えなければ順繰り表示
  if (selectNextScene && matrixPtr) {
    currentIndex = selectNextScene(currentIndex, matrixPtr, scenesData.length);
  } else {
    currentIndex = (currentIndex + 1) % scenesData.length;
  }

  const scene = scenesData[currentIndex];

  // シーンタイトル設定
  document.getElementById('scene-id').textContent = scene.sceneId || `SCENE ${currentIndex + 1}`;

  // コンテナ初期化
  const container = document.getElementById('content-container');
  container.innerHTML = '';

  // 各タイプの動的描画（データが存在する場合のみ枠を生成）
  renderSection(container, 'Chunk', scene.chunks, 'chunk');
  renderSection(container, 'Idiom', scene.idioms, 'idiom');
  renderSection(container, 'Word', scene.words, 'word');
}

// セクション生成用共通ヘルパー
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

function renderError(msg) {
  const container = document.getElementById('content-container');
  container.innerHTML = `<div class="section"><div class="en" style="color:red;">Error</div><div class="ja">${msg}</div></div>`;
}

// 初期化フック
if (typeof Module !== 'undefined') {
  Module.onRuntimeInitialized = startApp;
}

window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (scenesData.length === 0) startApp();
  }, 300);
});