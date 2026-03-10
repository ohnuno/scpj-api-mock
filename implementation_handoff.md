# SCPJ API & J-STAGE連携システム 実装引継ぎドキュメント

## 概要

本ドキュメントは、SCPJスプレッドシートのデータを外部向けに配信するAPIと、J-STAGE APIと連携してデータを補完するバッチ処理システムの実装引継ぎ用ドキュメントです。

---

## システム全体構成

```
[SCPJスプレッドシート（Google Sheets）]
        ↕ Google Sheets API（読み込み・補完書き込み）
[変数・マッピング管理スプレッドシート（Google Sheets）]
        ↕ Google Sheets API（読み込み・LAST_BATCH_RUN書き込み）
[GitHub Actions（毎日定期実行）]
    ├── OPF API    → SCPJへの差分補完
    ├── J-STAGE API → SCPJへの差分補完（実装後）
    └── 差異レポート → 管理者メール送信（SendGrid）
        ↓
[静的JSON再生成 → GitHub Pagesにコミット・プッシュ]
        ↓
[GitHub Pages（外部向けAPI）]
    ├── GET /retrieve
    ├── GET /retrieve_by_id
    └── GET /object_ids
```

---

## 実装ステップとチェックポイント

Claude Codeと管理者が協働して以下の順序で進めること。各フェーズの完了基準を必ず確認してから次に進む。

### Phase 0：事前準備（管理者が実施）

**作業内容：**
1. テスト用SCPJスプレッドシートを本番SSからコピーして作成する
2. 変数・マッピング管理スプレッドシートを新規作成する（シート名：`config`・`mapping`）
3. Google Cloudでサービスアカウントを作成し、JSONキーを発行する
4. 上記3つのスプレッドシートにサービスアカウントを「編集者」として共有する
5. `config`シートに初期値を入力する（本ドキュメントの「変数管理スプレッドシート構成」参照）
6. GitHubにリポジトリを作成し、GitHub Pagesを有効化する（`gh-pages`ブランチを配信元に設定）
7. GitHub SecretsにサービスアカウントJSONキーと`CONFIG_SHEET_ID`を登録する（後述）

**完了基準：**
- サービスアカウントのJSONキーが手元にある
- `config`シートに全キーが入力されている
- `USE_TEST_MODE`が`true`になっている
- GitHub Pagesが有効化されており、URLが確定している

---

### Phase 1：Google Sheets API疎通確認

**作業内容：**
- サービスアカウントキーを使ってSheets APIを叩く最小スクリプトをローカルで実装・実行する
- `config`シートの全キーを読み込んで出力するだけのスクリプト

**完了基準：**
- ローカル実行で`config`シートの全変数が正しく読み込めること
- テスト用SCPJのデータ（全件）が読み込めること

---

### Phase 2：外部向けAPI実装（静的JSON生成）

**作業内容：**
- SCPJの全データを静的JSONに変換するスクリプトを実装する
- `/retrieve`・`/retrieve_by_id`・`/object_ids`のエンドポイントを実装する
- GitHub Pagesへのデプロイワークフロー（`deploy.yml`）を実装する

**完了基準：**
- `GET /retrieve?issn=xxxx-xxxx` が正しいJSONを返すこと
- `GET /retrieve_by_id?id=xxxx` が1件のデータを返すこと
- `GET /object_ids` が全Journal_IDの配列を返すこと
- `GET /object_ids?updated_after=2025-01-01T00:00:00Z` が絞り込み結果を返すこと

---

### Phase 3：OPF連携バッチ実装

**作業内容：**
- OPF APIからISSNでデータを取得する関数を実装する
- マッピングシートに基づいてSCPJへの補完・差異チェックを行うバッチを実装する
- バッチワークフロー（`batch.yml`）を実装する
- `workflow_dispatch`（手動実行）でテスト環境（`USE_TEST_MODE=true`）の動作確認をする

**完了基準：**
- テスト用SCPJの空欄フィールドが正しく補完されること
- 差異が存在する場合にメールレポートが届くこと
- `LAST_BATCH_RUN`が正しく更新されること
- 2回目実行時に差分のみ処理されること（初回と処理件数が変わること）

