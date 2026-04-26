/**
 * Phase 6 Eval (Gen-C): 店舗・担当者フロント表示制御 E2E。
 *
 * docs/spec-amendment-store-staff-visibility.md に基づく統合テスト。
 *
 * テストシナリオ:
 *   A. show_store_front=OFF       → 店舗選択ステップが出ず、確認/完了画面に店舗名が出ない。
 *   B. show_staff_front=OFF       → 担当者選択ステップが出ず、同一時刻枠は capacity 合算。
 *                                   予約完了で内部的に sort_order 順の担当者へ自動割当。
 *   C. 両方 OFF                    → いきなり日付選択。確認/完了画面に店舗名・担当者名なし。
 *   D. 既存挙動（両方 ON、店舗2/担当者2） → 旧来通り完走、店舗名・担当者名が表示される。
 *
 * テスト後は必ず option / DB を baseline に戻す。
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertStore,
	insertStaff,
	insertSchedulesBulk,
	getLatestReservation,
	fillCoreFormAndGoConfirm,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { wpCli } = require( './helpers' );

// DB seed/restore の競合を避けるため serial。
test.describe.configure( { mode: 'serial' } );

/**
 * 指定 (storeId, staffId) について +1 〜 +6 日の 10:00-11:00, 14:00-15:00 を 2 枠ずつ作成。
 * @param {number} storeId
 * @param {number} staffId
 * @param {number} capacity
 */
function seedWeekSchedules( storeId, staffId, capacity = 1 ) {
	const rows = [];
	for ( let i = 1; i <= 6; i++ ) {
		const d = ymd( i );
		rows.push( {
			storeId,
			staffId,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity,
		} );
		rows.push( {
			storeId,
			staffId,
			date: d,
			start: '14:00:00',
			end: '15:00:00',
			capacity,
		} );
	}
	insertSchedulesBulk( rows );
}

