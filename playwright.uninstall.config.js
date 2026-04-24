/**
 * 破壊的テスト（アンインストール）専用の Playwright 設定。
 * 通常の `npx playwright test` では実行されない。
 *
 * 実行: npx playwright test --config=playwright.uninstall.config.js
 */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/phase1-uninstall.spec.js'],
  timeout: 120000,
  use: {
    baseURL: 'http://localhost:8888',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // アンインストールは DB スナップショット検証のみなので desktop プロジェクト 1 つで十分.
  projects: [{ name: 'desktop', use: { viewport: { width: 1280, height: 720 } } }],
  // 並列不可（テーブル状態を順番に確認するため）.
  workers: 1,
});