---

### Phase 4：定期実行設定と動作確認

**作業内容：**
- `batch.yml`のCronスケジュール（毎日UTC15:00）が正しく設定されていることを確認する
- 翌日の自動実行ログをGitHub Actionsで確認する

**完了基準：**
- 自動実行のActionsログが確認できること
- `LAST_BATCH_RUN`が自動更新されていること

---

### Phase 5：本番環境への切り替え

**作業内容：**
- `config`シートの`USE_TEST_MODE`を`false`に変更する
- `SCPJ_SHEET_ID`に本番用スプレッドシートIDが設定されていることを確認する
- 1週間程度監視して問題がないことを確認する

**完了基準：**
- 本番SCPJのデータが外部向けAPIに正しく反映されること
- 差異レポートが管理者に届いていること

---

### Phase 6：J-STAGE API有効化（J-STAGE実装後）

**作業内容：**
- J-STAGE APIの実際のフィールド名を確認する
- `mapping`シートのD列を実フィールド名に更新し、F列を`TRUE`に変更する
- テスト環境で動作確認する

**完了基準：**
- J-STAGE由来の補完が正しく動作すること

---

## 実行環境：GitHub Actions + Pages

### ディレクトリ構成

```
scpj-api/
├── src/
│   ├── api/
│   │   ├── generate.js       # 静的JSON生成（全件・エンドポイント別）
│   │   ├── retrieve.js       # /retrieve のフィルタ・ページネーションロジック
│   │   ├── retrieve_by_id.js # /retrieve_by_id のロジック
│   │   └── object_ids.js     # /object_ids のロジック
│   ├── batch/
│   │   ├── index.js          # バッチエントリポイント
│   │   ├── opf.js            # OPF API連携
│   │   ├── jstage.js         # J-STAGE API連携（モック含む）
│   │   ├── diff.js           # 差異チェック・記号正規化
│   │   ├── report.js         # メールレポート生成・送信（SendGrid）
│   │   └── sheets.js         # Google Sheets API操作
│   └── utils/
│       ├── config.js         # 変数管理SS読み込み
│       ├── mapping.js        # マッピングSS読み込み・resolveFieldPath
│       └── normalize.js      # フィールド名変換（SCPJ列名→APIキー名）
├── docs/                     # GitHub Pagesの配信ディレクトリ
│   └── data/
│       ├── all.json          # 全件JSON（バッチ後に再生成）
│       └── index.json        # ID一覧（object_ids用）
├── .github/
│   └── workflows/
│       ├── batch.yml         # バッチ定期実行（毎日）＋静的JSON再生成
│       └── deploy.yml        # 手動デプロイ（静的JSON再生成のみ）
├── package.json
└── .env.example              # 環境変数のサンプル（実際の値はGitHub Secretsで管理）
```

### GitHub Secretsの登録

GitHub リポジトリの Settings → Secrets and variables → Actions から登録する。

| シークレット名 | 内容 |
|-------------|------|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | サービスアカウントのJSONキー（ファイル全体をそのまま貼り付け） |
| `CONFIG_SHEET_ID` | 変数管理スプレッドシートのID |
| `SENDGRID_API_KEY` | SendGridのAPIキー（メール送信用） |

### `batch.yml`（バッチ定期実行）

```yaml
name: SCPJ Batch

on:
  schedule:
    - cron: '0 15 * * *'   # 毎日 UTC 15:00（JST 深夜0時）
  workflow_dispatch:         # 手動実行（テスト・緊急時用）

jobs:
  batch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - run: npm ci

      - name: Run batch
        run: node src/batch/index.js
        env:
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY }}
          CONFIG_SHEET_ID: ${{ secrets.CONFIG_SHEET_ID }}
          SENDGRID_API_KEY: ${{ secrets.SENDGRID_API_KEY }}

      - name: Generate static JSON
        run: node src/api/generate.js
        env:
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY }}
          CONFIG_SHEET_ID: ${{ secrets.CONFIG_SHEET_ID }}

      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs
          publish_branch: gh-pages
```

