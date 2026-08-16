#include <stdlib.h>
#include <time.h>
#include <emscripten.h>

// 1. WASM用：JavaScriptからメモリを確保するためのラッパー関数
EMSCRIPTEN_KEEPALIVE
int* allocate_matrix(int size) {
    if (size <= 0) return NULL;
    return (int*)malloc((size_t)size * sizeof(int));
}

// 2. メモリ解放用ラッパー関数（メモリリーク防止）
EMSCRIPTEN_KEEPALIVE
void free_matrix(int* ptr) {
    if (ptr != NULL) {
        free(ptr);
    }
}

// 3. 乱数シードの初期化
EMSCRIPTEN_KEEPALIVE
void init_seed() {
    srand((unsigned int)time(NULL));
}

// 4. 次のシーンのインデックスを選択（関連度ベース）
EMSCRIPTEN_KEEPALIVE
int select_next_scene(int current_index, int* matrix, int total_scenes) {
    if (total_scenes <= 1 || matrix == NULL) return 0;
    if (current_index < 0 || current_index >= total_scenes) return 0;

    // 関連度の最大値を特定
    int max_weight = -1;
    for (int i = 0; i < total_scenes; i++) {
        if (i == current_index) continue;
        int weight = matrix[current_index * total_scenes + i];
        if (weight > max_weight) {
            max_weight = weight;
        }
    }

    // 動的な配列割り当て（静的配列100個のオーバーフロー制限を排除）
    int candidate_count = 0;
    int* candidates = (int*)malloc((size_t)total_scenes * sizeof(int));
    if (candidates == NULL) {
        return (current_index + 1) % total_scenes; // メモリ確保失敗時のフォールバック
    }

    for (int i = 0; i < total_scenes; i++) {
        if (i == current_index) continue;
        if (matrix[current_index * total_scenes + i] == max_weight) {
            candidates[candidate_count++] = i;
        }
    }

    int result = (current_index + 1) % total_scenes;
    if (candidate_count > 0) {
        result = candidates[rand() % candidate_count];
    }

    free(candidates); // 一時メモリの解放
    return result;
}