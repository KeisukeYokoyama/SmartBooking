/**
 * 公式サイト ヘルプページ用スクリーンショット — 既存ページの差し替え分。
 *
 * 対象は 2 系統:
 *   1. 古くなった既存画像の差し替え（~/dev/smart-booking-website/docs/help-backlog.md §C3）
 *      design / custom-fields / reservations
 *   2. v0.5.5・v0.5.4 で表示が変わった画面
 *      - email  : 「管理者へのメール」の説明文・トグル直下のヒント・確認ダイアログ（v0.5.5 B）
 *      - staff  : 担当者のメールアドレス欄のヘルプ文（v0.5.5 B）
 *      - reservations: 予約詳細がその予約のフォームの項目を出す（v0.5.5 H3）
 *      ※ 住所タイプ変更時の自動入力（v0.5.5 H6）と種別セレクタ disabled（v0.5.4）は
 *        address-field / conditional-fields のカットとして help-new-pages.spec.js 側にある。
 *
 * 位置づけ:
 *   - 回帰スイートではない。`npm run screenshots` でのみ実行される。
 *   - expect を増やす場所ではない（目的は見た目のキャプチャのみ）。
 */
const { test } = require( '@playwright/test' );
const { loginAsAdmin } = require( '../e2e/helpers' );
const {
	shot,
	gotoAdminPage,
	scrollToTop,
	scrollInModal,
	openFormSettings,
	closeModal,
	autoAcceptDialogs,
} = require( './helpers' );

