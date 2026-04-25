const { defineConfig } = require( '@playwright/test' );

module.exports = defineConfig( {
	testDir: './tests/e2e',
	timeout: 30000,
	// wp-env CLI コンテナの race + 複数 spec 間の DB seed/restore 競合を防ぐため、
	// 単一ワーカーで直列実行する（INFRA-1 対策）.
	workers: 1,
	// アンインストールspecは破壊的なので、testIgnore で明示的に除外（別途実行）.
	testIgnore: [ '**/phase1-uninstall.spec.js' ],
	// wp-env の CLI コンテナは複数並列呼び出しで race condition を起こすため、
	// DB スナップショットを globalSetup で 1 回だけ取得してファイルに書き出す.
	globalSetup: require.resolve( './tests/e2e/global-setup.js' ),
	use: {
		baseURL: 'http://localhost:8888',
		screenshot: 'only-on-failure',
		trace: 'retain-on-failure',
	},
	projects: [
		{ name: 'desktop', use: { viewport: { width: 1280, height: 720 } } },
		{ name: 'mobile', use: { viewport: { width: 375, height: 667 } } },
	],
} );
