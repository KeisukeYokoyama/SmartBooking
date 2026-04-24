/**
 * Smart Booking E2E テスト共通ヘルパー。
 *
 * - WordPress 管理画面へのログイン
 * - WP-CLI 経由での DB 確認
 * - REST API 呼び出しヘルパ
 */
const { execSync } = require('node:child_process');

const WP_ADMIN_USER = 'admin';
const WP_ADMIN_PASS = 'password';

/**
 * WP-CLI を同期実行し stdout を文字列で返す。
 * wp-env の "ℹ Starting..." / "✔ Ran ..." といった装飾行は除去する。
 *
 * @param {string} cmd `wp ` 以降のコマンド。
 * @returns {string}
 */
function wpCli(cmd) {
  try {
    const out = execSync(`npx wp-env run cli wp ${cmd}`, {
      cwd: require('path').resolve(__dirname, '..', '..'),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    return stripWpEnvNoise(out);
  } catch (err) {
    // wp-env は非0終了でもテスト側でメッセージを扱いたいのでエラーを再スロー.
    throw new Error(
      `wp-cli failed: wp ${cmd}\nstdout: ${err.stdout?.toString?.() || ''}\nstderr: ${err.stderr?.toString?.() || ''}`
    );
  }
}

/**
 * wp-env の装飾行（ℹ Starting / ✔ Ran / (in ...) など）を除去する。
 *
 * @param {string} out
 * @returns {string}
 */
function stripWpEnvNoise(out) {
  return out
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (t === '') return true; // 空行は保持（件数カウント等に無影響）.
      if (t.startsWith('ℹ')) return false;
      if (t.startsWith('✔')) return false;
      if (t.startsWith('⚠')) return false;
      if (t.startsWith('✖')) return false;
      return true;
    })
    .join('\n');
}

/**
 * DB のテーブル一覧から smb_ プレフィックスのみを抽出して返す（ソート済み）。
 *
 * @returns {string[]}
 */
function listSmbTables() {
  const out = wpCli(`db query "SHOW TABLES LIKE '%smb\\_%';" --skip-column-names`);
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toLowerCase().includes('smb_'))
    .sort();
}

/**
 * wp_options の smb_ プレフィックスのレコード件数。
 *
 * @returns {number}
 */
function countSmbOptions() {
  const out = wpCli(
    `db query "SELECT COUNT(*) FROM wp_options WHERE option_name LIKE 'smb\\_%';" --skip-column-names`
  );
  const n = parseInt(out.trim(), 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * 特定テーブルのレコード件数。
 *
 * @param {string} table テーブル名（例 'wp_smb_stores'）.
 * @returns {number}
 */
function countRows(table) {
  const out = wpCli(`db query "SELECT COUNT(*) FROM ${table};" --skip-column-names`);
  const n = parseInt(out.trim(), 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * WordPress 管理画面にログインする（同一 page で以降の操作が認証済みになる）。
 * ログインページが日本語/英語どちらでも動くよう、name 属性で操作する。
 *
 * @param {import('@playwright/test').Page} page
 */
async function loginAsAdmin(page) {
  await page.goto('/wp-login.php', { waitUntil: 'domcontentloaded' });
  // ログイン済みだと wp-login.php は redirect する場合があるので都度リトライ.
  if (!page.url().includes('wp-login.php')) {
    return;
  }
  await page.waitForSelector('input[name="log"]', { timeout: 10_000 });
  await page.fill('input[name="log"]', WP_ADMIN_USER);
  await page.fill('input[name="pwd"]', WP_ADMIN_PASS);
  await Promise.all([
    page.waitForURL(/wp-admin/i, { timeout: 20_000 }),
    page.click('#wp-submit'),
  ]);
  // wp-admin ページのロード完了を待つ.
  await page.waitForLoadState('domcontentloaded');
}

module.exports = {
  wpCli,
  listSmbTables,
  countSmbOptions,
  countRows,
  loginAsAdmin,
  WP_ADMIN_USER,
  WP_ADMIN_PASS,
};
