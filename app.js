let scenesData = [];
let currentIndex = 0;

let initEngine = null;
let setMatrixCell = null;
let selectNextScene = null;
let isAppStarted = false;

async function startApp() {
  if (isAppStarted) return;

  // 1. ボタンイベント登録
  const btn = document.getElementById('next-btn');
  if (btn) {
    btn.disabled = false;
    btn.onclick = showNextScene;
  }

  // 2. words.json 読み込み
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

  // 3. WASM関数のバインドとマトリクス初期化
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

  // 初回画面表示
  showNextScene();
}

function buildAndUploadMatrix() {
  const n = scenesData.length;
  if (n === 0 || !initEngine || !setMatrixCell) return;

  // C側の領域初期化
  initEngine(n);

  // マトリクス構築＆C側へデータ転送
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

  // WASMで次のシーンを選択（失敗した場合は連番でローテーションするフォールバック付き）
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

// 初期化
window.addEventListener('DOMContentLoaded', () => {
  startApp();
});