### `deploy.yml`（静的JSON再生成のみ・手動）

```yaml
name: Deploy Static JSON

on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - name: Generate static JSON
        run: node src/api/generate.js
        env:
          GOOGLE_SERVICE_ACCOUNT_KEY: ${{ secrets.GOOGLE_SERVICE_ACCOUNT_KEY }}
          CONFIG_SHEET_ID: ${{ secrets.CONFIG_SHEET_ID }}
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./docs
          publish_branch: gh-pages
```

### Google Sheets APIへのアクセス（Node.js環境）

GitHub Actions（Node.js環境）では`googleapis`ライブラリを使用できる。

```javascript
const { google } = require('googleapis');

async function getAuthClient() {
  const key = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth.getClient();
}

async function sheetsGet(auth, spreadsheetId, range) {
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return res.data.values || [];
}
```

### Sheets APIへの書き込み（batchUpdateを使用）

4,000件を個別に書き込むとAPI制限（1分あたり約300リクエスト）を超過する。必ず`batchUpdate`で一括書き込みすること。

```javascript
async function sheetsBatchUpdate(auth, spreadsheetId, updates) {
  // updates は [{range: 'Sheet1!C5', values: [['新しい値']]}, ...] の配列
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });
}

// 使用例：補完・更新が必要なセルをまとめてからbatchUpdateを1回呼び出す
const updates = [];
// ... マッチング処理の中で updates に追加 ...
if (updates.length > 0) {
  await sheetsBatchUpdate(auth, scpjSheetId, updates);
}
```

### メール送信（SendGrid）

```javascript
async function sendReport(apiKey, to, from, subject, body) {
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [{ type: 'text/plain', value: body }],
    }),
  });
  if (!res.ok) throw new Error(`SendGrid error: ${res.status}`);
}
```

### エラーハンドリング方針

- バッチ処理はtry-catchで全体を囲み、エラー発生時もメールでエラー内容を管理者に通知する
- `LAST_BATCH_RUN`は**バッチ正常完了時のみ**更新する（途中失敗時は更新しない）
- OPF/J-STAGE APIが5xx系を返した場合は3回リトライ（指数バックオフ）し、それでも失敗したらエラーメールを送信してバッチを終了する

```javascript
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status < 500) throw new Error(`Client error: ${res.status}`); // リトライしない
      throw new Error(`Server error: ${res.status}`);
    } catch (e) {
      if (i === maxRetries - 1) throw e;
    }
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); // 1s, 2s, 4s
  }
}
```

---

## 変数管理スプレッドシート構成

### `config`シートへのアクセス方法

`CONFIG_SHEET_ID`のみGitHub Secretsに登録し、環境変数経由で取得する。それ以外の変数はすべて`config`シートから動的に読み込む。

```javascript
// CONFIG_SHEET_ID は環境変数から取得（コードにハードコードしない）
const CONFIG_SHEET_ID = process.env.CONFIG_SHEET_ID;

async function getConfig(auth, configSheetId) {
  const rows = await sheetsGet(auth, configSheetId, 'config!A:B');
  const config = {};
  for (const [key, value] of rows) {
    if (key) config[key] = value;
  }
  return config;
}
```

### `config`シートの全キー一覧

| A列（キー） | B列（値） | 用途 |
|------------|---------|------|
| `SCPJ_SHEET_ID` | スプレッドシートID | 本番SCPJ SS |
| `SCPJ_SHEET_NAME` | シート名 | 例：`Sheet1` |
| `TEST_SHEET_ID` | スプレッドシートID | テスト用SCPJ SS |
| `TEST_SHEET_NAME` | シート名 | |
| `JSTAGE_API_BASE_URL` | J-STAGE APIのベースURL | 追加予定 |
| `JSTAGE_API_VERSION` | APIバージョン | 追加予定 |
| `OPF_RETRIEVE_URL` | `https://api.openpolicyfinder.jisc.ac.uk/retrieve` | |
| `OPF_RETRIEVE_BY_ID_URL` | `https://api.openpolicyfinder.jisc.ac.uk/retrieve_by_id` | |
| `OPF_OBJECT_IDS_URL` | `https://api.openpolicyfinder.jisc.ac.uk/object_ids` | |
| `REPORT_EMAIL_TO` | 管理者メールアドレス | |
| `REPORT_EMAIL_FROM` | 送信元メールアドレス | |
| `LAST_BATCH_RUN` | ISO8601形式の日時文字列 | バッチ正常完了時のみ自動更新 |
| `MATCH_KEY_SCPJ` | `ISSN-L` | マッチングキー（変更可能） |
| `MATCH_KEY_JSTAGE` | `issn` | J-STAGE側マッチングキー（変更可能） |
| `USE_TEST_MODE` | `true` / `false` | テストモード切替 |

