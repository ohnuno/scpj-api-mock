# SCPJ API & J-STAGE 連携システム

SCPJスプレッドシートのジャーナルデータを外部向けに自動配信し、J-STAGE（国立研究開発法人科学技術振興機構が運営する電子ジャーナルプラットフォーム）からデータを自動補完するシステムです。

---

## 概要

```
【SCPJスプレッドシート】
         ↓ データを読み込む (npm run generate / 自動実行)
【GitHub Pages】→ 外部からJSON形式でアクセス可能
         ↑ 空欄を補完・差異チェック (npm run batch / 毎日自動実行)
【J-STAGE API】
```

このシステムには、大きく2つの機能があります。

- **データ配信（APIとして外部公開）**
  SCPJシートのジャーナルデータをJSON形式に変換し、GitHub Pagesで誰でも取得できる形で公開します。

- **データ補完バッチ**
  毎日深夜0時（JST）に自動実行し、J-STAGEのデータをSCPJシートの空欄に自動入力します。
  値が異なる場合はログに記録し、管理者にメールで通知します（SendGrid設定時）。

### 公開APIのURL一覧（GitHub Pages）

| URL | 内容 |
|---|---|
| `.../data/all.json` | 全件データ（`{ items: [...] }` 形式） |
| `.../data/index.json` | Journal ID 一覧 |
| `.../data/by_id/{journal_id}.json` | Journal ID で1件取得 |
| `.../data/by_issn/{issn}.json` | ISSN で取得（ハイフンあり・なし両対応） |

> **このシステムのGitHub Pages URL:** `https://ohnuno.github.io/scpj-api-mock/data/`

---

## 前提条件・事前に用意するもの

環境構築を始める前に、以下をすべて準備してください。
それぞれ「誰に何を依頼するか」も記載しています。

