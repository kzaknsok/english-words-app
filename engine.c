#include <stdlib.h>
#include <time.h>
#include <emscripten.h>

#define MAX_SCENES 200

// C内部でマトリクス領域を保持（JSにポインタを露出させない）
static int matrix_data[MAX_SCENES * MAX_SCENES];
static int current_matrix_size = 0;

EMSCRIPTEN_KEEPALIVE
void init_engine(int size) {
    srand((unsigned int)time(NULL));
    if (size > MAX_SCENES) size = MAX_SCENES;
    current_matrix_size = size;
    
    // マトリクスの初期化
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

    int max_weight = -1;
    for (int i = 0; i < current_matrix_size; i++) {
        if (i == current_index) continue;
        int weight = matrix_data[current_index * current_matrix_size + i];
        if (weight > max_weight) {
            max_weight = weight;
        }
    }

    int candidate_count = 0;
    int candidates[MAX_SCENES];

    for (int i = 0; i < current_matrix_size; i++) {
        if (i == current_index) continue;
        if (matrix_data[current_index * current_matrix_size + i] == max_weight) {
            candidates[candidate_count++] = i;
        }
    }

    if (candidate_count > 0) {
        return candidates[rand() % candidate_count];
    }

    return (current_index + 1) % current_matrix_size;
}