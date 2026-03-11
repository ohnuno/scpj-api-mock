'use strict';

/**
 * J-STAGE API 連携モジュール
 *
 * インターフェース定義（モック・本番共通）:
 *   引数: issn(string), since(ISO8601 string | null)
 *   戻り値: { [fieldName]: value } | null
 *
 * --- J-STAGE WebAPI 仕様メモ ---
 * エンドポイント: https://api.jstage.jst.go.jp/searchapi/do
 * サービス番号  : service=2（巻号一覧取得）
 * ISSNパラメータ: issn={Print ISSN} または eissn={Online ISSN}
 * レスポンス形式: XML（Atom形式）
 *
 * XMLの主要フィールド（巻号一覧取得レスポンス）:
 *   prism:issn      : Print ISSN
 *   prism:eIssn     : Online ISSN
 *   vols_title/en   : ジャーナルタイトル（英語）
 *   vols_title/ja   : ジャーナルタイトル（日本語）
 *   publisher/name  : 発行者名
 *   publisher/url   : 発行者URL
 *   pubyear         : 発行年
 *
 * OA関連フィールドは現在未追加（J-STAGEが追加予定・フィールド名未定）。
 * OA項目名確定後、以下の手順で本番実装に切り替える:
 *   1. mapping シートの map_016〜map_019 の D列を実フィールド名に更新
 *   2. F列を FALSE → TRUE に変更
 *   3. 下記モック実装を本番実装に置き換え
 *      （レスポンスがXMLのため xml2js 等のパーサーが必要）
 */

/**
 * J-STAGE からジャーナル情報を取得する（現在はモック実装）
 * @param {string} issn
 * @param {string|null} since - ISO8601 形式の日時（差分取得用、未使用）
 * @param {object} cfg - config オブジェクト（本番実装時に使用）
 * @returns {Promise<object|null>}
 */
async function fetchJstageData(issn, since, cfg) {
  // モック実装（J-STAGE OAフィールド名確定まで維持）
  // mapping シートで JSTAGE の有効フラグ（F列）が FALSE の間はこの値は使われない
  return {
    oa_type: 'MOCK_OA_TYPE',
    ir_available: 'MOCK_IR',
    policy_url: 'https://mock.example.com/policy',
    immediate_oa_flag: 'MOCK_FLAG',
    updated_at: new Date().toISOString(),
  };
}

// 本番実装雛形（OAフィールド名確定後に上記モックと差し替え）
// XMLレスポンスを扱うため xml2js 等のパーサー追加が必要（npm install xml2js）
//
// const xml2js = require('xml2js');
// const { fetchWithRetry } = require('./opf');
//
// async function fetchJstageData(issn, since, cfg) {
//   const base = cfg['JSTAGE_API_BASE_URL'];  // https://api.jstage.jst.go.jp/searchapi/do
//   const url = `${base}?service=2&issn=${encodeURIComponent(issn)}`;
//   try {
//     const res = await fetchWithRetry(url);
//     if (!res.ok) return null;
//     const xml = await res.text();
//     const parsed = await xml2js.parseStringPromise(xml, { explicitArray: false });
//     const entry = parsed?.feed?.entry;
//     if (!entry) return null;
//     // OAフィールド名が確定したらここで取得・返却する
//     return {
//       // 例: oa_type: entry['jstage:oaType'],
//       // ※ 実フィールド名は J-STAGE の仕様確定後に更新
//     };
//   } catch {
//     return null;
//   }
// }

module.exports = { fetchJstageData };
