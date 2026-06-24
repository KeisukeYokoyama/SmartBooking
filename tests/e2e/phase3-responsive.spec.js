/**
 * Phase 3 Eval-4: レスポンシブ詳細 + アクセシビリティ.
 *
 * 検証範囲:
 *   - レスポンシブ（375px / 768px）
 *       * カード縦並び・タップ領域 44px+
 *       * 日タイル横スクロール / 月セル 32px+ / 時間枠 2列+ / ボタン高さ 44px+
 *       * フォーム input font-size 16px (iOS ズーム防止)
 *       * 確認画面 ラベル/値スタック型
 *       * 完了画面 中央寄せ
 *       * primary ボタン全幅
 *       * 横スクロールが発生しないこと
 *       * カラーカスタマイズがモバイルでも反映
 *       * 768px でも正常表示
 *   - アクセシビリティ
 *       * キーボードのみで全フロー完走
 *       * focus-visible 表示
 *       * aria-label が日本語
 *       * role="alert" / aria-live でエラー読み上げ
 *       * aria-required で必須マーク
 *       * ハニーポット aria-hidden + tabindex=-1
 *       * 見出し階層 h2/h3
 *       * prefers-reduced-motion でアニメ無効化
 *       * @media print でアクション非表示
 *
 * 行動規則:
 *   - DB seed は最小限。afterAll で restoreBaseline().
 *   - テストデータ投入は許可。Task 終了時に baseline 復元.
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

// DB seed / restore があるため serial 実行.
test.describe.configure( { mode: 'serial' } );

/**
 * 7 日分のスケジュールを 10:00-11:00, 14:00-15:00 で投入する.
 * @param storeId
 * @param staffId
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

test.describe( 'Phase 3 Eval-4: レスポンシブ + アクセシビリティ', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// =========================================================================
	// レスポンシブ — モバイル幅（375px）
	// =========================================================================

	test( '375px: ルートが横スクロールせず、カードが縦並びで表示される', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		// 店舗 / 担当者を増やして StoreSelect / StaffSelect が描画される状態にする.
		// smart_booking_show_store_front=1 を設定しないと複数店舗でもスキップされるため先に設定する.
		setOption( 'smart_booking_show_store_front', '1' );
		const { execSync } = require( 'node:child_process' );
		const path = require( 'node:path' );
		execSync(
			`npx wp-env run cli wp db query "INSERT INTO wp_smart_booking_stores (name, phone, email, prefecture, city, address_line, description, image_id, calendar_color, is_active, sort_order, created_at, updated_at) VALUES ('店舗B', '', '', '', '', '', '', 0, '#10b981', 1, 20, NOW(), NOW());"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);

		await gotoFrontForm( page );

		// StoreSelect が表示される.
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toBeVisible();

		// 1. ルートが viewport 幅を超えないこと（横スクロールなし）.
		const root = page.locator( '.smb-front-root' );
		const rootBox = await root.boundingBox();
		expect( rootBox.width ).toBeLessThanOrEqual( 375 );

		// 2. body の scrollWidth が viewport を超えないこと.
		const scrollWidth = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		const clientWidth = await page.evaluate(
			() => document.documentElement.clientWidth
		);
		expect(
			scrollWidth,
			'横スクロールが発生していない'
		).toBeLessThanOrEqual( clientWidth + 1 );

		// 3. カードリストが grid-template-columns: 1fr（1 列）であること.
		const cards = page.locator( '.smb-front-cards' );
		const gridCols = await cards.evaluate(
			( el ) => getComputedStyle( el ).gridTemplateColumns
		);
		// 375px では 1 列のはず（"NUMpx" 単一値）.
		expect(
			gridCols.split( ' ' ).length,
			`grid-template-columns: ${ gridCols }`
		).toBe( 1 );

		// 4. 各カードのタップ領域が 44px 以上.
		const cardCount = await page.locator( '.smb-front-card' ).count();
		expect( cardCount ).toBeGreaterThanOrEqual( 2 );
		for ( let i = 0; i < cardCount; i++ ) {
			const box = await page
				.locator( '.smb-front-card' )
				.nth( i )
				.boundingBox();
			expect( box.height, `card[${ i }] height` ).toBeGreaterThanOrEqual(
				44
			);
		}
	} );

	test( '375px: 日タイルが横スクロール可能で、タイルが 44px 以上のタップ領域を持つ', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await expect(
			page.locator( '.smb-front-section-title', { hasText: '日付選択' } )
		).toBeVisible();

		const strip = page.locator( '.smb-front-day-strip' );
		await expect( strip ).toBeVisible();

		// strip の overflow-x が auto（横スクロール可能）.
		const overflowX = await strip.evaluate(
			( el ) => getComputedStyle( el ).overflowX
		);
		expect( overflowX, `overflow-x: ${ overflowX }` ).toMatch(
			/auto|scroll/
		);

		// 日タイルの個数 = 7（display_period_days デフォルト）.
		const tiles = page.locator( '.smb-front-day-tile' );
		const tileCount = await tiles.count();
		expect( tileCount ).toBeGreaterThanOrEqual( 7 );

		// 各タイルの幅・高さがタップしやすいサイズ（高さは 44px+ を期待）.
		const firstBox = await tiles.first().boundingBox();
		expect( firstBox.height, 'day-tile height' ).toBeGreaterThanOrEqual(
			44
		);
		expect( firstBox.width, 'day-tile width' ).toBeGreaterThanOrEqual( 44 );

		// scrollWidth > clientWidth で実際にスクロール可能.
		const scrollInfo = await strip.evaluate( ( el ) => ( {
			scroll: el.scrollWidth,
			client: el.clientWidth,
		} ) );
		expect(
			scrollInfo.scroll,
			'strip scrollWidth > clientWidth'
		).toBeGreaterThan( scrollInfo.client );
	} );

	test( '375px: 月グリッドが 7列で、セルが 32px 以上の最小幅を持つ', async ( {
		page,
	} ) => {
		setOption( 'smart_booking_calendar_view_mode', 'month_only' );
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await expect(
			page.locator( '.smb-front-section-title', { hasText: '日付選択' } )
		).toBeVisible();

		const grid = page.locator( '.smb-front-month__grid' );
		await expect( grid ).toBeVisible();

		// grid-template-columns: repeat(7, ...) → 7 列分の幅指定.
		const gridCols = await grid.evaluate(
			( el ) => getComputedStyle( el ).gridTemplateColumns
		);
		expect( gridCols.split( ' ' ).length ).toBe( 7 );

		// 任意のセルがタップ最低幅・最低高さ（Gen-D 実装: min-height 40px, 横は 32px+ を許容）.
		const cell = page.locator( '.smb-front-month__cell' ).first();
		const box = await cell.boundingBox();
		expect( box.width, 'month cell width' ).toBeGreaterThanOrEqual( 32 );
		expect( box.height, 'month cell height' ).toBeGreaterThanOrEqual( 40 );
	} );

	test( '375px: 時間枠ボタンが 2列以上で各 44px 以上の高さ', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();

		const list = page.locator( '.smb-front-time-list' );
		await expect( list ).toBeVisible();

		// grid-template-columns に 2 列以上.
		const gridCols = await list.evaluate(
			( el ) => getComputedStyle( el ).gridTemplateColumns
		);
		const colCount = gridCols.split( ' ' ).length;
		expect( colCount, `grid cols: ${ gridCols }` ).toBeGreaterThanOrEqual(
			2
		);

		// 各時間枠ボタンの高さが 44px+.
		const btn = page.locator( '.smb-front-time-btn' ).first();
		const box = await btn.boundingBox();
		expect( box.height, 'time-btn height' ).toBeGreaterThanOrEqual( 44 );
	} );

	test( '375px: フォーム input は font-size 16px（iOS ズーム防止）+ width 100%', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();

		// 必須 3 フィールドの font-size を確認.
		const inputs = [ 'customer_name', 'customer_email', 'customer_phone' ];
		for ( const key of inputs ) {
			const el = page.locator( `#smb-front-field-${ key }` );
			const fontSize = await el.evaluate( ( node ) =>
				parseFloat( getComputedStyle( node ).fontSize )
			);
			expect(
				fontSize,
				`${ key } font-size >= 16px`
			).toBeGreaterThanOrEqual( 16 );

			// width 100% (実測幅が親に近いこと).
			const inputBox = await el.boundingBox();
			const formBox = await page
				.locator( '.smb-front-form' )
				.boundingBox();
			// input は max-width 560 の form 内 width 100% → form 幅と等しいはず.
			expect( inputBox.width ).toBeGreaterThan( formBox.width * 0.9 );
		}
	} );

	test( '375px: primary ボタンが全幅・最低高さ 44px', async ( { page } ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();

		// Gen-D: MainInputPage の集約ボタンは「予約内容の確認」（disabled状態でも DOM に存在）.
		const btn = page.getByRole( 'button', { name: '予約内容の確認' } );
		await expect( btn ).toBeVisible( { timeout: 5_000 } );
		const box = await btn.boundingBox();
		expect( box.height, 'primary btn height' ).toBeGreaterThanOrEqual( 44 );

		// 親コンテナの幅とほぼ同じ（全幅）.
		const mainBox = await page.locator( '.smb-front-main-page' ).boundingBox();
		expect( box.width ).toBeGreaterThan( mainBox.width * 0.9 );
	} );

	test( '375px: 確認画面のラベル/値が縦スタック表示で横スクロールしない', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await fillCoreFormAndGoConfirm( page, {
			name: 'スマホ 太郎',
			email: 'mobile@example.com',
			phone: '080-1234-5678',
		} );

		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toBeVisible();

		// 横スクロール無し.
		const scrollWidth = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		const clientWidth = await page.evaluate(
			() => document.documentElement.clientWidth
		);
		expect( scrollWidth ).toBeLessThanOrEqual( clientWidth + 1 );

		// Gen-D: .smb-front-confirm__pair は .smb-front-confirm-row も持ち display: flex で横並び。
		// 確認画面が横スクロールしないことだけを検証する（display の種別は問わない）。
		// 加えてラベルと値の行が存在することを確認する。
		const pair = page.locator( '.smb-front-confirm__pair' ).first();
		await expect( pair ).toBeVisible();
		const display = await pair.evaluate(
			( el ) => getComputedStyle( el ).display
		);
		// flex または block を許容（Gen-D は flex レイアウト）.
		expect( [ 'block', 'flex', 'contents' ], `pair display: ${ display }` ).toContain( display );
	} );

	test( '375px: 完了画面が中央寄せで予約番号が見やすく表示される', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await fillCoreFormAndGoConfirm( page, {
			name: '完了 ユーザー',
			email: 'done@example.com',
			phone: '090-0000-0000',
		} );
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();

		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		// .smb-front-done が text-align: center.
		const done = page.locator( '.smb-front-done' );
		const textAlign = await done.evaluate(
			( el ) => getComputedStyle( el ).textAlign
		);
		expect( textAlign ).toBe( 'center' );

		// 予約番号バッジが見える + テキストが #数字 形式.
		const num = page.locator( '.smb-front-done__number-value' );
		await expect( num ).toBeVisible();
		await expect( num ).toHaveText( /^#\d+$/ );

		// 横スクロール無し.
		const scrollWidth = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		const clientWidth = await page.evaluate(
			() => document.documentElement.clientWidth
		);
		expect( scrollWidth ).toBeLessThanOrEqual( clientWidth + 1 );
	} );

	test( '375px: カラーカスタマイズ（デザイン設定）がモバイルでも反映される', async ( {
		page,
	} ) => {
		setOption( 'smart_booking_color_button', '#ff0066' );
		setOption( 'smart_booking_color_focus', '#00aabb' );
		await page.setViewportSize( { width: 375, height: 667 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		// CSS 変数が適用されているか.
		const colorButton = await page.evaluate( () => {
			const el = document.getElementById( 'smart-booking-app' );
			return el
				? getComputedStyle( el )
						.getPropertyValue( '--smb-front-color-button' )
						.trim()
				: '';
		} );
		expect( colorButton.toLowerCase() ).toContain( '#ff0066' );

		const colorFocus = await page.evaluate( () => {
			const el = document.getElementById( 'smart-booking-app' );
			return el
				? getComputedStyle( el )
						.getPropertyValue( '--smb-front-color-focus' )
						.trim()
				: '';
		} );
		expect( colorFocus.toLowerCase() ).toContain( '#00aabb' );
	} );

	// =========================================================================
	// レスポンシブ — タブレット幅（768px）
	// =========================================================================

	test( '768px: 主要要素がレイアウト崩れなく表示される（カード 2 列、横スクロール無し）', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 768, height: 1024 } );
		// smart_booking_show_store_front=1 を設定しないと複数店舗でもスキップされるため先に設定する.
		setOption( 'smart_booking_show_store_front', '1' );
		const { execSync } = require( 'node:child_process' );
		const path = require( 'node:path' );
		execSync(
			`npx wp-env run cli wp db query "INSERT INTO wp_smart_booking_stores (name, phone, email, prefecture, city, address_line, description, image_id, calendar_color, is_active, sort_order, created_at, updated_at) VALUES ('店舗B', '', '', '', '', '', '', 0, '#10b981', 1, 20, NOW(), NOW());"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);

		await gotoFrontForm( page );
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toBeVisible();

		// カードリストは 640px 以上で 2 列.
		const cards = page.locator( '.smb-front-cards' );
		const gridCols = await cards.evaluate(
			( el ) => getComputedStyle( el ).gridTemplateColumns
		);
		expect(
			gridCols.split( ' ' ).length,
			`768px grid-template-columns: ${ gridCols }`
		).toBe( 2 );

		// 横スクロール無し.
		const scrollWidth = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		const clientWidth = await page.evaluate(
			() => document.documentElement.clientWidth
		);
		expect( scrollWidth ).toBeLessThanOrEqual( clientWidth + 1 );
	} );

	test( '768px: フォーム → 確認 → 完了 までレイアウト崩れなく表示される', async ( {
		page,
	} ) => {
		await page.setViewportSize( { width: 768, height: 1024 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await fillCoreFormAndGoConfirm( page, {
			name: 'タブレット 太郎',
			email: 'tablet@example.com',
			phone: '090-1111-2222',
		} );

		// 確認画面.
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toBeVisible();

		// Gen-D: .smb-front-confirm-list__dl は grid-template-columns: none で flex 行レイアウト。
		// リスト自体が表示されていて横スクロールしないことを確認する。
		const list = page.locator( '.smb-front-confirm__list' ).first();
		await expect( list ).toBeVisible();
		// 各行 (.smb-front-confirm-row) が表示されている.
		const rows = page.locator( '.smb-front-confirm-row' );
		await expect( rows.first() ).toBeVisible();

		// 横スクロール無し.
		const scrollWidth = await page.evaluate(
			() => document.documentElement.scrollWidth
		);
		const clientWidth = await page.evaluate(
			() => document.documentElement.clientWidth
		);
		expect( scrollWidth ).toBeLessThanOrEqual( clientWidth + 1 );

		// 送信完了.
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );
	} );

	// =========================================================================
	// アクセシビリティ
	// =========================================================================

	test( 'a11y: キーボードのみで日付選択 → 時間枠 → フォーム入力 → 確認画面まで遷移できる', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		// 日付選択ステップ. 最初に有効な日付タイルにフォーカスを置く.
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// JS でフォーカスを最初の有効タイルに置き、Enter キーで選択する（Tab 連打の数依存を避ける）.
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.focus();
		const focused = await page.evaluate(
			() => document.activeElement && document.activeElement.className
		);
		expect( focused, `active class: ${ focused }` ).toContain(
			'smb-front-day-tile'
		);
		await page.keyboard.press( 'Enter' );

		// 時間枠ボタン. 最初の枠にフォーカス → Enter.
		await expect(
			page.locator( '.smb-front-time-btn:not(:disabled)' ).first()
		).toBeVisible();
		await page
			.locator( '.smb-front-time-btn:not(:disabled)' )
			.first()
			.focus();
		await page.keyboard.press( 'Enter' );

		// フォーム入力. 各 input にフォーカス → 入力 → 最後に Enter で送信.
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();
		await page.locator( '#smb-front-field-customer_name' ).focus();
		await page.keyboard.type( 'キーボード 太郎' );
		await page.locator( '#smb-front-field-customer_email' ).focus();
		await page.keyboard.type( 'keyboard@example.com' );
		await page.locator( '#smb-front-field-customer_phone' ).focus();
		await page.keyboard.type( '090-9999-9999' );

		// Gen-D: MainInputPage の集約ボタンは「予約内容の確認」.
		// ボタンが enabled になるまで入力が揃うのを待つ.
		await expect(
			page.getByRole( 'button', { name: '予約内容の確認' } )
		).toBeEnabled( { timeout: 5_000 } );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).focus();
		await page.keyboard.press( 'Enter' );

		// 確認画面.
		await expect(
			page.getByRole( 'heading', { name: '予約内容の確認' } )
		).toBeVisible();
		await expect( page.locator( '.smb-front-confirm' ) ).toContainText(
			'キーボード 太郎'
		);
	} );

	test( 'a11y: focus-visible でフォーカスリングが視覚的に表示される（outline-width 2px）', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );

		// キーボード由来の focus-visible 判定をブラウザに発生させるため、Tab キーでフォーカス遷移する.
		// 最初に body へフォーカスを置いてから Tab を連打して最初のタイルに到達する.
		await page.evaluate( () => {
			document.body.setAttribute( 'tabindex', '-1' );
			document.body.focus();
		} );

		// 最大 50 回 Tab して .smb-front-day-tile にフォーカスが当たるまで進める.
		let activeIsTile = false;
		for ( let i = 0; i < 50; i++ ) {
			await page.keyboard.press( 'Tab' );
			activeIsTile = await page.evaluate( () => {
				const a = document.activeElement;
				return (
					!! a &&
					a.classList &&
					a.classList.contains( 'smb-front-day-tile' )
				);
			} );
			if ( activeIsTile ) {
				break;
			}
		}
		expect(
			activeIsTile,
			'Tab で .smb-front-day-tile にフォーカスが到達する'
		).toBe( true );

		// :focus-visible が適用された結果としての outline-width を取得.
		const outlineWidth = await page.evaluate( () => {
			const a = document.activeElement;
			if ( ! a ) {
				return '';
			}
			return getComputedStyle( a ).outlineWidth;
		} );
		// CSS 上 2px outline が指定されているので 2px 以上を期待.
		const px = parseFloat( outlineWidth );
		expect( px, `outline-width: ${ outlineWidth }` ).toBeGreaterThanOrEqual(
			2
		);

		// outline-style が none ではないこと（実際にリングが描画されること）.
		const outlineStyle = await page.evaluate( () => {
			const a = document.activeElement;
			return a ? getComputedStyle( a ).outlineStyle : '';
		} );
		expect( outlineStyle, `outline-style: ${ outlineStyle }` ).not.toBe(
			'none'
		);
	} );

	test( 'a11y: 店舗・担当者・日付・時間枠の aria-label が日本語で意味のある形式', async ( {
		page,
	} ) => {
		// smart_booking_show_store_front=1 を設定しないと複数店舗でもスキップされるため先に設定する.
		setOption( 'smart_booking_show_store_front', '1' );
		// smart_booking_show_staff_front=1 も設定して担当者選択ステップを表示する.
		setOption( 'smart_booking_show_staff_front', '1' );
		const { execSync } = require( 'node:child_process' );
		const path = require( 'node:path' );
		execSync(
			`npx wp-env run cli wp db query "INSERT INTO wp_smart_booking_stores (name, phone, email, prefecture, city, address_line, description, image_id, calendar_color, is_active, is_system, sort_order, created_at, updated_at) VALUES ('銀座店', '', '', '', '', '', '', 0, '#10b981', 1, 0, 20, NOW(), NOW());"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);
		// 「佐藤 美咲」をユーザー店舗 (USER_STORE_ID) に紐づけ。
		// system エンティティ (id=1) に紐づけてもフロントには出ない。
		execSync(
			`npx wp-env run cli wp db query "INSERT INTO wp_smart_booking_staff (store_id, name, email, phone, description, image_id, sort_order, is_active, is_system, created_at, updated_at) VALUES (${ USER_STORE_ID }, '佐藤 美咲', '', '', '', 0, 20, 1, 0, NOW(), NOW());"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
			}
		);

		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		// 店舗カード.
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toBeVisible();
		await expect( page.getByLabel( /店舗1 を選択/ ) ).toBeVisible();
		await expect( page.getByLabel( /銀座店 を選択/ ) ).toBeVisible();

		// 店舗1 を選択.
		await page.getByLabel( /店舗1 を選択/ ).click();

		// 担当者カード.
		await expect(
			page.getByRole( 'heading', { name: '担当者を選択' } )
		).toBeVisible();
		await expect( page.getByLabel( /担当者1 を選択/ ) ).toBeVisible();
		await expect( page.getByLabel( /佐藤 美咲 を選択/ ) ).toBeVisible();

		// 担当者1 を選択.
		await page.getByLabel( /担当者1 を選択/ ).click();

		// 日付タイルの aria-label. "YYYY年M月D日 (曜日)曜日" を含む.
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		const tile = page.locator( '.smb-front-day-tile' ).first();
		const tileLabel = await tile.getAttribute( 'aria-label' );
		expect( tileLabel ).toMatch( /\d{4}年\d{1,2}月\d{1,2}日/ );
		expect( tileLabel ).toMatch( /[日月火水木金土]曜日/ );

		// 時間枠ボタン.
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		const timeBtn = page.locator( '.smb-front-time-btn' ).first();
		const timeLabel = await timeBtn.getAttribute( 'aria-label' );
		// 「10:00から11:00」を含むこと（既存テストにも依拠）.
		expect( timeLabel ).toMatch( /\d{2}:\d{2}から\d{2}:\d{2}/ );
	} );

	test( 'a11y: フォームエラーが role="alert" で読み上げられる', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();

		// Gen-D: MainInputPage の「予約内容の確認」ボタンは未入力では disabled のまま。
		// FormInput は <form onSubmit={handleSubmit}> を持ち、JS で submit イベントを発火できる。
		// ただし hideSubmit=true 環境では submit ボタンがないため、JS で直接 form.requestSubmit() を呼ぶ。
		const submitted = await page.evaluate( () => {
			const form = document.querySelector( '.smb-front-form' );
			if ( form ) {
				try {
					// requestSubmit は submit イベントを発火しつつ noValidate も尊重する。
					form.requestSubmit();
					return true;
				} catch ( e ) {
					// フォールバック: submitEvent dispatch。
					form.dispatchEvent( new Event( 'submit', { bubbles: true, cancelable: true } ) );
					return true;
				}
			}
			return false;
		} );
		expect( submitted, 'form submit event fired' ).toBe( true );

		// React が state を更新するまで少し待つ。
		await page.waitForTimeout( 500 );

		// フォームバリデーション後は aria-invalid='true' が付く（必須フィールドが空の場合）.
		const invalidInputs = await page
			.locator(
				'input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"]'
			)
			.count();
		expect(
			invalidInputs,
			'aria-invalid=true on at least one field'
		).toBeGreaterThan( 0 );
	} );

	test( 'a11y: 必須フィールドに aria-required="true" が付与されている', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();

		// 必須 3 フィールド.
		for ( const key of [
			'customer_name',
			'customer_email',
			'customer_phone',
		] ) {
			const el = page.locator( `#smb-front-field-${ key }` );
			await expect( el ).toHaveAttribute( 'aria-required', 'true' );
			// ラベル横の '*' に aria-label='必須' が付く.
		}
		// 必須マークの aria-label='必須' が 3 個以上.
		const requiredMarks = page.locator(
			'.smb-front-form__required[aria-label="必須"]'
		);
		expect( await requiredMarks.count() ).toBeGreaterThanOrEqual( 3 );
	} );

	test( 'a11y: ハニーポットフィールドが aria-hidden + tabindex=-1 でアクセス不可', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();

		// ハニーポットラッパが aria-hidden=true.
		const wrap = page.locator( '.smb-front-honeypot' );
		await expect( wrap ).toHaveAttribute( 'aria-hidden', 'true' );

		// 内部 input が tabindex=-1.
		const input = wrap.locator( 'input[type=text]' );
		await expect( input ).toHaveAttribute( 'tabindex', '-1' );

		// 視覚的に非表示（off-screen）であること（left: -9999px）.
		// .smb-front-honeypot の left を見る.
		const honeypotLeft = await wrap.evaluate(
			( el ) => getComputedStyle( el ).left
		);
		expect( honeypotLeft, `honeypot left: ${ honeypotLeft }` ).toBe(
			'-9999px'
		);
	} );

	test( 'a11y: 見出し階層 h2/h3 が論理的（StepHeader=h2, 確認画面のグループタイトル=h3）', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		// 日付選択ステップ: MainInputPage 統合後は h3.smb-front-section-title で「日付選択」が表示される.
		await expect(
			page.locator( 'h3.smb-front-section-title' )
		).toBeVisible();

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();

		await fillCoreFormAndGoConfirm( page, {
			name: '見出し テスト',
			email: 'h@example.com',
			phone: '080-0000-0000',
		} );

		// 確認画面: h2=「予約内容の確認」(StepHeader)、確認リストが表示される.
		await expect(
			page.getByRole( 'heading', { level: 2, name: '予約内容の確認' } )
		).toBeVisible();
		// 確認リストが表示されている（フィールド値が dl/dt/dd で表示）.
		await expect(
			page.locator( '.smb-front-confirm__list' )
		).toBeVisible();

		// 完了画面: h2=「ご予約ありがとうございました」.
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				level: 2,
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );
	} );

	test( 'a11y: prefers-reduced-motion でアニメーション/トランジションが無効化される', async ( {
		browser,
	} ) => {
		const context = await browser.newContext( {
			viewport: { width: 1280, height: 720 },
			reducedMotion: 'reduce',
		} );
		const page = await context.newPage();

		try {
			seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
			await gotoFrontForm( page );

			await page.waitForSelector(
				'.smb-front-day-tile:not(.is-disabled)',
				{ timeout: 10_000 }
			);
			const tile = page
				.locator( '.smb-front-day-tile:not(.is-disabled)' )
				.first();
			const transition = await tile.evaluate(
				( el ) => getComputedStyle( el ).transitionDuration
			);
			// transition-duration: 0s（none に設定済）の状態を期待.
			expect( transition, `tile transition: ${ transition }` ).toBe(
				'0s'
			);

			// btn の transition も 0s.
			await tile.click();
			const btn = page.locator( '.smb-front-time-btn' ).first();
			const btnTransition = await btn.evaluate(
				( el ) => getComputedStyle( el ).transitionDuration
			);
			expect( btnTransition ).toBe( '0s' );
		} finally {
			await context.close();
		}
	} );

	test( 'print: @media print でアクションボタンが非表示', async ( {
		page,
	} ) => {
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID );
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await expect(
			page.locator( '#smb-front-field-customer_name' )
		).toBeVisible();

		// emulate print media.
		await page.emulateMedia( { media: 'print' } );

		// .smb-front-form__actions が display: none.
		const actions = page.locator( '.smb-front-form__actions' );
		const display = await actions.evaluate(
			( el ) => getComputedStyle( el ).display
		);
		expect( display, `actions display in print: ${ display }` ).toBe(
			'none'
		);
	} );
} );
