let scenesData = [];
let matrixPtr = null;
let currentIndex = 0;

// WASMの関数ラッパー
let initSeed = null;
let selectNextScene = null;

Module.onRuntimeInitialized = async () => {
  try {
    // 1. WASM関数のバインド (頭にアンダースコアをつけてC関数を指定)
    initSeed = Module.cwrap('init_seed', null, []);
    selectNextScene = Module.cwrap('select_next_scene', 'number', ['number', 'number', 'number']);

    // シード値の初期化
    if (initSeed) initSeed();

    // 2. words.json の読み込み
    const res = await fetch('words.json');
    if (!res.ok) throw new Error(`Failed to load words.json: ${res.status}`);
    scenesData = await res.json();

    // 3. 関連度行列を生成してWASMメモリ領域に転送
    buildAndUploadMatrix();

    // 4. UIの有効化と初回表示
    const btn = document.getElementById('next-btn');
    btn.disabled = false;
    btn.addEventListener('click', showNextScene);

    showNextScene();
  } catch (err) {
    console.error('WASM Application Error:', err);
  }
};

function buildAndUploadMatrix() {
  const n = scenesData.length;
  const matrix = new Int32Array(n * n);

  for (let i = 0; i < n; i++) {
    const wordsI = (scenesData[i].words || []).map(w => w.en.toLowerCase());
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const wordsJ = (scenesData[j].words || []).map(w => w.en.toLowerCase());

      let matches = 0;
      wordsI.forEach(wi => {
        wordsJ.forEach(wj => {
          if (wi === wj || wi.includes(wj) || wj.includes(wi)) matches++;
        });
      });
      matrix[i * n + j] = matches;
    }
  }

  // C言語側のメモリ空間(HEAP32)へ書き込み
  matrixPtr = Module._malloc(matrix.length * 4);
  Module.HEAP32.set(matrix, matrixPtr / 4);
}

function showNextScene() {
  if (!selectNextScene || scenesData.length === 0) return;

  // WASM側で次表示するインデックスを選択
  currentIndex = selectNextScene(currentIndex, matrixPtr, scenesData.length);

  const scene = scenesData[currentIndex];
  document.getElementById('scene-id').textContent = scene.sceneId || `SCENE ${currentIndex + 1}`;

  const chunk = (scene.chunks && scene.chunks[0]) || { en: '-', ja: '-' };
  document.getElementById('chunk-en').textContent = chunk.en;
  document.getElementById('chunk-ja').textContent = chunk.ja;

  const idiom = (scene.idioms && scene.idioms[0]) || { en: '-', ja: '-' };
  document.getElementById('idiom-en').textContent = idiom.en;
  document.getElementById('idiom-ja').textContent = idiom.ja;

  const word = (scene.words && scene.words[0]) || { en: '-', ja: '-' };
  document.getElementById('word-en').textContent = word.en;
  document.getElementById('word-ja').textContent = word.ja;
}