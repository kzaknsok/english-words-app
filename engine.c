#include <stdlib.h>
#include <time.h>
#include <emscripten.h>

// WASM用：JavaScriptからメモリを確保するためのラッパー関数
EMSCRIPTEN_KEEPALIVE
int* allocate_matrix(int size) {
    return (int*)malloc(size * sizeof(int));
}

EMSCRIPTEN_KEEPALIVE
void init_seed() {
    srand((unsigned int)time(NULL));
}

// 次のシーンのインデックスを選択（関連度ベース）
EMSCRIPTEN_KEEPALIVE
int select_next_scene(int current_index, int* matrix, int total_scenes) {
    if (total_scenes <= 1) return 0;

    int max_weight = -1;
    for (int i = 0; i < total_scenes; i++) {
        if (i == current_index) continue;
        int weight = matrix[current_index * total_scenes + i];
        if (weight > max_weight) {
            max_weight = weight;
        }
    }

    // 重みが最も高いものの候補からランダム選択
    int candidate_count = 0;
    int candidates[100];
    for (int i = 0; i < total_scenes; i++) {
        if (i == current_index) continue;
        if (matrix[current_index * total_scenes + i] == max_weight) {
            candidates[candidate_count++] = i;
            if (candidate_count >= 100) break;
        }
    }

    if (candidate_count > 0) {
        return candidates[rand() % candidate_count];
    }

    return (current_index + 1) % total_scenes;
}