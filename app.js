let scenesData = [];
let matrixPtr = null;
let currentIndex = 0;

Module.onRuntimeInitialized = async () => {
  Module._init_seed();
  
  try {
    const res = await fetch('words.json');
    scenesData = await res.json();

    buildAndUploadMatrix();
    
    const btn = document.getElementById('next-btn');
    btn.disabled = false;
    btn.addEventListener('click', showNextScene);
    
    showNextScene();
  } catch (err) {
    console.error('Failed to load words.json:', err);
  }
};

function buildAndUploadMatrix() {
  const n = scenesData.length;
  const matrix = new Int32Array(n * n);

  for (let i = 0; i < n; i++) {
    const wordsI = scenesData[i].words.map(w => w.en.toLowerCase());
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const wordsJ = scenesData[j].words.map(w => w.en.toLowerCase());
      
      let matches = 0;
      wordsI.forEach(wi => {
        wordsJ.forEach(wj => {
          if (wi === wj || wi.includes(wj) || wj.includes(wi)) matches++;
        });
      });
      matrix[i * n + j] = matches;
    }
  }

  matrixPtr = Module._malloc(matrix.length * 4);
  Module.HEAP32.set(matrix, matrixPtr / 4);
}

function showNextScene() {
  const selectNext = Module.cwrap('select_next_scene', 'number', ['number', 'number', 'number']);
  currentIndex = selectNext(currentIndex, matrixPtr, scenesData.length);
  
  const scene = scenesData[currentIndex];
  
  document.getElementById('scene-id').textContent = scene.sceneId;
  
  const chunk = scene.chunks[0] || { en: '-', ja: '-' };
  document.getElementById('chunk-en').textContent = chunk.en;
  document.getElementById('chunk-ja').textContent = chunk.ja;

  const idiom = scene.idioms[0] || { en: '-', ja: '-' };
  document.getElementById('idiom-en').textContent = idiom.en;
  document.getElementById('idiom-ja').textContent = idiom.ja;

  const word = scene.words[0] || { en: '-', ja: '-' };
  document.getElementById('word-en').textContent = word.en;
  document.getElementById('word-ja').textContent = word.ja;
}