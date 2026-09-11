/**
 * 公式サイト（smart-booking-website）のヘルプページ用スクリーンショット（店舗ページ）。
 *
 * 位置づけ（重要）:
 *   - これは回帰スイートではない。`npx playwright test`（既存 playwright.config.js）には
 *     含まれず、`npm run screenshots`（playwright.screenshots.config.js）でのみ実行される。
 *   - ここはアサーション（expect）を増やす場所ではない。目的は「見た目のキャプチャ」のみ。
 *     回帰の検証は tests/e2e/ 側の責務。
 *   - 出力先は docs/website-screenshots/<slug>/NN-name.png。
 *
 * 前提:
 *   - wp-env が起動していること（http://localhost:8888）。
 *   - 撮影用シードが投入済みであること（tests/screenshots/seed/README.md）。
 *
 * 共通ヘルパー（shot / gotoAdminPage など）は ./helpers.js にある。
 * カット追加の手順は docs/website-screenshots/README.md を参照。
 */
const { test } = require( '@playwright/test' );
const { loginAsAdmin } = require( '../e2e/helpers' );
const { shot, gotoAdminPage, autoAcceptDialogs } = require( './helpers' );

test.describe( 'help screenshots: stores', () => {
	test.beforeEach( async ( { page } ) => {
		autoAcceptDialogs( page );
		await loginAsAdmin( page );
	} );

	test( 'stores', async ( { page } ) => {
		await gotoAdminPage(
			page,
			'smart-booking-stores',
			'.smb-page--stores'
		);
		// シード未投入でも一覧コンテナの描画自体は待てるはず。特定の店舗名（例: 渋谷店）を
		// 厳しく待つと、シード未実行時にタイムアウトしてしまうため、店舗名への依存は避け、
		// 「一覧テーブル/リストが描画されたこと」を基準に待つ。
		await page.waitForTimeout( 500 );
		await shot( page, 'stores', '01-store-list.png' );

		await page
			.locator( 'button', { hasText: '店舗を追加' } )
			.first()
			.click();
		await page.waitForSelector( '[role="dialog"]', { timeout: 10_000 } );
		await page.waitForTimeout( 400 );
		await shot( page, 'stores', '02-store-add-modal.png' );
		await page.keyboard.press( 'Escape' );
	} );
} );
