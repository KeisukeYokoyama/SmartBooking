/**
 * 公式サイト（smart-booking-website）のヘルプページ用スクリーンショットを撮影するための
 * Playwright 設定。回帰スイート（playwright.config.js）とは完全に分離している。
 *
 * - このファイルは `npm run screenshots` からのみ使われる。
 * - 既存の `playwright.config.js`（回帰スイート）には一切影響しない。
 * - `globalSetup` は設定しない: `tests/e2e/global-setup.js` は回帰用の DB スナップショット
 *   取得であり、撮影用途とは無関係（デモデータのシードは別途 wp eval-file で行う）。
 *
 * 寸法の根拠（既存 27 枚の実測結果）:
 *   ~/dev/smart-booking-website/content/help/images/ 配下の既存画像は、フロント予約フォーム
 *   のカットも含めて例外なく 1280 × 720 px / 72dpi（deviceScaleFactor: 1）/ PNG /
 *   fullPage:false。マニュアル画像としての一貫性を優先し、新規カットもすべてこれに統一する。
 *   スマートフォン幅の撮影は行わない。既存セットにモバイル画像は1枚も存在せず、
 *   混在させると寸法が不揃いになるため、モバイル用の別プロジェクトは用意しない
 *   （モバイル表示の訴求が必要になった場合は別タスクとして設計する）。
 */
const { defineConfig } = require( '@playwright/test' );

module.exports = defineConfig( {
	testDir: './tests/screenshots',
	testMatch: '*.spec.js',
	// testMatch の '*.spec.js' は basename マッチのためサブディレクトリにも一致してしまう。
	// tests/screenshots/legacy/ 配下（先代 spec の退避先。動くセレクタの参考資料）は
	// 実行対象外にするため、明示的に除外する。
	testIgnore: '**/legacy/**',
	timeout: 60000,
	// wp-env CLI コンテナの race を避けるため単一ワーカーで直列実行する（既存 config と同じ理由）.
	workers: 1,
	use: {
		baseURL: 'http://localhost:8888',
		// 撮影ノイズを避けるため失敗時の自動保存は無効化する。
		screenshot: 'off',
		trace: 'off',
	},
	projects: [
		{
			name: 'desktop',
			use: {
				viewport: { width: 1280, height: 720 },
				deviceScaleFactor: 1,
			},
		},
	],
} );
