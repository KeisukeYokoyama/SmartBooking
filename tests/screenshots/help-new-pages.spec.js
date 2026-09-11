/**
 * 公式サイト ヘルプページ用スクリーンショット — 新規ページ分（forms / conditional-fields /
 * form-mail / address-field / settings）。
 *
 * 各カットの「撮るべき画面・状態」は、サイト側の原稿に埋め込まれた撮影指示が正本:
 *   ~/dev/smart-booking-website/content/help/markdown/<slug>.md の `<!-- 撮影: NN-name.png — … -->`
 *   （バックログ側の一覧は ~/dev/smart-booking-website/docs/help-backlog.md §C2）
 *
 * 位置づけ:
 *   - 回帰スイートではない。`npm run screenshots` でのみ実行される。
 *   - expect を増やす場所ではない（目的は見た目のキャプチャのみ）。
 *
 * 前提:
 *   - wp-env 起動済み。
 *   - 撮影用シード投入済み（tests/screenshots/seed/screenshot-seed.php）。
 *     原稿が例示する「無料体験のお申し込み」フォーム・「資料送付 / 送付先住所 / ご住所」の
 *     各項目・「体験コース」はシードが作る（名前は原稿と一致させてある）。
 *   - フロントの予約ページは固定ページ「予約フォーム」（`[smart_booking]`＝既定フォーム）。
 *     id はハードコードせず、スラッグ/タイトルではなくショートコード設置ページを URL で開く。
 */
const { test } = require( '@playwright/test' );
const { loginAsAdmin } = require( '../e2e/helpers' );
const {
	shot,
	gotoAdminPage,
	scrollToTop,
	scrollInModal,
	openFormSettings,
	openFieldEditModal,
	closeModal,
	autoAcceptDialogs,
} = require( './helpers' );

const FRONT_PAGE_PATH = '/?page_id=5';
const DEMO_STORE = '渋谷店';
const DEMO_STAFF = '山田 太郎';

/**
 * 直前の操作で付いたフォーカスリングを消す（撮影ノイズ対策）。
 *
 * @param {import('@playwright/test').Page} page
 */
async function blurActive( page ) {
	await page.evaluate( () => {
		/* eslint-disable @wordpress/no-global-active-element --
		   これはブラウザ側で評価されるスニペットであり、React コンポーネントではない。
		   ref を持たないため ownerDocument 経由の代替がなく、フォーカスを外す手段は
		   document.activeElement.blur() しかない。 */
		if ( document.activeElement && document.activeElement.blur ) {
			document.activeElement.blur();
		}
		/* eslint-enable @wordpress/no-global-active-element */
	} );
	await page.waitForTimeout( 150 );
}

/**
 * 予約一覧の「絞り込み」パネルの開閉をそろえる。
 *
 * ReservationFilters は `useState( true )`＝**既定で開いている**。
 * 無条件にトグルを押すと閉じてしまうので、現在の aria-expanded を見てから押す。
 *
 * @param {import('@playwright/test').Page} page
 * @param {boolean}                         wantOpen
 */
async function setFiltersOpen( page, wantOpen ) {
	const toggle = page.locator( '.smb-reservation-filters__toggle' );
	await toggle.waitFor( { timeout: 15_000 } );
	const isOpen = ( await toggle.getAttribute( 'aria-expanded' ) ) === 'true';
	if ( isOpen !== wantOpen ) {
		await toggle.click();
		await page.waitForTimeout( 400 );
	}
}

/**
 * フロントの予約フォームを「入力画面」まで進める。
 *
 * 店舗選択 → 担当者選択 → 日付 → 時間 の順（シードが店舗/担当者ステップを ON にしている）。
 *
 * @param {import('@playwright/test').Page} page
 */
