'use strict';

/**
 * J-STAGE API 連携モジュール
 *
 * インターフェース定義（モック・本番共通）:
 *   引数: issn(string), since(ISO8601 string | null)
 *   戻り値: { [fieldName]: value } | null
 *
 * J-STAGE API の実装後は以下の手順で本番実装に差し替える:
 *   1. 実際の J-STAGE API のフィールド名を確認する
 *   2. mapping シートの map_016〜map_019 の D列を実フィールド名に更新し、F列を TRUE に変更する
 *   3. 下記のモック実装を本番実装に置き換える（コメントアウトされた本番実装を参照）
 */

/**
 * J-STAGE からジャーナル情報を取得する（現在はモック実装）
 * @param {string} issn
 * @param {string|null} since - ISO8601 形式の日時（差分取得用、未使用）
 * @param {object} cfg - config オブジェクト（本番実装時に使用）
 * @returns {Promise<object|null>}
 */
async function fetchJstageData(issn, since, cfg) {
  // モック実装（J-STAGE API 実装前）
  // mapping シートで JSTAGE の有効フラグ（F列）が FALSE の間はこの値は使われない
  return {
    oa_type: 'MOCK_OA_TYPE',
    ir_available: 'MOCK_IR',
    policy_url: 'https://mock.example.com/policy',
    immediate_oa_flag: 'MOCK_FLAG',
    updated_at: new Date().toISOString(),
  };
}

// 本番実装（J-STAGE API 実装後に上記モックと差し替え）
// フィールド名は mapping シートの D列に合わせて更新すること
//
// async function fetchJstageData(issn, since, cfg) {
//   const { fetchWithRetry } = require('./opf');
//   const base = cfg['JSTAGE_API_BASE_URL'];
//   const url = `${base}/journals?issn=${encodeURIComponent(issn)}${since ? `&updated_after=${since}` : ''}`;
//   try {
//     const res = await fetchWithRetry(url);
//     if (!res.ok) return null;
//     return res.json();
//   } catch {
//     return null;
//   }
// }

module.exports = { fetchJstageData };
