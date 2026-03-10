'use strict';

/**
 * SCPJ列名 → API レスポンスキー名 のマッピング表
 * implementation_handoff.md の「フィールド名マッピング」セクションに基づく
 */
const COLUMN_TO_API_KEY = {
  'Journal_ID': 'journal_id',
  'Journal_Title': 'journal_title',
  'Journal_Title_Alias': 'journal_title_alias',
  'Journal_Title_En': 'journal_title_en',
  'Journal_URL': 'journal_url',
  'ISSN-L': 'issn_l',
  'PISSN': 'pissn',
  'EISSN': 'eissn',
  'DOAJ': 'doaj',
  'OAType': 'oa_type',
  'OAType_Notes': 'oa_type_notes',
  'Policy_URL': 'policy_url',
  'NonEmbargoOA': 'non_embargo_oa',
  'Society_ID': 'society_id',
  'Society_Name': 'society_name',
  'Society_Name_En': 'society_name_en',
  'Society_URL': 'society_url',
  'Society_Contact_URL': 'society_contact_url',
  'Meikan_URL': 'meikan_url',
  'Published_CopyrightOwner': 'published_copyright_owner',
  'Published_Licence': 'published_licence',
  'Published_Archivability': 'published_archivability',
  'Published_Location_IR': 'published_location_ir',
  'Published_Location_Author': 'published_location_author',
  'Published_Location_Funder': 'published_location_funder',
  'Published_Location_NonCommercial': 'published_location_non_commercial',
  'Published_Location_Others': 'published_location_others',
  'Published_Embargo_General(months)': 'published_embargo_general_months',
  'Published_Embargo_Funded(months)': 'published_embargo_funded_months',
  'Published_Terms_Copyright': 'published_terms_copyright',
  'Published_Terms_By': 'published_terms_by',
  'Published_Terms_Link': 'published_terms_link',
  'Published_Terms_Notes': 'published_terms_notes',
  'Accepted_CopyrightOwner': 'accepted_copyright_owner',
  'Accepted_Licence': 'accepted_licence',
  'Accepted_Archivability': 'accepted_archivability',
  'Accepted_Location_IR': 'accepted_location_ir',
  'Accepted_Location_Author': 'accepted_location_author',
  'Accepted_Location_Funder': 'accepted_location_funder',
  'Accepted_Location_NonCommercial': 'accepted_location_non_commercial',
  'Accepted_Location_Others': 'accepted_location_others',
  'Accepted_Embargo_General(months)': 'accepted_embargo_general_months',
  'Accepted_Embargo_Funded(months)': 'accepted_embargo_funded_months',
  'Accepted_Terms_Copyright': 'accepted_terms_copyright',
  'Accepted_Terms_By': 'accepted_terms_by',
  'Accepted_Terms_Link': 'accepted_terms_link',
  'Accepted_Terms_Notes': 'accepted_terms_notes',
  'Submitted_Archivability': 'submitted_archivability',
  'Submitted_Location_IR': 'submitted_location_ir',
  'Submitted_Location_Author': 'submitted_location_author',
  'Submitted_Location_Funder': 'submitted_location_funder',
  'Submitted_Location_NonCommercial': 'submitted_location_non_commercial',
  'Submitted_Location_Others': 'submitted_location_others',
  'Submitted_Terms_Notes': 'submitted_terms_notes',
  'Applicability': 'applicability',
  'Update': 'updated_at',
};

/**
 * SCPJ の行データ（ヘッダー配列 + 値配列）をAPIキー名のオブジェクトに変換する
 * @param {string[]} headers - SCPJ のヘッダー行
 * @param {string[]} row - SCPJ のデータ行
 * @returns {object} APIキー名をキーとしたオブジェクト
 */
function rowToApiObject(headers, row) {
  const obj = {};
  for (let i = 0; i < headers.length; i++) {
    const col = headers[i];
    const apiKey = COLUMN_TO_API_KEY[col] ?? toSnakeCase(col);
    obj[apiKey] = row[i] ?? '';
  }
  return obj;
}

/**
 * 未知の列名をスネークケースに変換するフォールバック
 * @param {string} str
 * @returns {string}
 */
function toSnakeCase(str) {
  return str
    .replace(/([A-Z])/g, '_$1')
    .replace(/[\s\-()]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_/, '')
    .toLowerCase();
}

/**
 * ISSN のハイフンを正規化する（ハイフンあり8文字形式に統一）
 * @param {string} issn
 * @returns {string} 例: "18827764" → "1882-7764"
 */
function normalizeISSN(issn) {
  const digits = issn.replace(/[^0-9Xx]/g, '');
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return issn;
}

module.exports = { COLUMN_TO_API_KEY, rowToApiObject, normalizeISSN };
