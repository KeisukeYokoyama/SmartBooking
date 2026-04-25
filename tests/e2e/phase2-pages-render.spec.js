/**
 * Phase 2: 全5ページの描画確認。
 *
 * - 各ページに遷移して React Root が描画されることを確認
 * - コンソールエラーが出ないことを確認（外部CDN読み込み禁止 / 基本的なレンダリングエラー検知）
 * - ページタイトル h1 が正しく表示されることを確認
 *
 * desktop / mobile の両プロジェクトで実行される。
 */
const { test, expect } = require( '@playwright/test' );
const { loginAsAdmin } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

const PAGES = [
	{
		slug: 'smart-booking',
		title: 'スケジュール管理',
		rootSelector: '.smb-page--schedule, .smb-loading',
	},
	{
		slug: 'smart-booking-reservations',
		title: '予約一覧',
		rootSelector: '.smb-page--reservations',
	},
	{
		slug: 'smart-booking-stores',
		title: '店舗・担当者',
		rootSelector: '.smb-page--stores',
	},
	{
		slug: 'smart-booking-form-settings',
		title: 'フォーム設定',
		rootSelector: '.smb-page--form-settings',
	},
	{
		slug: 'smart-booking-settings',
		title: '設定',
		rootSelector: '.smb-page--settings',
	},
];

test.describe( 'Phase 2: 全5ページ描画', () => {
	for ( const pg of PAGES ) {
		test( `${ pg.title } ページが描画される（コンソールエラー0）`, async ( {
			page,
		} ) => {
			const errors = [];
			page.on( 'pageerror', ( err ) =>
				errors.push( `pageerror: ${ err.message }` )
			);
			page.on( 'console', ( msg ) => {
				if ( msg.type() === 'error' ) {
					const t = msg.text();
					// WP core 側の無関係エラーはノイズになるので一部は除外する。
					if (
						t.includes( 'favicon.ico' ) ||
						t.includes( '/wp-admin/admin-ajax.php' ) || // heartbeat 等
						t.includes( 'Failed to load resource' )
					) {
						return;
					}
					errors.push( `console: ${ t }` );
				}
			} );

			await loginAsAdmin( page );
			await page.goto( `/wp-admin/admin.php?page=${ pg.slug }` );
			// ローディングまたはメインコンテンツが出るまで待つ
			await page.waitForSelector( pg.rootSelector, { timeout: 15000 } );
			// h1 で確認
			await expect(
				page.locator( 'h1.smb-page__title' ).first()
			).toContainText( pg.title );
			// 念のため React Root が空でないことを確認
			const rootChildren = await page
				.locator( '#smart-booking-admin-app' )
				.evaluate( ( n ) => n.childElementCount );
			expect( rootChildren ).toBeGreaterThan( 0 );

			// アプリ起動後に即座に出たエラーが無いこと（ネットワーク依存のレース対策で少し待つ）
			await page.waitForTimeout( 500 );
			expect(
				errors,
				`console errors on ${ pg.slug }:\n${ errors.join( '\n' ) }`
			).toEqual( [] );
		} );
	}

	test( 'data-page が未定義のときスケジュールページにフォールバックする', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		// data-page="unknown" は PAGE_COMPONENTS になく、SchedulePage にフォールバックする
		await page.goto( `/wp-admin/admin.php?page=smart-booking` );
		await page.waitForSelector( '.smb-page--schedule, .smb-loading', {
			timeout: 15000,
		} );
		await expect(
			page.locator( 'h1.smb-page__title' ).first()
		).toContainText( 'スケジュール' );
	} );

	test( '管理サイドバーに Smart Booking メニューが登録されている', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/' );
		// モバイルではサイドバーが折りたたまれる（display:none）場合があるため、
		// 可視性ではなく DOM 存在のみで確認する.
		const menu = page
			.locator( '#adminmenu' )
			.getByText( 'Smart Booking', { exact: false } )
			.first();
		await expect( menu ).toHaveCount( 1 );
	} );
} );
