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
static float g_matrix[MAX_SCENES][MAX_SCENES]; // JSから流し込まれる類似度マトリクス
static int g_total_scenes = 0;

// 1. 初期化関数（JSから総シーン数を受け取る）
EMSCRIPTEN_KEEPALIVE
void init_engine(int total_scenes) {
    g_total_scenes = (total_scenes > MAX_SCENES) ? MAX_SCENES : total_scenes;
    
    for (int i = 0; i < g_total_scenes; i++) {
        g_scenes[i].id = i;
        g_scenes[i].avg_response_time = 0.0f;
        g_scenes[i].clear_count = 0;
        g_scenes[i].miss_count = 0;
        
        for (int j = 0; j < g_total_scenes; j++) {
            g_matrix[i][j] = 0.0f;
        }
    }
}

// 2. 類似度マトリクスのセル設定関数（JSから単語・構文類似度をセット）
EMSCRIPTEN_KEEPALIVE
void set_matrix_cell(int row, int col, float value) {
    if (row >= 0 && row < MAX_SCENES && col >= 0 && col < MAX_SCENES) {
        g_matrix[row][col] = value;
    }
}

// 3. 次の出題インデックスを計算するコアロジック（_select_next_scene としてエクスポート）
EMSCRIPTEN_KEEPALIVE
int select_next_scene(int current_index, float response_time_sec, int is_correct) {
    if (g_total_scenes <= 1) return 0;

    // 1. 今回の成績を更新
    SceneStat *curr = &g_scenes[current_index];
    if (is_correct) {
        curr->clear_count++;
        if (curr->avg_response_time == 0.0f) {
            curr->avg_response_time = response_time_sec;
        } else {
            // 移動平均で応答時間を更新（直近の解答速度を30%反映）
            curr->avg_response_time = curr->avg_response_time * 0.7f + response_time_sec * 0.3f;
        }
    } else {
        curr->miss_count++;
    }

    // 2. 次の出題ロジック
    // A. 間違えた、または応答に3秒以上かかった（迷った）場合：
    //    類似度（マトリクス）が最も高いシーンを選び、連想・類似構文で定着を図る
    if (!is_correct || response_time_sec > 3.0f) {
        int best_similar_idx = -1;
        float max_similarity = -1.0f;

        for (int i = 0; i < g_total_scenes; i++) {
            if (i == current_index) continue;
            if (g_matrix[current_index][i] > max_similarity) {
                max_similarity = g_matrix[current_index][i];
                best_similar_idx = i;
            }
        }

        // 類似データがあればそこへ、なければ次の番号へ
        if (best_similar_idx != -1 && max_similarity > 0.0f) {
            return best_similar_idx;
        } else {
            return (current_index + 1) % g_total_scenes;
        }
    }

    // B. 超高速（2秒未満）かつ正解した場合：
    //    「習熟済み」とみなし、クリア回数が少ない未マスターのシーンへジャンプする
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