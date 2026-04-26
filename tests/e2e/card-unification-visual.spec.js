/**
 * 管理画面カード統一の視覚確認スペック。
 *
 * 5画面（Schedule / Reservations / Stores / FormSettings / Settings）を
 * デスクトップ（1280px）とモバイル（375px）でスクリーンショット撮影し、
 * `.smb-section-card` の見た目を機械的に検証する。
 */
const { test, expect } = require( '@playwright/test' );
const { loginAsAdmin } = require( './helpers' );

const PAGES = [
	{ slug: 'smart-booking', label: 'schedule', file: '01-schedule' },
	{
		slug: 'smart-booking-reservations',
		label: 'reservations',
		file: '02-reservations',
	},
	{ slug: 'smart-booking-stores', label: 'stores', file: '03-stores' },
	{
		slug: 'smart-booking-form-settings',
		label: 'form-settings',
		file: '04-form-settings',
	},
	{
		slug: 'smart-booking-settings',
		label: 'settings',
		file: '05-settings',
	},
];

const VIEWPORTS = [
	{ name: 'desktop', width: 1280, height: 900 },
	{ name: 'mobile', width: 375, height: 800 },
];

const SCREENSHOT_DIR = 'tests/e2e/screenshots/card-unification';

for ( const vp of VIEWPORTS ) {
	test.describe( `card unification - ${ vp.name }`, () => {
		test.use( { viewport: { width: vp.width, height: vp.height } } );

		for ( const p of PAGES ) {
			test( `${ p.label } renders cards`, async ( { page } ) => {
				await loginAsAdmin( page );
				await page.goto(
					`/wp-admin/admin.php?page=${ p.slug }`,
					{ waitUntil: 'domcontentloaded' }
				);
				// React が描画完了するまで余裕を持って待機。
				await page.waitForSelector( '.smb-section-card', {
					timeout: 15_000,
				} );
				// レイアウトの安定を待つ（ネットワーク完了 + 少し余裕）。
				await page
					.waitForLoadState( 'networkidle', { timeout: 10_000 } )
					.catch( () => {} );
				await page.waitForTimeout( 400 );

				// フルページスクリーンショット保存。
				await page.screenshot( {
					path: `${ SCREENSHOT_DIR }/${ p.file }-${ vp.name }.png`,
					fullPage: true,
				} );

				// 主要な視覚プロパティを取得して検証。
				// `--filters` / `--reservations` モディファイアは padding を 0 に
				// 上書きする設計なので除外する。
				const cards = await page.$$eval(
					'.smb-section-card',
					( els ) =>
						els.map( ( el ) => {
							const cs = window.getComputedStyle( el );
							return {
								classes: el.className,
								background: cs.backgroundColor,
								borderTopColor: cs.borderTopColor,
								borderTopWidth: cs.borderTopWidth,
								borderRadius: cs.borderTopLeftRadius,
								padding: cs.paddingTop,
							};
						} )
				);

				// カードが少なくとも 1 個は存在する。
				expect( cards.length ).toBeGreaterThan( 0 );

				// レスポンシブ: <=600px は padding: 16px、それ以上は 24px。
				const expectedPadding =
					vp.width <= 600 ? '16px' : '24px';

				for ( const c of cards ) {
					// background は #fff = rgb(255, 255, 255)。
					expect( c.background ).toBe( 'rgb(255, 255, 255)' );
					// border-top-width は 1px。
					expect( c.borderTopWidth ).toBe( '1px' );
					// border-radius は 4px。
					expect( c.borderRadius ).toBe( '4px' );

					// modifier 付き（padding を 0 に上書きする設計）はスキップ。
					const isPaddingOverride =
						c.classes.includes(
							'smb-section-card--reservations'
						) ||
						c.classes.includes(
							'smb-section-card--filters'
						);
					if ( ! isPaddingOverride ) {
						expect( c.padding ).toBe( expectedPadding );
					} else {
						expect( c.padding ).toBe( '0px' );
					}
				}
			} );
		}
	} );
}

test( 'stores page does not nest StoreCard inside section-card', async ( {
	page,
} ) => {
	await loginAsAdmin( page );
	await page.goto( '/wp-admin/admin.php?page=smart-booking-stores', {
		waitUntil: 'domcontentloaded',
	} );
	await page.waitForSelector( '.smb-section-card', { timeout: 15_000 } );

	// 入れ子カード（section-card 内に section-card がもう一段）が無いこと。
	const nested = await page.$$eval(
		'.smb-section-card .smb-section-card',
		( els ) => els.length
	);
	expect( nested ).toBe( 0 );
} );
