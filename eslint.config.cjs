/*
 * Smart Booking ESLint flat config.
 *
 * wp-scripts のデフォルト設定を継承し、テスト用ファイルや
 * ビルド設定ファイル向けにルールを緩和する。
 *
 * - tests/e2e/ : Playwright のテストコードでは JSDoc 強制や camelcase
 *   （REST レスポンスの snake_case を扱うため）を緩和し、
 *   ブラウザ globals (document / getComputedStyle 等) を許可する。
 * - playwright.config.js / global-setup.js / playwright.uninstall.config.js :
 *   テスト構成ファイルなので import/no-extraneous-dependencies を緩和。
 * - webpack.config.js : wp-scripts という JSDoc 文字列が
 *   タグ名と誤認されるため check-tag-names を緩和。
 */
const defaultConfig = require( '@wordpress/scripts/config/eslint.config.cjs' );

module.exports = [
	...defaultConfig,
	{
		files: [
			'tests/e2e/**/*.{js,jsx}',
			'playwright.config.js',
			'playwright.uninstall.config.js',
		],
		languageOptions: {
			globals: {
				// Playwright はブラウザ context 内で page.evaluate() の中で
				// document / window / getComputedStyle 等を使うため。
				window: 'readonly',
				document: 'readonly',
				getComputedStyle: 'readonly',
				navigator: 'readonly',
				location: 'readonly',
				URL: 'readonly',
				URLSearchParams: 'readonly',
				HTMLElement: 'readonly',
				Element: 'readonly',
				console: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				process: 'readonly',
				module: 'readonly',
				require: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
				Buffer: 'readonly',
			},
		},
		rules: {
			'jsdoc/require-param-type': 'off',
			'jsdoc/require-returns-description': 'off',
			'jsdoc/no-undefined-types': 'off',
			'@wordpress/no-global-active-element': 'off',
			camelcase: 'off',
			'no-shadow': 'off',
			'no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			'import/no-extraneous-dependencies': 'off',
		},
	},
	{
		files: [ 'webpack.config.js' ],
		rules: {
			'jsdoc/check-tag-names': 'off',
		},
	},
];