async function gotoFrontInputStep( page ) {
	await page.goto( FRONT_PAGE_PATH, { waitUntil: 'domcontentloaded' } );
	await page.waitForFunction(
		() =>
			!! window.smartBookingFrontend &&
			!! window.smartBookingFrontend.nonce,
		{ timeout: 20_000 }
	);
	await page.waitForSelector( '.smb-front-cards', { timeout: 20_000 } );
	await page
		.locator( '.smb-front-card', { hasText: DEMO_STORE } )
		.first()
		.click();
	await page.waitForTimeout( 600 );
	await page
		.locator( '.smb-front-card', { hasText: DEMO_STAFF } )
		.first()
		.click();
	await page.waitForTimeout( 900 );

	const day = page
		.locator( 'button.smb-front-day-tile:not([disabled])' )
		.first();
	await day.waitFor( { timeout: 20_000 } );
	await day.click();
	await page.waitForSelector( '.smb-front-time-list', { timeout: 20_000 } );
	await page.waitForTimeout( 500 );

	const slot = page
		.locator( 'button.smb-front-time-btn:not([disabled])' )
		.first();
	await slot.waitFor( { timeout: 20_000 } );
	await slot.click();
	// 入力画面（氏名の input）が出るまで待つ。
	await page.waitForSelector( '#smb-front-field-customer_name', {
		timeout: 20_000,
	} );
	await page.waitForTimeout( 600 );
}