| 必要なもの | 説明 | 入手方法 |
|---|---|---|
| **Googleアカウント** | スプレッドシートにアクセスするため | 管理者に確認 |
| **サービスアカウントキー（JSONファイル）** | システムがGoogleスプレッドシートを自動操作するための認証情報 | Google Cloud管理者に発行を依頼 |
| **変数管理スプレッドシートのID** | configシート・mappingシートが入ったスプレッドシート | 管理者から共有してもらう |
| **SCPJスプレッドシートへの編集権限** | バッチが空欄を書き込むため「編集者」権限が必要 | スプレッドシートオーナーに依頼 |
| **GitHubアカウント** | リポジトリへのアクセスと自動実行設定に必要 | 管理者に確認 |
| **Node.js 20以上** | ローカルで実行する場合のみ必要 | [nodejs.org](https://nodejs.org/) からインストール |

> **サービスアカウントキーとは？**
> Googleスプレッドシートをプログラムから自動操作するための「ロボット専用パスワード」のようなものです。
> JSONファイル形式で発行されます。このファイルは絶対に他人に見せないでください。

---

## セットアップ手順

### ステップ1：スプレッドシートの準備（管理者作業）

1. **変数管理スプレッドシート**（configシート・mappingシートが入ったシート）を作成・共有
   → サービスアカウントのメールアドレスを「編集者」として共有してください

2. **SCPJスプレッドシート**にも同じサービスアカウントを「編集者」として共有してください

3. configシートに以下の値を入力してください（A列=キー名、B列=値）:

   | キー | 値の例 | 説明 |
   |---|---|---|
   | `SCPJ_SHEET_ID` | `1BXn...` | SCPJスプレッドシートのID ※1 |
   | `SCPJ_SHEET_NAME` | `data` | SCPJシートのシート名 |
   | `TEST_SHEET_ID` | `1BXn...` | テスト用スプレッドシートのID |
   | `TEST_SHEET_NAME` | `data` | テスト用シートのシート名 |
   | `USE_TEST_MODE` | `FALSE` | テストモード。最初は `TRUE` で動作確認推奨 |
   | `MATCH_KEY_SCPJ` | `ISSN-L,EISSN,PISSN` | J-STAGE照合に使うISSN列名（左から優先） |
   | `LAST_BATCH_RUN` | （空欄でOK） | バッチが自動更新します |
   | `REPORT_EMAIL_TO` | `admin@example.com` | 差異通知メールの送信先 |
   | `REPORT_EMAIL_FROM` | `noreply@example.com` | 差異通知メールの送信元 |

   > **※1 スプレッドシートIDの確認方法:**
   > スプレッドシートのURLの `/spreadsheets/d/` と `/edit` の間にある文字列です。
   > 例: `https://docs.google.com/spreadsheets/d/`**`1BXnU7whCp...`**`/edit`

### ステップ2：GitHub Secretsの登録（管理者作業）

GitHubリポジトリの **Settings → Secrets and variables → Actions** から以下を登録します:

| Secret名 | 内容 |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | サービスアカウントのJSONキーファイルの中身（テキスト全文をそのまま貼り付け） |
| `CONFIG_SHEET_ID` | 変数管理スプレッドシートのID |
| `SENDGRID_API_KEY` | SendGridのAPIキー（差異通知メールを使う場合のみ。任意） |

> **GitHub Secretsとは？**
> APIキーやパスワードなどの秘密情報を安全に保管する仕組みです。
> 一度登録すると値は表示されなくなりますが、GitHub Actionsの自動実行で使用されます。

### ステップ3：ローカル実行環境の構築（任意）

ローカルPCで動作確認したい場合のみ必要です。

```bash
# 1. リポジトリをクローン
git clone https://github.com/ohnuno/scpj-api-mock.git
cd scpj-api-mock

# 2. パッケージをインストール
npm install

# 3. .env ファイルを作成（サンプルをコピーして編集）
cp .env.example .env
# .env をエディタで開き、GOOGLE_SERVICE_ACCOUNT_KEY と CONFIG_SHEET_ID を入力
```

### ステップ4：接続確認

```bash
npm run check-config
```

これを実行してconfigシートの内容がコンソールに表示されれば、セットアップ完了です。

---

## 使い方

### コマンド一覧

| コマンド | いつ使うか | 実行するとどうなるか |
|---|---|---|
| `npm run check-config` | セットアップ後の疎通確認 | configシートに接続し、設定値を表示する |
| `npm run generate` | 手動でJSONを更新したいとき | SCPJシートを読み込みGitHub Pages用JSONを生成する |
| `npm run batch` | 手動でバッチを実行したいとき | J-STAGE APIからデータを取得しSCPJシートを補完する |

> **注意:** `npm run batch` は全3,000件以上のジャーナルにJ-STAGE APIを呼び出すため、完了まで約60分かかります。

---

## 運用・定常作業

### 自動実行スケジュール

| ワークフロー | 実行タイミング | 処理内容 |
|---|---|---|
| **SCPJ Batch** | 毎日 深夜0時（JST）/ 手動実行可 | ①バッチ処理 → ②静的JSON生成 → ③GitHub Pagesデプロイ |
| **Deploy Static JSON** | 手動実行のみ | 静的JSON生成 → GitHub Pagesデプロイ（バッチなし） |

### 正常終了の確認方法

1. GitHubリポジトリの **Actions タブ** を開く
2. 最新の実行が ✅ （緑のチェック）になっていれば成功
3. ログをクリックして「Run batch」ステップで以下を確認できます:
   - `バッチ完了 / 処理: XXXX 件 / 補完: XX 件 / 差異: XX 件`
   - 差異がある場合は内訳もログに表示されます

### 手動でバッチを実行したい場合

1. GitHubリポジトリの **Actions タブ** を開く
2. 左メニューから **SCPJ Batch** をクリック
3. 右上の **Run workflow** をクリック → **Run workflow** で実行

### mappingシートの管理（J-STAGEからの補完設定）

mappingシートのF列・H列を変更するだけで、補完の動作を細かく制御できます。

| F列（enabled） | H列（overwrite） | 動作 |
|---|---|---|
| `FALSE` | （どちらでも） | **無効**：J-STAGEからの補完を行わない |
| `TRUE` | `FALSE` または空 | **補完のみ**：SCPJが空欄の場合だけ書き込む |
| `TRUE` | `TRUE` | **上書き**：既存の値があっても上書きする（差異もログに記録） |

> mappingシートへの新規追加方法は後述の「mappingシートリファレンス」を参照してください。

---

## 設定リファレンス

### configシート（変数管理SS）

| キー | 必須/任意 | 説明 | 取得方法 |
|---|---|---|---|
| `SCPJ_SHEET_ID` | 必須 | SCPJスプレッドシートのID | URLから確認 |
| `SCPJ_SHEET_NAME` | 必須 | SCPJシートのシート名（タブ名） | シートを目視確認 |
| `TEST_SHEET_ID` | 必須 | テスト用スプレッドシートのID | URLから確認 |
| `TEST_SHEET_NAME` | 必須 | テスト用シートのシート名 | シートを目視確認 |
| `USE_TEST_MODE` | 必須 | `TRUE` でテスト用シートを使用・メール送信スキップ | 手動入力 |
| `MATCH_KEY_SCPJ` | 必須 | J-STAGE照合に使うSCPJ列名（カンマ区切りで優先順） | 手動入力 例: `ISSN-L,EISSN,PISSN` |
| `LAST_BATCH_RUN` | 自動 | バッチ正常完了時に自動更新される | 触らなくてOK |
| `REPORT_EMAIL_TO` | 任意 | 差異通知メールの送信先アドレス | 手動入力 |
| `REPORT_EMAIL_FROM` | 任意 | 差異通知メールの送信元アドレス（SendGridで認証済みのもの） | 手動入力 |
| `JSTAGE_API_BASE_URL` | 任意 | J-STAGE APIのURL（省略時はデフォルトURLを使用） | 通常は空欄でOK |

### GitHub Secrets（リポジトリ設定）

| Secret名 | 必須/任意 | 内容 |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_KEY` | **必須** | サービスアカウントJSONキーのテキスト全文 |
| `CONFIG_SHEET_ID` | **必須** | 変数管理スプレッドシートのID |
| `SENDGRID_API_KEY` | 任意 | SendGridのAPIキー（差異メール通知を使う場合のみ） |

### mappingシートリファレンス

mappingシートの各列の意味と新規追加手順です。

| 列 | ヘッダー | 入力内容 |
|---|---|---|
| A | id | 管理用ID（例: `map_020`）。連番で追加してください |
| B | scpjColumn | SCPJシートの1行目にある英語列名（例: `Journal_Title_En`） |
| C | source | データソース（現在は `JSTAGE` のみ対応） |
| D | sourcePath | J-STAGEレスポンスのフィールドパス（後述） |
| E | transform | 変換ルール。不要な場合は `なし` と入力 |
| F | enabled | `TRUE` で有効化。まず `FALSE` で追加して動作確認するのがおすすめ |
| G | notes | メモ（自由記入） |
| H | overwrite | `TRUE` で既存値も上書き。`FALSE` または空欄で空欄のみ補完 |

**D列（sourcePath）に使用できる値:**

```
material_title.en   誌名（英語）
material_title.ja   誌名（日本語）
publisher.name.en   発行者名（英語）
publisher.name.ja   発行者名（日本語）
publisher.url.ja    発行者URL
cdjournal           J-STAGEジャーナルコード（例: hpi1972）
prism:issn          Print ISSN
prism:eIssn         Electronic ISSN
```

---

## トラブルシューティング

### バッチが失敗した場合

1. GitHub Actions の **Actions タブ** で失敗したジョブをクリック
2. 赤くなったステップを展開し、エラーメッセージを確認

**よくあるエラーと対処法:**

| エラーメッセージ | 原因 | 対処法 |
|---|---|---|
| `環境変数 CONFIG_SHEET_ID が設定されていません` | GitHub Secretsに `CONFIG_SHEET_ID` が未登録 | GitHub Secrets を確認・登録する |
| `SCPJ に列 "ISSN-L" が見つかりません` | configシートの `MATCH_KEY_SCPJ` に書いた列名がSCPJシートにない | SCPJシートの1行目の列名と一致させる |
| `mapping シートが見つかりません` | 変数管理SSにmappingシートがない | mappingシートを作成する（なければバッチは0件処理で継続） |
| Google APIの認証エラー | サービスアカウントキーが無効、またはスプレッドシートに共有されていない | キーを再発行するか、スプレッドシートの共有設定を確認する |

### バッチは成功しているが補完が0件の場合

- mappingシートの F列が `TRUE` になっているか確認してください
- SCPJシートの列名（B列）が正しいか確認してください
- J-STAGEにそのISSNが登録されていない可能性があります（約44%は未登録）

### GitHub PagesのJSONが古い場合

- Actions タブから **Deploy Static JSON** を手動実行してください

---

## 注意事項・セキュリティ

> ⚠️ **絶対にやってはいけないこと**
>
> - `GOOGLE_SERVICE_ACCOUNT_KEY` のJSON内容をメールやSlackで共有しない
> - サービスアカウントキーのJSONファイル（`*.json`）をGitにコミットしない
>   （`.gitignore` に設定済みですが、念のため注意してください）
> - `SENDGRID_API_KEY` を第三者に共有しない

- `USE_TEST_MODE` を `TRUE` にしている間は、テスト用シートが更新されます。本番シートへの影響はありません
- バッチは一度実行すると **SCPJシートを直接書き換えます**。`overwrite=TRUE` のマッピングは既存の値も上書きされます
- 差異が検出された場合、ログおよびメール（SendGrid設定時）で通知されますが、上書きはすでに完了しています

---

## ディレクトリ構成

```
scpj-api/
├── src/
│   ├── api/
│   │   ├── generate.js        # 静的JSON生成（SCPJシート → docs/data/）
│   │   ├── retrieve.js        # フィルタ・ページネーション処理
│   │   ├── retrieve_by_id.js  # ID検索処理
│   │   └── object_ids.js      # ID一覧生成
│   ├── batch/
│   │   ├── index.js           # バッチ処理メイン
│   │   ├── jstage.js          # J-STAGE API連携
│   │   ├── diff.js            # 差異チェック・補完ロジック
│   │   ├── report.js          # SendGrid メール送信
│   │   ├── sheets.js          # Google Sheets API操作
│   │   └── opf.js             # HTTP通信ユーティリティ
│   └── utils/
│       ├── config.js          # configシート読み込み（単体実行で疎通確認可）
│       ├── mapping.js         # mappingシート読み込み・フィールド解決
│       └── normalize.js       # 列名→APIキー変換・ISSN正規化
├── docs/data/                 # GitHub Pages配信ファイル（自動生成）
├── .github/workflows/
│   ├── batch.yml              # 毎日自動実行バッチ
│   └── deploy.yml             # 静的JSON手動デプロイ
├── .env.example               # ローカル実行時の環境変数サンプル
└── package.json
```

---

## SCPJシートの構造（重要）

| 行 | 内容 | 備考 |
|---|---|---|
| **1行目** | 英語列名（`Journal_ID`, `ISSN-L` など） | バッチが列を特定するために使用 |
| **2行目** | 日本語ラベル（「ジャーナルID」など） | バッチ処理では読み飛ばされます |
| **3行目以降** | ジャーナルデータ（`J000001`〜） | バッチの補完対象 |

---

## 依存パッケージ

| パッケージ | 用途 |
|---|---|
| `googleapis` | Google Sheets API（スプレッドシートの読み書き） |
| `xml2js` | J-STAGE APIのXMLレスポンスを解析 |

---

## 改訂履歴

| 日付 | 変更内容 |
|---|---|
| 2026-03-12 | 差異ログをSendGrid未設定時でも常に出力するよう修正 |
| 2026-03-12 | J-STAGE連携に `prism:issn` / `prism:eIssn`（PISSN・EISSN）フィールドを追加 |
| 2026-03-12 | 有効なJSTAGEマッピングがない場合のJ-STAGE API呼び出しをスキップ（実行時間を大幅短縮） |
| 2026-03-12 | J-STAGE共通フィールド補完・上書きフラグ（mapping H列）を実装 |
| 2026-03-11 | ISSNルックアップをハイフンあり・なし両対応に対応（`by_issn`ファイル数を倍増） |
| 2026-03-11 | `by_id` / `by_issn` による静的ファイル分割でID/ISSNルックアップを高速化 |
| 2026-03-11 | OPF API接続を削除しJ-STAGEのみの構成に変更 |
| 2026-03-11 | 日本語ラベル行のスキップ・静的JSON生成の不具合修正 |
| 2026-03-10 | 初版作成（SCPJ API & J-STAGE連携システム） |