### `mapping`シートの構造とコードからの参照

| A列（マッピングID） | B列（SCPJ列名） | C列（データソース） | D列（ソースフィールドパス） | E列（変換ルール） | F列（有効フラグ） | G列（備考） |
|-------------------|--------------|-------------------|--------------------------|----------------|----------------|-----------|
| `map_001` | `DOAJ` | `OPF` | `listed_in_doaj` | `yes→TRUE, no→FALSE` | `TRUE` | |
| `map_002` | `Journal_URL` | `OPF` | `url` | なし | `TRUE` | |
| `map_003` | `Policy_URL` | `OPF` | `publisher_policy[].urls[type=policy].url` | 最初のpolicyタイプを使用 | `TRUE` | |
| `map_004` | `Published_CopyrightOwner` | `OPF` | `publisher_policy[].permitted_oa[version=published].copyright_owner` | article_version=publishedで絞込 | `TRUE` | |
| `map_005` | `Published_Licence` | `OPF` | `publisher_policy[].permitted_oa[version=published].license[0].license` | article_version=publishedで絞込 | `TRUE` | |
| `map_006` | `Published_Archivability` | `OPF` | `publisher_policy[].open_access_prohibited` | `yes→不可, no→可` | `TRUE` | |
| `map_007` | `Published_Location_IR` | `OPF` | `publisher_policy[].permitted_oa[version=published].location.location` | `institutional_repository`含む場合TRUE | `TRUE` | |
| `map_008` | `Published_Location_Author` | `OPF` | `publisher_policy[].permitted_oa[version=published].location.location` | `authors_homepage`含む場合TRUE | `TRUE` | |
| `map_009` | `Accepted_CopyrightOwner` | `OPF` | `publisher_policy[].permitted_oa[version=accepted].copyright_owner` | article_version=acceptedで絞込 | `TRUE` | |
| `map_010` | `Accepted_Licence` | `OPF` | `publisher_policy[].permitted_oa[version=accepted].license[0].license` | article_version=acceptedで絞込 | `TRUE` | |
| `map_011` | `Accepted_Archivability` | `OPF` | `publisher_policy[].open_access_prohibited` | `yes→不可, no→可` | `TRUE` | |
| `map_012` | `Accepted_Location_IR` | `OPF` | `publisher_policy[].permitted_oa[version=accepted].location.location` | `institutional_repository`含む場合TRUE | `TRUE` | |
| `map_013` | `Accepted_Location_Author` | `OPF` | `publisher_policy[].permitted_oa[version=accepted].location.location` | `authors_homepage`含む場合TRUE | `TRUE` | |
| `map_014` | `Submitted_Archivability` | `OPF` | `publisher_policy[].open_access_prohibited` | `yes→不可, no→可` | `TRUE` | |
| `map_015` | `Submitted_Location_IR` | `OPF` | `publisher_policy[].permitted_oa[version=submitted].location.location` | `institutional_repository`含む場合TRUE | `TRUE` | |
| `map_016` | `OAType` | `JSTAGE` | `oa_type` | **仮フィールド名** | `FALSE` | J-STAGE実装後に有効化・フィールド名修正要 |
| `map_017` | `Published_Location_IR` | `JSTAGE` | `ir_available` | **仮フィールド名** | `FALSE` | J-STAGE実装後に有効化・フィールド名修正要 |
| `map_018` | `Policy_URL` | `JSTAGE` | `policy_url` | **仮フィールド名** | `FALSE` | J-STAGE実装後に有効化・フィールド名修正要 |
| `map_019` | `NonEmbargoOA` | `JSTAGE` | `immediate_oa_flag` | **仮フィールド名** | `FALSE` | J-STAGE実装後に有効化・フィールド名修正要 |

