/**
 * Phase 9 Eval-1: フロント予約フォーム リデザイン（画面構成の変更）検証。
 *
 * 仕様: docs/legacy-ui-handover/spec-amendment-frontend-redesign.md「変更1: 画面構成の変更」
 *
 * 検証対象:
 *   1) メイン入力画面で日付・時間・フォーム入力が同一画面に表示されること
 *   2) フロー完走 (main → confirm → done)
 *   3) 「修正する」で main 画面に戻り、入力値・日時選択が保持されていること
 *   4) flow_order の切替 (A: 日付→フォーム / B: フォーム→日付) でセクション順が変わること
 *   5) 店舗1・担当者1 のスキップ（いきなり main 画面）
 *   6) フォーム幅 450px 以下であること（desktop ビューポート時）
 *
 * NOTE:
 *   - phase3-helpers.js の fixture / DB 操作を流用する。
 *   - desktop project のみで実行されることを想定（mobile プロジェクトでも壊れないように
 *     フォーム幅検証は viewport 幅を見て分岐する）。
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertSchedulesBulk,
	fillCoreFormAndGoConfirm,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );

// fixture を共有するため serial 実行.
test.describe.configure( { mode: 'serial' } );

/**
 * 今日から 1〜6 日後までの 10:00-11:00 / 14:00-15:00 スケジュールを投入する。
 *
 * @param {number} storeId
 * @param {number} staffId
 * @return {{firstSelectable: string}}
 */
