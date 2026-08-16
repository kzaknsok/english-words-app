#include <stdlib.h>
#include <time.h>
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
int* allocate_matrix(int size) {
    if (size <= 0) return NULL;
    return (int*)malloc((size_t)size * sizeof(int));
}

EMSCRIPTEN_KEEPALIVE
void free_matrix(int* ptr) {
    if (ptr != NULL) free(ptr);
}

EMSCRIPTEN_KEEPALIVE
void init_seed() {
    srand((unsigned int)time(NULL));
}

EMSCRIPTEN_KEEPALIVE
int select_next_scene(int current_index, int* matrix, int total_scenes) {
    if (total_scenes <= 1 || matrix == NULL) return 0;
    if (current_index < 0 || current_index >= total_scenes) return 0;

    int max_weight = -1;
    for (int i = 0; i < total_scenes; i++) {
        if (i == current_index) continue;
        int weight = matrix[current_index * total_scenes + i];
        if (weight > max_weight) max_weight = weight;
    }

    int candidate_count = 0;
    int* candidates = (int*)malloc((size_t)total_scenes * sizeof(int));
    if (!candidates) return (current_index + 1) % total_scenes;

    for (int i = 0; i < total_scenes; i++) {
        if (i == current_index) continue;
        if (matrix[current_index * total_scenes + i] == max_weight) {
            candidates[candidate_count++] = i;
        }
    }

    int result = (candidate_count > 0)
        ? candidates[rand() % candidate_count]
        : (current_index + 1) % total_scenes;

    free(candidates);
    return result;
}
