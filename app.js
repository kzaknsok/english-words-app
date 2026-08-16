let scenesData = [];
let matrixPtr = null;
let currentIndex = 0;

let initSeed = null;
let selectNextScene = null;

// アプリ起動メイン関数
async function startApp() {
  console.log("App starting...");

  // 1. words.json を取得
  try {
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    scenesData = await res.json();
    console.log("words.json loaded successfully:", scenesData);
  } catch (err) {
    console.error("Failed to load words.json:", err);
    alert("words.json の読み込みに失敗しました。ファイルがJSONの正しい形式(構文)になっているか確認してください。");
    return;
  }

  // 2. WASMの関数バインドを試みる
  try {
    if (typeof Module !== 'undefined' && typeof Module.cwrap === 'function') {
      initSeed = Module.cwrap('init_seed', null, []);
      selectNextScene = Module.cwrap('select_next_scene', 'number', ['number', 'number', 'number']);
      
      if (initSeed) initSeed();
      if (scenesData.length > 0) buildAndUploadMatrix();
      console.log("WASM module bound successfully.");
    } else {
      console.warn("WASM module not detected. Running in fallback mode.");
    }
  } catch (wasmErr) {
    console.warn("WASM Init Warning (Running in fallback mode):", wasmErr);
  }

  // 3. UIの有効化とイベント登録
  const btn = document.getElementById('next-btn');
  if (btn) {
    btn.disabled = false;
    btn.onclick = showNextScene;
  }

  // 初回表示
  showNextScene();
}

// 関連度行列の転送
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

  matrixPtr = Module._malloc(matrix.length * 4);
  Module.HEAP32.set(matrix, matrixPtr / 4);
}

// カードの描画
function showNextScene() {
  if (!scenesData || scenesData.length === 0) return;

  // WASMが利用可能ならWASMで選択、不可なら順番に切替
  if (selectNextScene && matrixPtr) {
    currentIndex = selectNextScene(currentIndex, matrixPtr, scenesData.length);
  } else {
    currentIndex = (currentIndex + 1) % scenesData.length;
  }

  const scene = scenesData[currentIndex];

  document.getElementById('scene-id').textContent = scene.sceneId || `SCENE ${currentIndex + 1}`;

  const chunk = (scene.chunks && scene.chunks[0]) || { en: '-', ja: '-' };
  document.getElementById('chunk-en').textContent = chunk.en || '-';
  document.getElementById('chunk-ja').textContent = chunk.ja || '-';

  const idiom = (scene.idioms && scene.idioms[0]) || { en: '-', ja: '-' };
  document.getElementById('idiom-en').textContent = idiom.en || '-';
  document.getElementById('idiom-ja').textContent = idiom.ja || '-';

  const word = (scene.words && scene.words[0]) || { en: '-', ja: '-' };
  document.getElementById('word-en').textContent = word.en || '-';
  document.getElementById('word-ja').textContent = word.ja || '-';
}

// イベントリスナーで初期化を発火
if (typeof Module !== 'undefined') {
  Module.onRuntimeInitialized = startApp;
}
// WASMの準備完了前にDOMがロードされた場合の保険
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    if (scenesData.length === 0) startApp();
  }, 500);
});