test.describe( 'help screenshots: updates', () => {
	test.beforeEach( async ( { page } ) => {
		autoAcceptDialogs( page );
		await loginAsAdmin( page );
	} );

	/* ---------------------------------------------------------------- */
	/* design（カラーカスタマイズ。v0.5.1 で 7 項目になった）              */
	/* ---------------------------------------------------------------- */

	test( 'design', async ( { page } ) => {
		await gotoAdminPage(
			page,
			'smart-booking-settings',
			'.smb-page--settings'
		);
		await page
			.locator( 'button[role="tab"]', { hasText: 'デザイン' } )
			.click();
		await page.waitForTimeout( 800 );

		// 01: タブ冒頭（カラーカスタマイズの見出しから色項目の並びまで）。
		await page.evaluate( () => window.scrollTo( 0, 0 ) );
		await page.waitForTimeout( 300 );
		await shot( page, 'design', '01-design-tab.png' );

		// 02: v0.5.1 で追加された警告色・無効色と、保存/リセットのボタンまで。
		await scrollToTop(
			page,
			page.locator( 'text=残りわずかの色（警告色）' ).first(),
			120
		);
		await shot( page, 'design', '02-design-availability-colors.png' );
	} );

	/* ---------------------------------------------------------------- */
	/* custom-fields（フィールドタイプ 8 種・フィールド一覧）              */
	/* ---------------------------------------------------------------- */

	test( 'custom-fields', async ( { page } ) => {
		await openFormSettings( page, '標準フォーム' );

		// 01: 「フィールドタイプから追加」の 8 枚のカードが全部入る位置。
		await scrollToTop(
			page,
			page
				.locator( 'h2', { hasText: 'フィールドタイプから追加' } )
				.first(),
			56
		);
		await shot( page, 'custom-fields', '01-field-types.png' );

		// 02: 「現在のフィールド一覧」の表（保護フィールド 3 つ＋追加した項目）。
		await scrollToTop(
			page,
			page.locator( 'h2', { hasText: '現在のフィールド一覧' } ).first(),
			56
		);
		await shot( page, 'custom-fields', '02-field-list.png' );
	} );

	/* ---------------------------------------------------------------- */
	/* reservations（一覧の列順 v0.5.3 ／ 予約詳細 v0.5.5 H3）            */
	/* ---------------------------------------------------------------- */

	test( 'reservations', async ( { page } ) => {
		await gotoAdminPage(
			page,
			'smart-booking-reservations',
			'.smb-page--reservations'
		);

		// 01: 予約一覧（受付日時が 2 列目＝v0.5.3 の列順）。
		// 絞り込みパネルは既定で開いており、開いたままだと行が 1 件強しか写らない。
		// 「フォーム」列を含む一覧そのものを見せたいので、ここでは畳んでから撮る
		// （絞り込みを開いた状態のカットは forms/03-reservation-form-column.png が担当）。
		const filtersToggle = page.locator(
			'.smb-reservation-filters__toggle'
		);
		await filtersToggle.waitFor( { timeout: 15_000 } );
		if (
			( await filtersToggle.getAttribute( 'aria-expanded' ) ) === 'true'
		) {
			await filtersToggle.click();
			await page.waitForTimeout( 400 );
		}
		await page.evaluate( () => window.scrollTo( 0, 0 ) );
		await page.waitForTimeout( 300 );
		await shot( page, 'reservations', '01-reservation-list.png' );

		// 02: 予約詳細ダイアログ。既定以外のフォーム（初回相談フォーム）からの予約で、
		//     そのフォームの入力項目と回答が出ることを示す（v0.5.5 H3）。
		const row = page
			.locator( '.smb-table__row' )
			.filter( { hasText: '高橋 健太' } )
			.first();
		await row.waitFor( { timeout: 15_000 } );
		await row.getByRole( 'button', { name: '詳細', exact: true } ).click();
		const modal = page.locator( '.smb-modal' ).first();
		await modal.waitFor( { timeout: 10_000 } );
		await page.waitForTimeout( 500 );
		await scrollInModal(
			page,
			modal.locator( 'text=追加の入力項目' ).first()
		);
		await shot( page, 'reservations', '02-status-change.png' );
		await closeModal( page );
	} );

	/* ---------------------------------------------------------------- */
	/* email（v0.5.5 B: 管理者へのメールの説明・ヒント・確認ダイアログ）    */
	/* ---------------------------------------------------------------- */

	test( 'email', async ( { page } ) => {
		await gotoAdminPage(
			page,
			'smart-booking-settings',
			'.smb-page--settings'
		);
		await page
			.locator( 'button[role="tab"]', { hasText: 'メール通知' } )
			.click();
		await page.waitForTimeout( 800 );

		// 02: 「予約受付メール（管理者宛）」の説明文と「管理者へのメール」トグル直下のヒント。
		await scrollToTop(
			page,
			page
				.locator( 'h3', { hasText: '予約受付メール（管理者宛）' } )
				.first(),
			56
		);
		await shot( page, 'email', '02-admin-notify.png' );

		// 03: トグルを OFF にしようとしたときの確認ダイアログ（保存はしない）。
		// input は .smb-switch__track に覆われているため、ラベル（.smb-switch）側を押す。
		await page
			.locator( '.smb-settings-toggle-row .smb-switch' )
			.first()
			.click();
		await page.waitForSelector( 'text=管理者へのメールをオフにしますか？', {
			timeout: 10_000,
		} );
		await page.waitForTimeout( 400 );
		await shot( page, 'email', '03-admin-off-dialog.png' );
		await page
			.locator( 'button', { hasText: 'キャンセル' } )
			.first()
			.click();
		await page.waitForTimeout( 300 );
	} );

	/* ---------------------------------------------------------------- */
	/* staff（v0.5.5 B: メールアドレス欄のヘルプ文）                       */
	/* ---------------------------------------------------------------- */

	test( 'staff', async ( { page } ) => {
		await gotoAdminPage(
			page,
			'smart-booking-stores',
			'.smb-page--stores'
		);
		await page
			.locator( 'button[role="tab"]', { hasText: '担当者' } )
			.click();
		await page.waitForTimeout( 600 );
		await page
			.locator( 'button', { hasText: '担当者を追加' } )
			.first()
			.click();
		const modal = page.locator( '.smb-modal' ).first();
		await modal.waitFor( { timeout: 10_000 } );
		await page.waitForTimeout( 400 );
		await shot( page, 'staff', '02-staff-add-modal.png' );
		await closeModal( page );
	} );
} );