```javascript
async function getMapping(auth, configSheetId) {
  const rows = await sheetsGet(auth, configSheetId, 'mapping!A:G');
  const [_header, ...dataRows] = rows;
  return dataRows
    .filter(row => row[5] === 'TRUE')
    .map(row => ({
      id: row[0],
      scpjColumn: row[1],
      source: row[2],       // 'OPF' or 'JSTAGE'
      sourcePath: row[3],
      transform: row[4],
      notes: row[6],
    }));
}
```

---

## 外部向けAPI仕様

### 設計方針

Open Policy Finder（OPF）APIのエンドポイント構成に準拠する。SCPJの全55列を公開する。GitHub Pagesで静的JSONファイルを配信し、GitHub Actionsのバッチ後に自動更新する。

### OPF APIへのリクエスト仕様

ISSNを使ってOPFからジャーナル情報を取得する際は`/retrieve`エンドポイントを使用する。

```javascript
async function fetchOPFByISSN(baseUrl, issn) {
  // ISSNのハイフンを正規化（ハイフンあり形式に統一）
  const normalized = issn.replace(/[^0-9Xx]/g, '').replace(/(.{4})(.{4})/, '$1-$2');
  const url = `${baseUrl}?issn=${encodeURIComponent(normalized)}`;
  const res = await fetchWithRetry(url);
  if (!res.ok) return null;
  const data = await res.json();
  // items配列の最初の1件を使用。publisher_policyが複数ある場合も[0]を使用する
  return data.items?.[0] ?? null;
}
```

### エンドポイント一覧

#### 1. オブジェクト検索

```
GET /retrieve
```

| パラメータ | 型 | 説明 |
|-----------|---|------|
| `issn` | string | ISSN（ハイフンあり・なし両対応） |
| `title` | string | ジャーナルタイトル（部分一致） |
| `society_id` | string | 学会ID |
| `oa_type` | string | OAタイプ |
| `page` | integer | ページ番号（デフォルト：1） |
| `per_page` | integer | 1ページあたり件数（デフォルト：20、最大：100） |

**レスポンス：**

```json
{
  "total": 150,
  "page": 1,
  "per_page": 20,
  "items": [
    {
      "journal_id": "J001",
      "journal_title": "情報処理学会論文誌",
      "issn_l": "1882-7764",
      "pissn": "1882-7764",
      "eissn": "1882-7764",
      "oa_type": "ゴールドOA",
      "policy_url": "https://example.com/policy",
      "updated_at": "2025-01-15T00:00:00Z"
    }
  ]
}
```

#### 2. IDによるオブジェクト取得

```
GET /retrieve_by_id?id={journal_id}
```

レスポンスは全55フィールドを含む1オブジェクト。

#### 3. オブジェクトID一覧

```
GET /object_ids
```

| パラメータ | 型 | 説明 |
|-----------|---|------|
| `updated_after` | string | ISO8601形式。指定日時以降に`updated_at`が新しいIDのみ返す |

```json
{
  "ids": ["J001", "J002", "J003"]
}
```

### フィールド名マッピング（SCPJ列名 → APIレスポンスキー名）

