#include <emscripten.h>
#include <stdlib.h>
#include <math.h>

#define MAX_SCENES 1000

// 各シーンの学習統計データ
typedef struct {
    int id;
    float avg_response_time; // 平均応答時間（秒）
    int clear_count;          // クリア回数
    int miss_count;           // ミス回数
} SceneStat;

static SceneStat g_scenes[MAX_SCENES];
static int g_total_scenes = 0;

// 初期化（JSから総シーン数を受け取る）
EMSCRIPTEN_KEEPALIVE
void init_engine(int total_scenes) {
    g_total_scenes = total_scenes;
    for (int i = 0; i < total_scenes; i++) {
        g_scenes[i].id = i;
        g_scenes[i].avg_response_time = 0.0f;
        g_scenes[i].clear_count = 0;
        g_scenes[i].miss_count = 0;
    }
}

// 次の出題インデックスを計算するアダプティブ・コアロジック
EMSCRIPTEN_KEEPALIVE
int get_next_recommended_scene(int current_index, float response_time_sec, int is_correct) {
    if (g_total_scenes <= 1) return 0;

    // 1. 今回の成績を更新
    SceneStat *curr = &g_scenes[current_index];
    if (is_correct) {
        curr->clear_count++;
        if (curr->avg_response_time == 0.0f) {
            curr->avg_response_time = response_time_sec;
        } else {
            // 移動平均で応答時間を更新
            curr->avg_response_time = curr->avg_response_time * 0.7f + response_time_sec * 0.3f;
        }
    } else {
        curr->miss_count++;
    }

    // 2. 次の出題ロジック
    // A. 間違えた、または応答に3秒以上かかった（迷った）場合：
    //    近隣のシーン（連想・類似構文）に留まって定着を図る
    if (!is_correct || response_time_sec > 3.0f) {
        int next = (current_index + 1) % g_total_scenes;
        return next;
    }

    // B. 超高速（2秒未満）で正解した場合：
    //    「習熟済み」とみなし、クリア回数が少ない未知のシーンへジャンプする
    int candidate = -1;
    int min_clears = 999999;

    for (int i = 0; i < g_total_scenes; i++) {
        if (i == current_index) continue;
        if (g_scenes[i].clear_count < min_clears) {
            min_clears = g_scenes[i].clear_count;
            candidate = i;
        }
    }

    return (candidate != -1) ? candidate : (current_index + 1) % g_total_scenes;
}