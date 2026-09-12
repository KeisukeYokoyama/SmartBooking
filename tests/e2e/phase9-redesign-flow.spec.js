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
 *   6) フォーム幅が器（テーマのコンテンツ幅）いっぱい・最大 450px で、はみ出さないこと
 *
 * NOTE:
 *   - phase3-helpers.js の fixture / DB 操作を流用する。
 *   - 幅の検証は viewport 相対の絶対値ではなく、実装（max-width:450px + width:100%）の
 *     構造的な性質で行う。理由は 6) のテスト直前のコメントを参照。
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

		// v0.5.3 (B-1): 確認ボタンは常時 clickable。日付未選択・フォーム未入力で押しても
		// 確認画面へ進めず、不足を知らせるヒントが表示される（旧: disabled で押下不可だった）.
		await confirmBtns.click();
		await expect( page.locator( '.smb-front-main-page__hint' ) ).toBeVisible();

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
		setOption( 'smart_booking_booking_flow_order', 'B' );
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

	// ---- 6) フォーム幅: 器いっぱい + 最大 450px + はみ出さない ----

	/*
	 * 実装（`src/frontend/styles/frontend.css` の
	 * `.smb-front-main-page { max-width: 450px; width: 100% }`）は
	 * **「器の幅いっぱい、ただし最大 450px」** という設計である。
	 *
	 * 器（`.smb-front-root` の content box）の幅は
	 *   viewport − テーマのグローバルパディング×2 − `.smb-front-root` のパディング×2
	 * で決まる。テーマのグローバルパディングはプラグインの制御外で、Twenty Twenty-Five では
	 * `clamp(30px, 5vw, 50px)`（375px→30px / 1280px→50px）。テーマを変えれば別の値になる。
	 * ＝ **viewport 相対の絶対値は、テーマ非依存な期待値として書けない。**
	 *
	 * このテストは以前、狭い viewport で `calc(100vw - 48px)` ≒ 327px を期待していたが、
	 * その数式はアーカイブ文書
	 * `docs/legacy-ui-handover/spec-amendment-frontend-redesign.md` のデザインモック値であり、
	 * **CSS 宣言として一度も実装されていない**（`src/` の `100vw` 2 ヒットはどちらもコメント）。
	 * 375px の実測 285px が実装どおりの正しい値で、テストが存在しない仕様を固定していた。
	 * 経緯と実測は `docs/investigation/front-main-page-width-375px-20260912.md`、
	 * 判断は `docs/bugs/phase9-form-width-mobile-285px.md` を参照。
	 */
	test( 'main 画面のフォーム幅が器いっぱい・最大 450px で、ビューポートからはみ出さない', async ( {
		page,
		viewport,
	} ) => {
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
				innerWidth: window.innerWidth,
				docScrollWidth: document.documentElement.scrollWidth,
			};
		} );

		const detail = `width=${ m.width } parentContentWidth=${ m.parentContentWidth } parent=${ m.parentClass }`;

		// (a) 器いっぱい、ただし 450px 上限（= max-width:450px + width:100% そのもの）.
		const expected = Math.min( 450, m.parentContentWidth );
		expect( Math.abs( m.width - expected ), detail ).toBeLessThanOrEqual(
			1
		);

		// (b) 450px を超えない（仕様「フォーム最大幅 450px」・誤差 ±2px 許容）.
		expect( m.width, detail ).toBeLessThanOrEqual( 452 );

		// (c) ビューポートからはみ出さない／横スクロールを作らない.
		expect( m.left ).toBeGreaterThanOrEqual( -1 );
		expect( m.right ).toBeLessThanOrEqual( m.innerWidth + 1 );
		expect( m.docScrollWidth ).toBeLessThanOrEqual( m.innerWidth + 1 );

		const vw = ( viewport && viewport.width ) || m.innerWidth;
		if ( m.parentContentWidth >= 450 ) {
			// 器が 450px より広い viewport（1280px など）では max-width が支配する.
			expect( m.width, detail ).toBeGreaterThanOrEqual( 448 );
		} else {
			// 器が 450px 未満（375px など）では器いっぱいになる。テーマ余白はテーマ依存で
			// 絶対値を固定できないため、「viewport の半分以上」という緩い下限で
			// レイアウト崩壊だけを捕捉する（375px の実測は 285px = 76%）.
			expect( m.width, detail ).toBeGreaterThanOrEqual( vw * 0.5 );
		}
	} );
} );