| SCPJ列名 | APIキー名 |
|---------|---------|
| `Journal_ID` | `journal_id` |
| `Journal_Title` | `journal_title` |
| `Journal_Title_Alias` | `journal_title_alias` |
| `Journal_Title_En` | `journal_title_en` |
| `Journal_URL` | `journal_url` |
| `ISSN-L` | `issn_l` |
| `PISSN` | `pissn` |
| `EISSN` | `eissn` |
| `DOAJ` | `doaj` |
| `OAType` | `oa_type` |
| `OAType_Notes` | `oa_type_notes` |
| `Policy_URL` | `policy_url` |
| `NonEmbargoOA` | `non_embargo_oa` |
| `Society_ID` | `society_id` |
| `Society_Name` | `society_name` |
| `Society_Name_En` | `society_name_en` |
| `Society_URL` | `society_url` |
| `Society_Contact_URL` | `society_contact_url` |
| `Meikan_URL` | `meikan_url` |
| `Published_CopyrightOwner` | `published_copyright_owner` |
| `Published_Licence` | `published_licence` |
| `Published_Archivability` | `published_archivability` |
| `Published_Location_IR` | `published_location_ir` |
| `Published_Location_Author` | `published_location_author` |
| `Published_Location_Funder` | `published_location_funder` |
| `Published_Location_NonCommercial` | `published_location_non_commercial` |
| `Published_Location_Others` | `published_location_others` |
| `Published_Embargo_General(months)` | `published_embargo_general_months` |
| `Published_Embargo_Funded(months)` | `published_embargo_funded_months` |
| `Published_Terms_Copyright` | `published_terms_copyright` |
| `Published_Terms_By` | `published_terms_by` |
| `Published_Terms_Link` | `published_terms_link` |
| `Published_Terms_Notes` | `published_terms_notes` |
| `Accepted_CopyrightOwner` | `accepted_copyright_owner` |
| `Accepted_Licence` | `accepted_licence` |
| `Accepted_Archivability` | `accepted_archivability` |
| `Accepted_Location_IR` | `accepted_location_ir` |
| `Accepted_Location_Author` | `accepted_location_author` |
| `Accepted_Location_Funder` | `accepted_location_funder` |
| `Accepted_Location_NonCommercial` | `accepted_location_non_commercial` |
| `Accepted_Location_Others` | `accepted_location_others` |
| `Accepted_Embargo_General(months)` | `accepted_embargo_general_months` |
| `Accepted_Embargo_Funded(months)` | `accepted_embargo_funded_months` |
| `Accepted_Terms_Copyright` | `accepted_terms_copyright` |
| `Accepted_Terms_By` | `accepted_terms_by` |
| `Accepted_Terms_Link` | `accepted_terms_link` |
| `Accepted_Terms_Notes` | `accepted_terms_notes` |
| `Submitted_Archivability` | `submitted_archivability` |
| `Submitted_Location_IR` | `submitted_location_ir` |
| `Submitted_Location_Author` | `submitted_location_author` |
| `Submitted_Location_Funder` | `submitted_location_funder` |
| `Submitted_Location_NonCommercial` | `submitted_location_non_commercial` |
| `Submitted_Location_Others` | `submitted_location_others` |
| `Submitted_Terms_Notes` | `submitted_terms_notes` |
| `Applicability` | `applicability` |
| `Update` | `updated_at` |

---

## J-STAGE連携バッチ処理

### 処理フロー

```
1. 変数管理SSから設定読み込み（LAST_BATCH_RUN等）
2. OPF / J-STAGE APIから前回実行以降に更新された雑誌情報を取得
   ├── 初回（LAST_BATCH_RUN が空）：全件取得
   └── 2回目以降：LAST_BATCH_RUN以降に更新された雑誌のみ取得
3. SCPJのISSN一覧と照合（マッチングキーはMATCH_KEY_SCPJで設定）
4. マッチした雑誌について：
   a. マッピングシートのFLAG=TRUEのマッピングのみ処理
   b. SCPJの対象フィールドが空欄 → ソースの値で補完（updatesリストに追加）
   c. SCPJの対象フィールドに値あり → 差異チェック（記号除去後に比較）
   d. 差異があればレポートリストに追加
5. batchUpdateで補完内容を一括書き込み（API呼び出しを最小化）
6. 差異がある場合、SendGrid経由で管理者にメールレポート送信
7. 変数管理SSのLAST_BATCH_RUNを現在日時で更新（正常完了時のみ）
8. 静的JSON再生成 → gh-pagesブランチにコミット・プッシュ
```

### 差異チェックの記号除去ルール

