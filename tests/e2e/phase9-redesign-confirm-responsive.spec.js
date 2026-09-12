/**
 * Phase 9 Eval-4: 確認画面・完了画面・レスポンシブ（リデザイン）検証。
 *
 * 仕様: docs/legacy-ui-handover/spec-amendment-frontend-redesign.md
 *   「変更3: 確認画面のレイアウト変更」「変更4: 完了画面のレイアウト変更」「変更2: フォーム幅 / レスポンシブ」
 *
 * 検証対象:
 *   1) 確認画面: 予約日時カードが中央寄せ + 薄背景（var(--smb-front-bg-light) 由来）で表示される
 *   2) 確認画面: 入力情報がラベル+値の flex 行（ラベル幅 120px）で表示される
 *   3) 完了画面: 大型アイコン（✓）と予約番号（#数字）が表示される
 *   4) レスポンシブ 375px: フォームが器の幅いっぱい（最大 450px）で、横スクロールが発生しない
 *   5) レスポンシブ 375px: 全フローが操作可能
 *   6) レスポンシブ 768px: max-width 450px が効きレイアウトが崩れない
 *
 * NOTE:
 *   - phase3-helpers.js の fixture / DB 操作を流用する。
 *   - レスポンシブテストは page.setViewportSize で動的に切り替える。
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	insertSchedulesBulk,
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
}

/**
 * main 画面で日付・時間・必須3フィールドを埋め、確認画面まで進める。
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          [opts]
 */
async function fillMainAndGoConfirm(
	page,
	{
		name = 'リデザイン 太郎',
		email = 'redesign4@example.com',
		phone = '090-1234-5678',
	} = {}
) {
	await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
		timeout: 10_000,
	} );
	await page.locator( '.smb-front-day-tile:not(.is-disabled)' ).first().click();
	await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
	await page.locator( '#smb-front-field-customer_name' ).fill( name );
	await page.locator( '#smb-front-field-customer_email' ).fill( email );
	await page.locator( '#smb-front-field-customer_phone' ).fill( phone );
	const confirmBtn = page.getByRole( 'button', { name: '予約内容の確認' } );
	await confirmBtn.scrollIntoViewIfNeeded();
	await confirmBtn.click();
	await expect( page.locator( '.smb-front-confirm-page' ) ).toBeVisible( {
		timeout: 10_000,
	} );
}