function seedWeekSchedules( storeId, staffId ) {
	const rows = [];
	for ( let i = 1; i <= 6; i++ ) {
		const d = ymd( i );
		rows.push( {
			storeId,
			staffId,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		rows.push( {
			storeId,
			staffId,
			date: d,
			start: '14:00:00',
			end: '15:00:00',
			capacity: 3,
		} );
	}
	insertSchedulesBulk( rows );
	return { firstSelectable: ymd( 1 ) };
}

test.describe( 'Phase 9 Eval-1: 画面構成（リデザイン）検証', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// ---- 1) メイン入力画面に日付・時間・フォームが同一画面で揃う ----

	test( 'メイン入力画面: 日付セクション・時間スロット・フォーム入力・確認ボタンが同一画面に並ぶ', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		// 店舗1・担当者1 → 直接 main 画面.
		const main = page.locator( '.smb-front-main-page' );
		await expect( main ).toBeVisible();

		// 日付選択セクションが存在 (embedded mode のため「日付選択」見出し).
		await expect( main.getByRole( 'heading', { name: /日付選択/ } ) ).toBeVisible();

		// availability ロード完了待ち → 日付タイル表示.
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// 旧来の「次へ」(date → time / time → form) ボタンが存在しないこと.
		// Playwright の getByRole exact だと厳密一致になるため、テキスト検索 + ステップヘッダー外で確認.
		await expect( page.getByRole( 'button', { name: /^次へ$/ } ) ).toHaveCount( 0 );

		// フォーム入力（必須3フィールド）が「日付選択時」より前の段階で既に DOM に存在すること.
		// = 旧設計では date ステップ中はフォームが未マウントだった。新設計では同画面に共存する。
		await expect( page.locator( '#smb-front-field-customer_name' ) ).toBeVisible();
		await expect( page.locator( '#smb-front-field-customer_email' ) ).toBeVisible();
		await expect( page.locator( '#smb-front-field-customer_phone' ) ).toBeVisible();

		// 確認ボタン (画面最下部・1 つだけ) が存在.
		const confirmBtns = page.locator( '.smb-front-main-page__confirm-btn' );
		await expect( confirmBtns ).toHaveCount( 1 );
		await expect( confirmBtns ).toHaveText( /予約内容の確認/ );

		// 日付未選択・フォーム未入力時は disabled になっていること.
		await expect( confirmBtns ).toBeDisabled();

		// 日付タイルを選択 → 同じ画面の中で時間スロットが表示される（time region が現れる）.
		await page.locator( '.smb-front-day-tile:not(.is-disabled)' ).first().click();
		await expect(
			main.getByRole( 'region', { name: '選択した日の時間枠' } )
		).toBeVisible();

		// 時間スロット選択後も画面遷移せず、依然として main 画面 (フォームが見えている).
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect( main ).toBeVisible();
		await expect( page.locator( '#smb-front-field-customer_name' ) ).toBeVisible();
	} );

	// ---- 2) フロー完走 main → confirm → done ----

	test( 'フロー完走: main → confirm → done で予約番号が表示される', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page.locator( '.smb-front-day-tile:not(.is-disabled)' ).first().click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		await page.locator( '#smb-front-field-customer_name' ).fill( 'リデザイン 太郎' );
		await page.locator( '#smb-front-field-customer_email' ).fill( 'redesign@example.com' );
		await page.locator( '#smb-front-field-customer_phone' ).fill( '090-1234-5678' );

		// 「予約内容の確認」ボタンをクリック → confirm ページ.
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();

		await expect( page.locator( '.smb-front-confirm-page' ) ).toBeVisible();
		await expect( page.locator( '.smb-front-confirm' ) ).toContainText( 'リデザイン 太郎' );
		await expect( page.locator( '.smb-front-confirm' ) ).toContainText( 'redesign@example.com' );

		// 「予約を確定する」 → done ページ.
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect( page.locator( '.smb-front-done-page' ) ).toBeVisible( { timeout: 10_000 } );
		await expect( page.locator( '.smb-front-done__number-value' ) ).toContainText( /^#\d+$/ );
	} );

	// ---- 3) 修正ボタンで main に戻り、入力値・日時選択が保持される ----

	test( '「修正する」で main 画面に戻り、フォーム入力値・日付・時間の選択状態が保持される', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		// 選択した日付タイルの aria-label を取り、後で比較する.
		const firstTile = page.locator( '.smb-front-day-tile:not(.is-disabled)' ).first();
		const selectedDateLabel = await firstTile.getAttribute( 'aria-label' );
		await firstTile.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		const name = '保持確認 太郎';
		const email = 'keep@example.com';
		const phone = '080-9876-5432';
		await page.locator( '#smb-front-field-customer_name' ).fill( name );
		await page.locator( '#smb-front-field-customer_email' ).fill( email );
		await page.locator( '#smb-front-field-customer_phone' ).fill( phone );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();

		await expect( page.locator( '.smb-front-confirm-page' ) ).toBeVisible();

		// 「入力内容を修正する」 → main へ戻る.
		await page.getByRole( 'button', { name: '入力内容を修正する' } ).click();
		await expect( page.locator( '.smb-front-main-page' ) ).toBeVisible();

		// フォーム値の保持.
		await expect( page.locator( '#smb-front-field-customer_name' ) ).toHaveValue( name );
		await expect( page.locator( '#smb-front-field-customer_email' ) ).toHaveValue( email );
		await expect( page.locator( '#smb-front-field-customer_phone' ) ).toHaveValue( phone );

		// 日付タイルの選択状態保持: aria-label に保存日付の年月日プレフィクスを含み、is-selected が付与されている.
		// 元の aria-label には「選択中」が付いていなかったが、戻った後は付くため、年月日プレフィクスのみで照合.
		const dateOnly = ( selectedDateLabel || '' ).replace( /\s.*/, '' ); // 例: '2026年4月28日'
		const reSelectedTile = page.locator(
			`.smb-front-day-tile.is-selected[aria-label^="${ dateOnly }"]`
		);
		await expect( reSelectedTile ).toHaveCount( 1 );

		// 時間スロットの選択状態保持: 10:00 のスロットが選択済み.
		const selectedTime = page.locator( '.smb-front-time-slots .is-selected' );
		await expect( selectedTime ).toHaveCount( 1 );
		await expect( selectedTime ).toContainText( /10:00/ );
	} );

	// ---- 4) flow_order の切替 ----

	test( 'flow_order=A (default): 日付セクションがフォームより上に来る', async ( {
		page,
	} ) => {
		// baseline で flow_order option は未設定 = デフォルト 'A'.
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		const sections = page.locator( '.smb-front-main-page__section' );
		await expect( sections ).toHaveCount( 2 );

		// 1番目に日付選択セクション、2番目にフォーム入力セクションがあること.
		const firstSectionText = await sections.nth( 0 ).innerText();
		const secondSectionText = await sections.nth( 1 ).innerText();
		expect( firstSectionText ).toContain( '日付' );
		// FormInput 側は hideHeader のためフィールドラベル (お名前等) で判定.
		expect( secondSectionText ).toMatch( /お名前|メール|電話/ );

		// y 座標でも順序確認.
		const firstY = await sections.nth( 0 ).evaluate( ( el ) => el.getBoundingClientRect().top );
		const secondY = await sections.nth( 1 ).evaluate( ( el ) => el.getBoundingClientRect().top );
		expect( secondY ).toBeGreaterThan( firstY );
	} );

	test( 'flow_order=B: フォームセクションが日付セクションより上に来る', async ( {
		page,
	} ) => {
		setOption( 'smabo_booking_flow_order', 'B' );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		const sections = page.locator( '.smb-front-main-page__section' );
		await expect( sections ).toHaveCount( 2 );

		const firstSectionText = await sections.nth( 0 ).innerText();
		const secondSectionText = await sections.nth( 1 ).innerText();
		// 1番目がフォーム、2番目が日付.
		expect( firstSectionText ).toMatch( /お名前|メール|電話/ );
		expect( secondSectionText ).toContain( '日付' );

		const firstY = await sections.nth( 0 ).evaluate( ( el ) => el.getBoundingClientRect().top );
		const secondY = await sections.nth( 1 ).evaluate( ( el ) => el.getBoundingClientRect().top );
		expect( secondY ).toBeGreaterThan( firstY );
	} );

	// ---- 5) 店舗1・担当者1 のスキップ ----

	test( '店舗1・担当者1: 店舗選択・担当者選択がスキップされ、いきなり main 画面に到達する', async ( {
		page,
	} ) => {
		// baseline = store=1 / staff=1.
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await expect( page.locator( '.smb-front-main-page' ) ).toBeVisible();
		// 店舗・担当者選択ヘッダは表示されない.
		await expect( page.getByRole( 'heading', { name: '店舗を選択' } ) ).toHaveCount( 0 );
		await expect( page.getByRole( 'heading', { name: '担当者を選択' } ) ).toHaveCount( 0 );
	} );

	// ---- 6) フォーム幅 450px 以下 ----

	test( 'main 画面のフォーム幅が 450px 以下に制限されている (desktop)', async ( {
		page,
		viewport,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await expect( page.locator( '.smb-front-main-page' ) ).toBeVisible();

		const width = await page
			.locator( '.smb-front-main-page' )
			.evaluate( ( el ) => el.getBoundingClientRect().width );

		const vw = ( viewport && viewport.width ) || 1280;
		if ( vw >= 498 ) {
			// 1280px のような十分広い viewport では max-width: 450px が効くべき (誤差±2px 許容).
			expect( width ).toBeGreaterThanOrEqual( 448 );
			expect( width ).toBeLessThanOrEqual( 452 );
		} else {
			// 狭い viewport（例: 375px）では calc(100vw - 48px) ≒ 327px となるはず.
			// 仕様書のレスポンシブ幅相当を許容範囲で検証.
			const expected = vw - 48;
			expect( width ).toBeGreaterThanOrEqual( expected - 4 );
			expect( width ).toBeLessThanOrEqual( expected + 4 );
		}
	} );
} );