test.describe( 'help screenshots: new pages', () => {
	test.beforeEach( async ( { page } ) => {
		autoAcceptDialogs( page );
		await loginAsAdmin( page );
	} );

	/* ---------------------------------------------------------------- */
	/* forms（複数フォームの使い分け）                                    */
	/* ---------------------------------------------------------------- */

	test( 'forms', async ( { page } ) => {
		// 01: フォームセレクタ。既定でないフォームを選ぶと「削除」と form_id 付き
		//     ショートコードの両方が出る。
		await openFormSettings( page, '無料体験のお申し込み' );
		await page.evaluate( () => window.scrollTo( 0, 0 ) );
		await page.waitForTimeout( 300 );
		await shot( page, 'forms', '01-form-selector.png' );

		// 02: 「フォームを追加」モーダル（名前を入力済みの状態）。保存はしない。
		await page
			.locator( 'button', { hasText: 'フォームを追加' } )
			.first()
			.click();
		const modal = page.locator( '.smb-modal' ).first();
		await modal.waitFor( { timeout: 10_000 } );
		await modal.locator( 'input[type="text"]' ).first().fill( '入塾相談' );
		await page.waitForTimeout( 300 );
		await shot( page, 'forms', '02-form-add-modal.png' );
		await closeModal( page );

		// 03: 予約一覧の「フォーム」列 ＋ 絞り込みの「フォーム」欄。
		await gotoAdminPage(
			page,
			'smart-booking-reservations',
			'.smb-page--reservations'
		);
		// 絞り込みパネルは既定で開いている（ReservationFilters の useState( true )）。
		// 無条件にクリックすると閉じてしまうため、閉じているときだけ開く。
		await setFiltersOpen( page, true );
		await scrollToTop(
			page,
			page.locator( '.smb-reservation-filters' ),
			56
		);
		await shot( page, 'forms', '03-reservation-form-column.png' );
	} );

	/* ---------------------------------------------------------------- */
	/* conditional-fields（表示条件）                                     */
	/* ---------------------------------------------------------------- */

	test( 'conditional-fields (admin)', async ( { page } ) => {
		// 01: 「送付先住所」の編集モーダル。表示条件 ON ＋ 親＝資料送付 ＋ 値＝希望する。
		await openFormSettings( page, '標準フォーム' );
		let modal = await openFieldEditModal( page, '送付先住所' );
		await scrollInModal( page, modal.locator( 'text=表示条件' ).first() );
		await shot( page, 'conditional-fields', '01-condition-section.png' );
		await closeModal( page );

		// 06: 親フィールドは種別を変更できない（v0.5.4）。
		modal = await openFieldEditModal( page, '資料送付' );
		await scrollInModal(
			page,
			modal.locator( 'text=フィールドタイプ' ).first()
		);
		await shot( page, 'conditional-fields', '06-parent-type-locked.png' );
		await closeModal( page );

		// 05: 親フィールドの削除はブロックされる（依存エラーのメッセージ）。
		const parentRow = page
			.locator( '.smb-field-list__row' )
			.filter( { hasText: '資料送付' } )
			.first();
		await parentRow
			.getByRole( 'button', { name: '削除', exact: true } )
			.click();
		await page.waitForTimeout( 400 );
		await page.locator( 'button', { hasText: '削除する' } ).first().click();
		// エラートーストが出るまで待つ（6 秒表示）。
		await page.waitForSelector( 'text=先に表示条件を解除してください', {
			timeout: 10_000,
		} );
		await page.waitForTimeout( 300 );
		await shot(
			page,
			'conditional-fields',
			'05-parent-delete-blocked.png'
		);

		// 02: 親候補が 0 件のフォーム（選択式を含まない）の編集モーダル。
		await openFormSettings( page, '無料体験のお申し込み' );
		modal = await openFieldEditModal( page, '体験コース' );
		await scrollInModal( page, modal.locator( 'text=表示条件' ).first() );
		await shot( page, 'conditional-fields', '02-no-parent-candidate.png' );
		await closeModal( page );
	} );

	test( 'conditional-fields (front)', async ( { page } ) => {
		await gotoFrontInputStep( page );

		const material = page.locator( '.smb-front-form-group' ).filter( {
			hasText: '資料送付',
		} );
		// 03: 「希望しない」を選び、送付先住所が出ていない状態。
		await page
			.locator( 'label', { hasText: '希望しない' } )
			.first()
			.click();
		await blurActive( page );
		// ラベル「資料送付」が管理バーに潜らない位置まで送る（04 と同じ位置で撮る）。
		await scrollToTop( page, material.first(), 72 );
		await page.waitForTimeout( 300 );
		await shot( page, 'conditional-fields', '03-front-hidden.png' );

		// 04: 同じスクロール位置のまま「希望する」に切り替え、送付先住所が現れた状態。
		await page.locator( 'label', { hasText: '希望する' } ).first().click();
		await blurActive( page );
		await scrollToTop( page, material.first(), 72 );
		await page.waitForTimeout( 400 );
		await shot( page, 'conditional-fields', '04-front-shown.png' );
	} );

	/* ---------------------------------------------------------------- */
	/* form-mail（フォーム別のメール文面）                                */
	/* ---------------------------------------------------------------- */

	test( 'form-mail', async ( { page } ) => {
		// 01: メールタブ。予約受付（ユーザー宛）だけ ON、残り 2 種別は共通文面プレビュー。
		await openFormSettings( page, '無料体験のお申し込み', 'mail' );
		await scrollToTop(
			page,
			page.locator( '.smb-notice--info' ).first(),
			56
		);
		await shot( page, 'form-mail', '01-form-mail-tab.png' );

		// 02: 本文入力欄と「使える変数」（固定8変数＋カスタム項目＋注記）。
		await scrollToTop(
			page,
			page
				.locator( '.smb-mail-body' )
				.first()
				.locator( 'textarea' )
				.first(),
			56
		);
		await shot( page, 'form-mail', '02-variable-helper.png' );

		// 03: 「設定 → メール通知」側に出る「専用文面を使用中」の注記。
		await gotoAdminPage(
			page,
			'smart-booking-settings',
			'.smb-page--settings'
		);
		await page
			.locator( 'button[role="tab"]', { hasText: 'メール通知' } )
			.click();
		await page.waitForTimeout( 800 );
		await scrollToTop(
			page,
			page
				.locator( 'h3', { hasText: '予約受付メール（ユーザー宛）' } )
				.first(),
			56
		);
		await shot( page, 'form-mail', '03-override-note.png' );
	} );

	/* ---------------------------------------------------------------- */
	/* address-field（住所（郵便番号））                                  */
	/* ---------------------------------------------------------------- */

	test( 'address-field (admin)', async ( { page } ) => {
		// 01: 住所カードの「＋ 追加」から開いたモーダル（ラベル入力済み・自動入力 ON）。
		await openFormSettings( page, '標準フォーム' );
		const card = page
			.locator( '.smb-field-type-card' )
			.filter( { hasText: '住所（郵便番号）' } )
			.first();
		await card.getByRole( 'button', { name: /追加/ } ).click();
		const modal = page.locator( '.smb-modal' ).first();
		await modal.waitFor( { timeout: 10_000 } );
		await modal.locator( 'input' ).first().fill( 'ご住所' );
		await page.waitForTimeout( 300 );
		await scrollInModal( page, modal.locator( 'text=ラベル' ).first() );
		await shot( page, 'address-field', '01-address-field-modal.png' );
		await closeModal( page );

		// 03: 既存項目のタイプを「住所（郵便番号）」へ変えたとき、自動入力が ON で開く（v0.5.5 H6）。
		await openFormSettings( page, '無料体験のお申し込み' );
		const editModal = await openFieldEditModal( page, '体験コース' );
		await editModal
			.locator( 'select' )
			.first()
			.selectOption( { label: '住所（郵便番号）' } );
		await page.waitForTimeout( 400 );
		await scrollInModal(
			page,
			editModal.locator( 'text=住所の自動入力' ).first()
		);
		await shot( page, 'address-field', '03-address-type-autofill.png' );
		await closeModal( page );
	} );

	test( 'address-field (front)', async ( { page } ) => {
		await gotoFrontInputStep( page );

		const zip = page.locator( '#smb-front-field-home_address-zip' );
		await zip.scrollIntoViewIfNeeded();
		await zip.fill( '1500002' );
		// zipcloud への問い合わせは debounce 付き。住所欄が埋まるまで待つ。
		await page.waitForFunction(
			() => {
				const el = document.getElementById(
					'smb-front-field-home_address-address'
				);
				return !! el && el.value.trim() !== '';
			},
			{ timeout: 20_000 }
		);
		await blurActive( page );
		await page.waitForTimeout( 300 );
		// ページ末尾に近いので offset を大きめに取り、フッターが画面の大半を占めないようにする。
		await scrollToTop(
			page,
			page
				.locator( '.smb-front-form-group' )
				.filter( { hasText: 'ご住所' } )
				.first(),
			200
		);
		await shot( page, 'address-field', '02-address-front.png' );
	} );

	/* ---------------------------------------------------------------- */
	/* settings（設定リファレンス）                                       */
	/* ---------------------------------------------------------------- */

	test( 'settings', async ( { page } ) => {
		// 01: 設定を開いた直後（見出し＋5タブ＋「予約フロー」冒頭）。
		await gotoAdminPage(
			page,
			'smart-booking-settings',
			'.smb-page--settings'
		);
		await page.evaluate( () => window.scrollTo( 0, 0 ) );
		await page.waitForTimeout( 300 );
		await shot( page, 'settings', '01-settings-tabs.png' );

		// 02: 「空き状況の表示」セクション全体（しきい値・文言 3 つは空欄のまま）。
		await scrollToTop(
			page,
			page.locator( 'h3', { hasText: '空き状況の表示' } ).first(),
			56
		);
		await shot( page, 'settings', '02-basic-availability.png' );

		// 03: 「フロント表示」セクション全体。店舗選択 ON / 担当者選択 OFF にして
		//     ON・OFF 両方の状態文言を 1 枚に写す（保存はしない）。
		const staffRow = page
			.locator( '.smb-settings-row' )
			.filter( { hasText: '担当者選択ステップ' } )
			.first();
		await staffRow.locator( '.smb-switch' ).first().click();
		await page.waitForTimeout( 400 );
		await scrollToTop(
			page,
			page.locator( 'h3', { hasText: 'フロント表示' } ).first(),
			56
		);
		await shot( page, 'settings', '03-basic-front-display.png' );
	} );
} );