```javascript
function normalizeForComparison(str) {
  if (!str) return '';
  return str
    .toString()
    .replace(/[・･、。，．]/g, '')
    .replace(/[,.\-_/\\|]/g, '')
    .replace(/[　\s]+/g, ' ')
    .trim()
    .toLowerCase();
}

function hasDifference(scpjValue, sourceValue) {
  return normalizeForComparison(scpjValue) !== normalizeForComparison(sourceValue);
}
```

### 差異レポートの形式

```
件名：[SCPJ] J-STAGE連携バッチ 差異レポート - YYYY-MM-DD

バッチ実行日時：YYYY-MM-DD HH:MM:SS
処理対象件数：XXX件（うち補完実施：XX件）
差異検出件数：XX件

---
差異一覧：

■ Journal_ID: J001 / ジャーナル名: 情報処理学会論文誌
  フィールド：OAType
  SCPJ現在値：ゴールドOA
  J-STAGE値：Gold OA
  ※記号除去後の比較で差異を検出

■ Journal_ID: J002 / ジャーナル名: XXX
  フィールド：Policy_URL
  SCPJ現在値：https://example.com/old-policy
  J-STAGE値：https://example.com/new-policy

---
このメールはSCPJ自動バッチシステムから送信されています。
差異が検出されたフィールドはSCPJを手動で確認・修正してください。
```

### J-STAGE仮実装

J-STAGE APIの実装前はモック関数で動作確認する。本番差し替えはモック関数を実装関数に置き換えるだけでよいようにインターフェースを統一すること。

```javascript
// インターフェース定義（モック・本番共通）
// 引数: issn(string), since(ISO8601 string | null)
// 戻り値: { [fieldName]: value } | null

// モック実装（J-STAGE API実装前）
async function fetchJstageData(issn, since) {
  return {
    oa_type: 'MOCK_OA_TYPE',
    ir_available: 'MOCK_IR',
    policy_url: 'https://mock.example.com/policy',
    immediate_oa_flag: 'MOCK_FLAG',
    updated_at: new Date().toISOString(),
  };
}

// 本番実装（J-STAGE API実装後に差し替え。フィールド名はmappingシートに合わせて更新）
// async function fetchJstageData(issn, since) {
//   const url = `${cfg['JSTAGE_API_BASE_URL']}/journals?issn=${issn}${since ? `&updated_after=${since}` : ''}`;
//   const res = await fetchWithRetry(url);
//   if (!res.ok) return null;
//   return res.json();
// }
```

---

## 実装上の注意事項

### OPFフィールドパスの動的解決（`resolveFieldPath`）

マッピングシートのD列に記載したパス文字列を実行時に解釈してOPFレスポンスからフィールド値を取得する。以下の記法を`utils/mapping.js`に実装すること。

**対応する記法：**

| 記法例 | 意味 |
|--------|------|
| `url` | トップレベルのフィールド |
| `publisher_policy[].urls` | 配列全体を取得（後続処理で使用） |
| `publisher_policy[].urls[type=policy].url` | `type`が`policy`の要素の`url` |
| `publisher_policy[].permitted_oa[version=published].copyright_owner` | `article_version`配列に`published`を含む要素の`copyright_owner` |
| `publisher_policy[].permitted_oa[version=published].license[0].license` | 上記の`license`配列の先頭要素の`license`フィールド |

```javascript
function resolveFieldPath(obj, pathStr) {
  const segments = pathStr.split('.');
  let current = obj;

  for (const seg of segments) {
    if (current == null) return undefined;

    // key[field=value] 形式：配列から条件に合う要素を1件取得
    const filterMatch = seg.match(/^(\w+)\[(\w+)=(\w+)\]$/);
    // key[N] 形式：配列のN番目の要素を取得
    const indexMatch = seg.match(/^(\w+)\[(\d+)\]$/);
    // key[] 形式：配列全体を返す
    const arrayAll = seg.match(/^(\w+)\[\]$/);

    if (filterMatch) {
      const [, key, filterField, filterValue] = filterMatch;
      const arr = current[key];
      if (!Array.isArray(arr)) return undefined;
      current = arr.find(item =>
        Array.isArray(item[filterField])
          ? item[filterField].includes(filterValue)
          : item[filterField] === filterValue
      );
    } else if (indexMatch) {
      const [, key, idx] = indexMatch;
      const arr = current[key];
      current = Array.isArray(arr) ? arr[Number(idx)] : undefined;
    } else if (arrayAll) {
      current = current[arrayAll[1]];
    } else {
      current = current[seg];
    }
  }
  return current;
}
```

