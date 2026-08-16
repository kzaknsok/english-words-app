#include <stdlib.h>
#include <time.h>
#include <emscripten.h>

#define MAX_SCENES 200

static int matrix_data[MAX_SCENES * MAX_SCENES];
static int current_matrix_size = 0;

EMSCRIPTEN_KEEPALIVE
void init_engine(int size) {
    srand((unsigned int)time(NULL));
    if (size > MAX_SCENES) size = MAX_SCENES;
    current_matrix_size = size;
    
    for (int i = 0; i < size * size; i++) {
        matrix_data[i] = 0;
    }
}

EMSCRIPTEN_KEEPALIVE
void set_matrix_cell(int row, int col, int value) {
    if (row >= 0 && row < current_matrix_size && col >= 0 && col < current_matrix_size) {
        matrix_data[row * current_matrix_size + col] = value;
    }
}

EMSCRIPTEN_KEEPALIVE
int select_next_scene(int current_index) {
    if (current_matrix_size <= 1) return 0;
    if (current_index < 0 || current_index >= current_matrix_size) return 0;

    int total_weight = 0;

    // 1. 自分以外の全シーンへの重み（スコア + 基礎ポイント1）を合計する
    for (int i = 0; i < current_matrix_size; i++) {
        if (i == current_index) continue;
        int weight = matrix_data[current_index * current_matrix_size + i];
        
        // 関連度(weight) + 1 (全く関連がないシーンも稀に選ばれるように基礎点1を付与)
        total_weight += (weight + 1);
    }

    if (total_weight <= 0) {
        return (current_index + 1) % current_matrix_size;
    }

    // 2. 0 〜 total_weight-1 の間でランダムな値を決定（確率抽選）
    int rnd = rand() % total_weight;

    // 3. ルーレット選択
    int current_weight = 0;
    for (int i = 0; i < current_matrix_size; i++) {
        if (i == current_index) continue;
        
        int weight = matrix_data[current_index * current_matrix_size + i] + 1;
        current_weight += weight;
        
        if (rnd < current_weight) {
            return i;
        }
    }

    return (current_index + 1) % current_matrix_size;
}