test.describe( 'Phase 6 (Gen-C): 店舗・担当者フロント表示制御', () => {
	test.setTimeout( 90_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		// option 系も明示的にデフォルトへ戻す（restoreBaseline は visibility option を消さないため）。
		try {
			wpCli( 'option delete smb_show_store_front' );
		} catch ( _e ) {
			// noop.
		}
		try {
			wpCli( 'option delete smb_show_staff_front' );
		} catch ( _e ) {
			// noop.
		}
	} );

	test.afterAll( async () => {
		restoreBaseline();
		try {
			wpCli( 'option delete smb_show_store_front' );
		} catch ( _e ) {
			// noop.
		}
		try {
			wpCli( 'option delete smb_show_staff_front' );
		} catch ( _e ) {
			// noop.
		}
	} );

	// ============================================================
	// A. show_store_front=OFF
	// ============================================================

	test( 'A: show_store_front=OFF + 店舗2 → 店舗選択スキップ・確認/完了に店舗名なし', async ( {
		page,
	} ) => {
		// 店舗 2 件、担当者は店舗1 に 1 名（baseline）→ 担当者ステップもスキップ。
		const store2 = insertStore( '渋谷店', { sort_order: 30 } );
		// 店舗1 のみにスケジュールを入れる（sort_order 最小の店舗が選ばれる前提を検証）。
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID, 3 );
		// store2 にも担当者を作る（フロントの自動割り当て先候補として 1 名）。
		insertStaff( store2, '渋谷担当', { sort_order: 20 } );

		setOption( 'smb_show_store_front', 0 );

		await gotoFrontForm( page );

		// 店舗選択ステップが表示されないこと。
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toHaveCount( 0 );

		// 担当者は店舗1 に 1 名のみ → 担当者選択もスキップ → いきなり日付選択。
		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();

		// 完走させる。
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		await fillCoreFormAndGoConfirm( page, {
			name: 'A 太郎',
			email: 'a@example.com',
			phone: '090-1111-1111',
		} );

		// 確認画面: 店舗名行が出ない（dt が無い、または店舗1 文字列が出ない）。
		await expect( page.locator( '.smb-front-confirm' ) ).toBeVisible();
		const confirmText = await page
			.locator( '.smb-front-confirm' )
			.innerText();
		expect( confirmText ).not.toContain( '店舗1' );
		// 担当者は表示される設定（show_staff_front=ON）。「担当者1」は出る or staff スキップ時に
		// 表示されないはず → このケースは staff も自動スキップ（1 名）だが state.staffId=1 で
		// ConfirmPage は表示する。よって担当者名は出るのが現仕様。
		// → assert は店舗のみ非表示で確認する。

		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		const doneText = await page
			.locator( '.smb-front-done__summary' )
			.innerText();
		expect( doneText ).not.toContain( '店舗1' );
	} );

	// ============================================================
	// B. show_staff_front=OFF + 同一時刻枠統合
	// ============================================================

	test( 'B: show_staff_front=OFF + 担当者2 → 担当者ステップなし・capacity 合算・自動割当', async ( {
		page,
	} ) => {
		// 店舗1 (id=USER_STORE_ID) に担当者を 2 名（既存の '担当者1' + 新規 1 名）。
		const staffA = USER_STAFF_ID; // 担当者1（baseline）
		const staffB = insertStaff( USER_STORE_ID, '担当者B', {
			sort_order: 30,
		} );

		// 同じ日時に staffA / staffB それぞれが capacity=1 のスケジュールを持つ。
		const d = ymd( 1 );
		insertSchedulesBulk( [
			{
				storeId: USER_STORE_ID,
				staffId: staffA,
				date: d,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 1,
			},
			{
				storeId: USER_STORE_ID,
				staffId: staffB,
				date: d,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 1,
			},
		] );

		setOption( 'smb_show_staff_front', 0 );

		await gotoFrontForm( page );

		// 担当者選択ステップが表示されない → 日付選択へ直行。
		await expect(
			page.getByRole( 'heading', { name: '担当者を選択' } )
		).toHaveCount( 0 );
		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();

		// 日付タイル → 時間枠ボタン。
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		const dateLabel = `${ d.slice( 5, 7 ).replace( /^0/, '' ) }月${ d
			.slice( 8, 10 )
			.replace( /^0/, '' ) }日`;
		// dateLabel に該当するタイルを優先。なければ最初の有効タイルを選択。
		const matchedTile = page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.filter( { hasText: dateLabel } );
		if ( ( await matchedTile.count() ) > 0 ) {
			await matchedTile.first().click();
		} else {
			await page
				.locator( '.smb-front-day-tile:not(.is-disabled)' )
				.first()
				.click();
		}

		// 時間枠ボタンの aria-label に "(残りX席)" のような表現は無いので、availability badge を見る。
		// capacity=2 (1+1) 表示を確認するため、ボタン自体が enabled で 1 件存在することを確認。
		const slotBtn = page.getByRole( 'button', { name: /10:00から11:00/ } );
		await expect( slotBtn ).toHaveCount( 1 );
		await slotBtn.click();

		// フォーム入力 → 確定（1 件目）。
		await fillCoreFormAndGoConfirm( page, {
			name: 'B 一郎',
			email: 'b1@example.com',
			phone: '090-2222-1111',
		} );

		// 確認画面: 担当者名が出ない（show_staff_front=OFF）。
		await expect( page.locator( '.smb-front-confirm' ) ).toBeVisible();
		const confirmText = await page
			.locator( '.smb-front-confirm' )
			.innerText();
		expect( confirmText ).not.toContain( '担当者1' );
		expect( confirmText ).not.toContain( '担当者B' );

		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		// 完了画面: 担当者行が出ない。
		const doneText = await page
			.locator( '.smb-front-done__summary' )
			.innerText();
		expect( doneText ).not.toContain( '担当者1' );
		expect( doneText ).not.toContain( '担当者B' );

		// DB 検証: 1 件目は sort_order が小さい staffA (=1) に割当られたはず。
		const r1 = getLatestReservation();
		expect( r1, '1件目 reservation 作成' ).not.toBeNull();
		expect( r1.status ).toBe( 'pending' );
		// schedule_id が staffA の枠であること。
		const cnt = wpCli(
			`db query "SELECT staff_id FROM wp_smb_schedules WHERE id = ${ r1.schedule_id };" --skip-column-names`
		)
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( ( s ) => /^\d+$/.test( s ) );
		expect( cnt[ 0 ] ).toBe( String( staffA ) );

		// --- 2 件目: 別タブで再アクセスして別担当者へ自動割当を検証 ---
		await page.goto( '/?page_id=7', { waitUntil: 'domcontentloaded' } );
		await page.waitForFunction(
			() =>
				!! window.smartBookingFrontend &&
				!! window.smartBookingFrontend.nonce
		);
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await fillCoreFormAndGoConfirm( page, {
			name: 'B 二郎',
			email: 'b2@example.com',
			phone: '090-2222-2222',
		} );
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		const r2 = getLatestReservation();
		expect( r2, '2件目 reservation 作成' ).not.toBeNull();
		const cnt2 = wpCli(
			`db query "SELECT staff_id FROM wp_smb_schedules WHERE id = ${ r2.schedule_id };" --skip-column-names`
		)
			.split( '\n' )
			.map( ( s ) => s.trim() )
			.filter( ( s ) => /^\d+$/.test( s ) );
		expect( cnt2[ 0 ] ).toBe( String( staffB ) );

		// 3 件目: capacity=2 / booked=2 になっているはず → DB レベルで満席を確認。
		const aggregateAvail = wpCli(
			`db query "SELECT SUM(capacity), SUM(booked_count) FROM wp_smb_schedules WHERE store_id = ${ USER_STORE_ID } AND schedule_date = '${ d }' AND start_time = '10:00:00';" --skip-column-names`
		);
		const numbers = aggregateAvail
			.split( /\s+/ )
			.map( ( s ) => parseInt( s, 10 ) )
			.filter( ( n ) => Number.isFinite( n ) );
		// 期待: capacity 合計 = 2, booked 合計 = 2 (各 staff 1件ずつ)。
		expect( numbers[ 0 ] ).toBe( 2 );
		expect( numbers[ 1 ] ).toBe( 2 );
	} );

	// ============================================================
	// C. 両方 OFF
	// ============================================================

	test( 'C: 両方 OFF → いきなり日付選択・確認/完了に店舗名・担当者名なし', async ( {
		page,
	} ) => {
		// 店舗 2、各店舗に担当者 1 ずつ。
		const store2 = insertStore( '梅田店', { sort_order: 30 } );
		insertStaff( store2, '梅田担当', { sort_order: 30 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID, 3 );

		setOption( 'smb_show_store_front', 0 );
		setOption( 'smb_show_staff_front', 0 );

		await gotoFrontForm( page );

		// いきなり日付選択。
		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toHaveCount( 0 );
		await expect(
			page.getByRole( 'heading', { name: '担当者を選択' } )
		).toHaveCount( 0 );

		// 完走。
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		await fillCoreFormAndGoConfirm( page, {
			name: 'C 三郎',
			email: 'c@example.com',
			phone: '090-3333-3333',
		} );

		// 確認画面: 店舗名・担当者名いずれも出ない。
		const confirmText = await page
			.locator( '.smb-front-confirm' )
			.innerText();
		expect( confirmText ).not.toContain( '店舗1' );
		expect( confirmText ).not.toContain( '梅田店' );
		expect( confirmText ).not.toContain( '担当者1' );
		expect( confirmText ).not.toContain( '梅田担当' );

		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		const doneText = await page
			.locator( '.smb-front-done__summary' )
			.innerText();
		expect( doneText ).not.toContain( '店舗1' );
		expect( doneText ).not.toContain( '梅田店' );
		expect( doneText ).not.toContain( '担当者1' );
		expect( doneText ).not.toContain( '梅田担当' );
	} );

	// ============================================================
	// D. 既存挙動の互換性（両方 ON、店舗2/担当者2）
	// ============================================================

	test( 'D: 両方 ON（デフォルト） + 店舗2/担当者2 → 旧来通りフルフロー、店舗名・担当者名表示', async ( {
		page,
	} ) => {
		const store2 = insertStore( '札幌店', { sort_order: 30 } );
		insertStaff( USER_STORE_ID, '担当者B', { sort_order: 30 } ); // 店舗1 に 2 人目
		insertStaff( store2, '札幌担当', { sort_order: 20 } );
		seedWeekSchedules( USER_STORE_ID, USER_STAFF_ID, 3 );

		// option はデフォルト（未設定 = ON）。明示的にも ON にしておく。
		setOption( 'smb_show_store_front', 1 );
		setOption( 'smb_show_staff_front', 1 );

		await gotoFrontForm( page );

		// 店舗選択 → 担当者選択 → 日付 → 時間 → フォーム → 確認 → 完了。
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toBeVisible();
		await page.getByRole( 'button', { name: /店舗1 を選択/ } ).click();

		await expect(
			page.getByRole( 'heading', { name: '担当者を選択' } )
		).toBeVisible();
		await page.getByRole( 'button', { name: /担当者1 を選択/ } ).click();

		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		await fillCoreFormAndGoConfirm( page, {
			name: 'D 四郎',
			email: 'd@example.com',
			phone: '090-4444-4444',
		} );

		// 確認画面: 店舗名・担当者名 いずれも表示される。
		await expect( page.locator( '.smb-front-confirm' ) ).toContainText(
			'店舗1'
		);
		await expect( page.locator( '.smb-front-confirm' ) ).toContainText(
			'担当者1'
		);

		await page.getByRole( 'button', { name: '予約を確定する' } ).click();
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		await expect(
			page.locator( '.smb-front-done__summary' )
		).toContainText( '店舗1' );
		await expect(
			page.locator( '.smb-front-done__summary' )
		).toContainText( '担当者1' );
	} );
} );
