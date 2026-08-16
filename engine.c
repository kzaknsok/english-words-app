#include <stdlib.h>
#include <time.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
void init_seed() {
    srand(time(NULL));
}

EMSCRIPTEN_KEEPALIVE
int select_next_scene(int current_index, int* matrix, int total_scenes) {
    int total_weight = 0;
    int weights[total_scenes];

    for (int i = 0; i < total_scenes; i++) {
        if (i == current_index) {
            weights[i] = 0; // 直前と同じシーンは除外
        } else {
            int match_count = matrix[current_index * total_scenes + i];
            // 共通単語があれば重み10（関連重視）、なければ重み1
            weights[i] = (match_count > 0) ? (match_count * 10) : 1;
        }
        total_weight += weights[i];
    }

    if (total_weight <= 0) return (current_index + 1) % total_scenes;

    int r = rand() % total_weight;
    for (int i = 0; i < total_scenes; i++) {
        if (r < weights[i]) return i;
        r -= weights[i];
    }

    return 0;
}