test.describe( 'Phase 9 Eval-4: 確認/完了/レスポンシブ', () => {
	test.setTimeout( 90_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// ---- 1) 確認画面: 予約日時カードが中央寄せで薄背景 ----

	test( '確認画面: 予約日時カードが中央寄せ + 薄背景 (rgb(248,249,250)) で表示される', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await fillMainAndGoConfirm( page );

		const summary = page.locator( '.smb-front-confirm-summary' );
		await expect( summary ).toBeVisible();

		const datetime = summary.locator(
			'.smb-front-confirm-summary__datetime'
		);
		await expect( datetime ).toBeVisible();
		// 予約日時テキストが空でないこと（年月日 or 時刻フォーマットを含む）.
		const datetimeText = ( await datetime.innerText() ).trim();
		expect( datetimeText.length ).toBeGreaterThan( 0 );
		// 「10:00」が含まれること（先ほど選択した時間枠）.
		expect( datetimeText ).toMatch( /10:00/ );

		// 中央寄せ判定: text-align が center.
		const styles = await summary.evaluate( ( el ) => {
			const cs = window.getComputedStyle( el );
			return {
				textAlign: cs.textAlign,
				backgroundColor: cs.backgroundColor,
				marginLeft: cs.marginLeft,
				marginRight: cs.marginRight,
			};
		} );
		expect( styles.textAlign ).toBe( 'center' );
		// var(--smb-front-bg-light) = #f8f9fa = rgb(248, 249, 250).
		expect( styles.backgroundColor ).toBe( 'rgb(248, 249, 250)' );
	} );

	// ---- 2) 確認画面: ラベル + 値の flex 行 (ラベル幅 120px) ----

	test( '確認画面: 入力情報がラベル+値の flex 行 (ラベル幅 120px) で並ぶ', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await fillMainAndGoConfirm( page );

		const list = page.locator( '.smb-front-confirm-list' );
		await expect( list ).toBeVisible();

		const rows = page.locator( '.smb-front-confirm-row' );
		const rowCount = await rows.count();
		// 必須3フィールド以上の行があること.
		expect( rowCount ).toBeGreaterThanOrEqual( 3 );

		// 最初の行が flex で、ラベル幅が 120px 程度.
		const firstRow = rows.first();
		const rowDisplay = await firstRow.evaluate(
			( el ) => window.getComputedStyle( el ).display
		);
		expect( rowDisplay ).toBe( 'flex' );

		const labelWidth = await firstRow
			.locator( '.smb-front-confirm-label' )
			.evaluate( ( el ) => el.getBoundingClientRect().width );
		// デスクトップ: flex: 0 0 120px / モバイル ≤480px: flex: 0 0 96px (値領域確保のため狭める).
		const viewportWidth = page.viewportSize().width;
		const expectedLabelWidth = viewportWidth <= 480 ? 96 : 120;
		expect( labelWidth ).toBeGreaterThanOrEqual( expectedLabelWidth - 2 );
		expect( labelWidth ).toBeLessThanOrEqual( expectedLabelWidth + 2 );

		// 値部に入力した名前が含まれること.
		await expect( list ).toContainText( 'リデザイン 太郎' );
	} );

	// ---- 3) 完了画面: 大型アイコン + 予約番号 ----

	test( '完了画面: 大型アイコン (✓) と予約番号 #数字 が表示される', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );
		await fillMainAndGoConfirm( page, {
			name: '完了 太郎',
			email: 'done@example.com',
			phone: '080-0000-1111',
		} );

		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect( page.locator( '.smb-front-done-page' ) ).toBeVisible( {
			timeout: 10_000,
		} );

		// 大型アイコン.
		const icon = page.locator( '.smb-front-done-icon' ).first();
		await expect( icon ).toBeVisible();
		const mark = page.locator( '.smb-front-done-icon__mark' );
		await expect( mark ).toBeVisible();
		await expect( mark ).toHaveText( /✓/ );
		// font-size が 40px 以上（大型）であること.
		const fontSize = await mark.evaluate( ( el ) =>
			parseFloat( window.getComputedStyle( el ).fontSize )
		);
		expect( fontSize ).toBeGreaterThanOrEqual( 40 );

		// 予約番号 #数字.
		const numberValue = page.locator( '.smb-front-done__number-value' );
		await expect( numberValue ).toBeVisible();
		await expect( numberValue ).toHaveText( /^#\d+$/ );

		// 詳細カードが存在.
		await expect(
			page.locator( '.smb-front-done-detail-card' )
		).toBeVisible();
	} );

	// ---- 4) レスポンシブ 375px: 器いっぱい（最大 450px）+ 横スクロールなし ----

	/*
	 * 旧期待値は `375 - 48 = 327px`（±2px）だったが、この数式はアーカイブ文書
	 * `docs/legacy-ui-handover/spec-amendment-frontend-redesign.md` のデザインモック値で、
	 * **CSS 宣言として一度も実装されていない**。実装は
	 * `.smb-front-main-page { max-width: 450px; width: 100% }` ＝「器いっぱい、ただし最大 450px」で、
	 * 器の幅はテーマのグローバルパディング（プラグインの制御外・Twenty Twenty-Five は
	 * `clamp(30px, 5vw, 50px)`）に依存するため、**viewport 相対の絶対値はテーマ非依存に書けない**。
	 * 375px の実測 285px（= 375 − 30×2 − 15×2）が実装どおりの正しい値。
	 * 経緯と実測は `docs/investigation/front-main-page-width-375px-20260912.md`、
	 * 判断は `docs/bugs/phase9-form-width-mobile-285px.md` を参照。
	 */
	test( 'レスポンシブ 375px: フォームが器の幅いっぱい（最大 450px）で横スクロール無し', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		const main = page.locator( '.smb-front-main-page' );
		await expect( main ).toBeVisible();

		const m = await main.evaluate( ( el ) => {
			const parent = el.parentElement;
			const ps = window.getComputedStyle( parent );
			const rect = el.getBoundingClientRect();
			return {
				width: rect.width,
				left: rect.left,
				right: rect.right,
				parentClass: parent.className,
				// 器の content box 幅（= width:100% が解決する基準）.
				parentContentWidth:
					parent.getBoundingClientRect().width -
					parseFloat( ps.paddingLeft ) -
					parseFloat( ps.paddingRight ) -
					parseFloat( ps.borderLeftWidth ) -
					parseFloat( ps.borderRightWidth ),
				bodyScrollWidth: document.body.scrollWidth,
				docScrollWidth: document.documentElement.scrollWidth,
				innerWidth: window.innerWidth,
			};
		} );

		const detail = `width=${ m.width } parentContentWidth=${ m.parentContentWidth } parent=${ m.parentClass }`;

		// (a) 器いっぱい、ただし 450px 上限.
		const expected = Math.min( 450, m.parentContentWidth );
		expect( Math.abs( m.width - expected ), detail ).toBeLessThanOrEqual(
			1
		);
		expect( m.width, detail ).toBeLessThanOrEqual( 452 );

		// (b) 375px では器が 450px 未満なので器いっぱいになる。テーマ余白はテーマ依存で
		//     絶対値を固定できないため、「viewport の半分以上」という緩い下限で
		//     レイアウト崩壊だけを捕捉する（実測は 285px = 76%）.
		expect( m.parentContentWidth, detail ).toBeLessThan( 450 );
		expect( m.width, detail ).toBeGreaterThanOrEqual( 375 * 0.5 );

		// (c) はみ出さない／横スクロール無し.
		expect( m.left ).toBeGreaterThanOrEqual( -1 );
		expect( m.right ).toBeLessThanOrEqual( m.innerWidth + 1 );
		expect( m.bodyScrollWidth ).toBeLessThanOrEqual( m.innerWidth + 1 );
		expect( m.docScrollWidth ).toBeLessThanOrEqual( m.innerWidth + 1 );
	} );

	// ---- 5) レスポンシブ 375px: 全フロー操作可能 ----

	test( 'レスポンシブ 375px: main → confirm → done を最後まで操作可能', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		// 日付選択.
		const tile = page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first();
		await tile.scrollIntoViewIfNeeded();
		await tile.click();

		// 時間選択.
		const slot = page.getByRole( 'button', { name: /10:00から11:00/ } );
		await slot.scrollIntoViewIfNeeded();
		await slot.click();

		// フォーム入力.
		const nameField = page.locator( '#smb-front-field-customer_name' );
		await nameField.scrollIntoViewIfNeeded();
		await nameField.fill( 'モバイル 太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'mobile@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-2222-3333' );

		// 確認ボタン.
		const confirmBtn = page.getByRole( 'button', {
			name: '予約内容の確認',
		} );
		await confirmBtn.scrollIntoViewIfNeeded();
		await confirmBtn.click();
		await expect(
			page.locator( '.smb-front-confirm-page' )
		).toBeVisible( { timeout: 10_000 } );

		// 確定.
		const submitBtn = page.getByRole( 'button', {
			name: '予約を確定する',
		} );
		await submitBtn.scrollIntoViewIfNeeded();
		await submitBtn.click();
		await expect( page.locator( '.smb-front-done-page' ) ).toBeVisible( {
			timeout: 10_000,
		} );
		await expect(
			page.locator( '.smb-front-done__number-value' )
		).toHaveText( /^#\d+$/ );
	} );

	// ---- 6) レスポンシブ 768px: max-width 450px が効く ----

	test( 'レスポンシブ 768px: フォーム幅が max-width 450px に制限され、レイアウトが崩れない', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 768, height: 1024 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		const main = page.locator( '.smb-front-main-page' );
		await expect( main ).toBeVisible();

		const width = await main.evaluate(
			( el ) => el.getBoundingClientRect().width
		);
		// 768px viewport では max-width: 450px が効くべき (誤差±2px).
		expect( width ).toBeGreaterThanOrEqual( 448 );
		expect( width ).toBeLessThanOrEqual( 452 );

		// 主要要素が描画されている（レイアウト崩れの一次チェック）.
		await expect(
			main.getByRole( 'heading', { name: /日付選択/ } )
		).toBeVisible();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();
		await expect(
			page.locator( '.smb-front-main-page__confirm-btn' )
		).toHaveCount( 1 );

		// 横スクロール無し.
		const overflow = await page.evaluate( () => ( {
			scrollWidth: document.body.scrollWidth,
			innerWidth: window.innerWidth,
		} ) );
		expect( overflow.scrollWidth ).toBeLessThanOrEqual(
			overflow.innerWidth + 1
		);
	} );
} );