**変換ルール（E列）の適用：**

E列の変換ルールは以下のパターンを実装すること。値が取得できなかった場合は`null`を返し、補完・差異チェックの対象外とする。

```javascript
function applyTransform(value, transformRule) {
  if (value == null) return null;
  if (!transformRule || transformRule === 'なし') return value;

  // "yes→TRUE, no→FALSE" 形式
  const mappings = transformRule.split(',').map(s => s.trim());
  for (const mapping of mappings) {
    const [from, to] = mapping.split('→').map(s => s.trim());
    if (String(value).toLowerCase() === from.toLowerCase()) return to;
  }
  // "institutional_repository 含む場合TRUE" 形式
  if (transformRule.includes('含む場合TRUE')) {
    const keyword = transformRule.replace('含む場合TRUE', '').trim();
    return Array.isArray(value)
      ? value.includes(keyword) ? 'TRUE' : ''
      : String(value).includes(keyword) ? 'TRUE' : '';
  }
  return value;
}
```

### テストモードの切り替え

`USE_TEST_MODE = true` の場合：
- `TEST_SHEET_ID` / `TEST_SHEET_NAME` を参照する
- メール送信をスキップする（または`REPORT_EMAIL_TO`のテスト用アドレスにのみ送信）
- 静的JSONの出力先をテスト用（例：`docs/test/`）に切り替える

### J-STAGEマッピング有効化手順

1. J-STAGE APIの実装完了後、実際のフィールド名を確認する
2. `mapping`シートで`map_016`〜`map_019`の：
   - D列（ソースフィールドパス）を実際のフィールド名に更新
   - F列（有効フラグ）を`FALSE`→`TRUE`に変更
3. コードの変更は不要（マッピングシートの変更のみで対応可能）

---

## README.md に含める項目（実装完了後にClaude Codeが作成）

実装完了後、以下の項目を網羅したREADME.mdを作成すること。

### 一般的なGitHub READMEとして必須の項目

- プロジェクト名・バッジ（ライセンス・GitHub Actions実行状況等）
- システム概要（1〜2段落）
- 目次
- アーキテクチャ図（テキストベースで可）
- 前提条件・依存サービス一覧（Node.jsバージョン・使用ライブラリ含む）
- インストール・セットアップ手順
- デプロイ手順（GitHub Actions・GitHub Pages）
- 使い方（APIエンドポイント一覧・リクエスト/レスポンス例）
- 環境変数・GitHub Secrets一覧
- テスト方法（ローカル実行手順）
- コントリビューションガイドライン
- ライセンス
- 連絡先・管理者情報

### 本システム特有の項目

- **GitHub Actions・GitHub Pagesの構成説明**（ワークフロー別の役割・手動実行方法）
- **スプレッドシート構成の説明**（本番・テスト・変数管理SSの役割と関係）
- **変数・マッピングの変更方法**（コード変更不要な操作を中心にステップ形式で）
- **J-STAGE API連携の有効化手順**（マッピングシートのみで対応できる旨を明記）
- **テストモードと本番モードの切り替え方法**（`USE_TEST_MODE`の操作手順）
- **バッチ処理の仕組みと手動実行方法**（`workflow_dispatch`の使い方・全件再処理方法）
- **差異レポートの見方と対応手順**（メールの読み方・SCPJへの手動反映手順）
- **データ更新タイムラグの説明**（SCPJへの手動入力からAPI反映まで最大24時間）
- **トラブルシューティング**（よくある問題と対処法）
- **運用上の注意事項**（GitHub Secretsの管理・テスト/本番SS分離等）

### 変更履歴

- バージョン・日付・変更内容・担当者の表形式
- 初回リリース時のバージョンは `1.0.0` とする
