'use strict';

const { getAuthClient, getConfig, setConfigValue } = require('../utils/config');
const { getMapping, resolveFieldPath, applyTransform } = require('../utils/mapping');
const { readScpjSheet, sheetsBatchUpdate } = require('./sheets');
const { fetchOPFByISSN } = require('./opf');
const { fetchJstageData } = require('./jstage');
const { processJournalRow } = require('./diff');
const { sendReport, buildDiffReport, buildErrorReport } = require('./report');
const { normalizeISSN } = require('../utils/normalize');

const CONFIG_SHEET_ID = process.env.CONFIG_SHEET_ID;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

async function main() {
  const runAt = new Date().toISOString();
  console.log(`[${runAt}] バッチ開始`);

  if (!CONFIG_SHEET_ID) throw new Error('環境変数 CONFIG_SHEET_ID が設定されていません');

  const auth = await getAuthClient();
  const cfg = await getConfig(auth, CONFIG_SHEET_ID);
  console.log('config 読み込み完了');

  const useTestMode = cfg['USE_TEST_MODE'] === 'true';
  const sheetId = useTestMode ? cfg['TEST_SHEET_ID'] : cfg['SCPJ_SHEET_ID'];
  const sheetName = useTestMode ? cfg['TEST_SHEET_NAME'] : cfg['SCPJ_SHEET_NAME'];
  const lastBatchRun = cfg['LAST_BATCH_RUN'] || null;
  // カンマ区切りで複数列を指定可能。左から順にフォールバック（例: ISSN-L,EISSN,PISSN）
  const matchKeysScpj = (cfg['MATCH_KEY_SCPJ'] || 'ISSN-L').split(',').map(k => k.trim()).filter(Boolean);

  console.log(`モード: ${useTestMode ? 'テスト' : '本番'} / シート: ${sheetId} / 前回実行: ${lastBatchRun ?? '初回'}`);

  const mappings = await getMapping(auth, CONFIG_SHEET_ID);
  console.log(`有効なマッピング: ${mappings.length} 件`);

  const { headers, rows, colIndex } = await readScpjSheet(auth, sheetId, sheetName);
  console.log(`SCPJ データ読み込み: ${rows.length} 件`);

  // 指定列が SCPJ に存在するか確認
  for (const key of matchKeysScpj) {
    if (colIndex[key] == null) throw new Error(`SCPJ に列 "${key}" が見つかりません`);
  }

  const allUpdates = [];
  const allDiffs = [];
  let processedCount = 0;
  let complementedCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // ISSN-L → EISSN → PISSN の順でフォールバック（空欄をスキップ）
    let issn = '';
    for (const key of matchKeysScpj) {
      const candidate = normalizeISSN(row[colIndex[key]] ?? '');
      if (candidate && candidate.length >= 8) {
        issn = candidate;
        break;
      }
    }
    if (!issn) continue;

    processedCount++;
    const rowNumber = i + 2; // ヘッダー行が1行目なのでデータは2行目〜

    // OPF データ取得
    let opfData = null;
    try {
      opfData = await fetchOPFByISSN(cfg['OPF_RETRIEVE_URL'], issn);
    } catch (e) {
      console.warn(`OPF fetch 失敗 (ISSN: ${issn}): ${e.message}`);
    }

    // J-STAGE データ取得
    let jstageData = null;
    try {
      jstageData = await fetchJstageData(issn, lastBatchRun, cfg);
    } catch (e) {
      console.warn(`J-STAGE fetch 失敗 (ISSN: ${issn}): ${e.message}`);
    }

    const sourceData = {
      OPF: opfData,
      JSTAGE: jstageData,
    };

    const { updates, diffs } = processJournalRow({
      headers,
      row,
      colIndex,
      rowNumber,
      sheetName,
      sourceData,
      mappings,
      resolveFieldPath,
      applyTransform,
    });

    if (updates.length > 0) {
      complementedCount++;
      allUpdates.push(...updates);
    }
    allDiffs.push(...diffs);

    // レート制限を考慮して少し待機（OPF API への連続アクセスを抑制）
    if (processedCount % 10 === 0) {
      await new Promise(r => setTimeout(r, 1000));
      console.log(`進捗: ${processedCount}/${rows.length} 件処理済み`);
    }
  }

  // 補完データを一括書き込み
  if (allUpdates.length > 0) {
    console.log(`補完書き込み: ${allUpdates.length} セル`);
    // API の1リクエストあたり最大 1000 データ制限を考慮してチャンク分割
    const CHUNK_SIZE = 500;
    for (let i = 0; i < allUpdates.length; i += CHUNK_SIZE) {
      await sheetsBatchUpdate(auth, sheetId, allUpdates.slice(i, i + CHUNK_SIZE));
    }
  } else {
    console.log('補完対象なし');
  }

  // 差異レポート送信（テストモードでは送信スキップ）
  if (allDiffs.length > 0 && !useTestMode && SENDGRID_API_KEY) {
    const { subject, body } = buildDiffReport({
      runAt,
      processedCount,
      complementedCount,
      diffs: allDiffs,
    });
    await sendReport(
      SENDGRID_API_KEY,
      cfg['REPORT_EMAIL_TO'],
      cfg['REPORT_EMAIL_FROM'],
      subject,
      body
    );
    console.log(`差異レポート送信完了 (${allDiffs.length} 件)`);
  } else if (allDiffs.length > 0 && useTestMode) {
    console.log(`[テストモード] 差異レポート送信スキップ (${allDiffs.length} 件の差異を検出)`);
    console.log(allDiffs.map(d => `  ${d.journalId} / ${d.field}: "${d.scpjValue}" ≠ "${d.sourceValue}"`).join('\n'));
  } else {
    console.log('差異なし');
  }

  // LAST_BATCH_RUN を更新（正常完了時のみ）
  await setConfigValue(auth, CONFIG_SHEET_ID, 'LAST_BATCH_RUN', runAt);
  console.log(`LAST_BATCH_RUN 更新: ${runAt}`);

  console.log(`バッチ完了 / 処理: ${processedCount} 件 / 補完: ${complementedCount} 件 / 差異: ${allDiffs.length} 件`);
}

main().catch(async (error) => {
  console.error('バッチエラー:', error);

  // エラーメール送信を試みる
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  if (SENDGRID_API_KEY && CONFIG_SHEET_ID) {
    try {
      const auth = await getAuthClient();
      const cfg = await getConfig(auth, CONFIG_SHEET_ID);
      if (cfg['REPORT_EMAIL_TO'] && cfg['REPORT_EMAIL_FROM']) {
        const { subject, body } = buildErrorReport(error, new Date().toISOString());
        await sendReport(SENDGRID_API_KEY, cfg['REPORT_EMAIL_TO'], cfg['REPORT_EMAIL_FROM'], subject, body);
        console.log('エラーメール送信完了');
      }
    } catch (mailError) {
      console.error('エラーメール送信失敗:', mailError);
    }
  }

  process.exit(1);
});
