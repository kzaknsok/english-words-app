let scenesData = [];
let currentIndex = 0;

let initEngine = null;
let setMatrixCell = null;
let selectNextScene = null;
let isAppStarted = false;

async function startApp() {
  if (isAppStarted) return;
  isAppStarted = true;

  // ボタンイベント登録（最優先）
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

  // 2. WASM関数のバインドとマトリクス構築
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
    console.warn("WASM bind error, active fallback:", wasmErr);
  }

  // 初回画面表示
  showNextScene();
}

function buildAndUploadMatrix() {
  const n = scenesData.length;
  if (n === 0) return;

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

      // WASM側の関数を呼んで1個ずつ値をセット（ポインタ不要）
      setMatrixCell(i, j, matches);
    }
  }
}

function showNextScene() {
  if (!scenesData || scenesData.length === 0) return;

  // WASMが使えればWASMで決定、ダメならJSフォールバック（ローテーション）
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
  if (container) {
    container.innerHTML = `<div class="section"><div class="en" style="color:red;">Error</div><div class="ja">${msg}</div></div>`;
  }
}

// 初期化トリガー
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (!isAppStarted) startApp();
  }, 500);
});