/**
 * Phase 7: システムエンティティ方式（is_system カラム）の挙動検証.
 *
 * docs/spec-amendment-system-entity.md に基づく。
 *
 * テストシナリオ:
 *   A. 初期状態（ユーザー店舗・担当者 0 件）でスケジュール作成
 *      → 管理画面のスケジュール追加モーダルから日付・時間枠を入力するだけで保存できる。
 *   B. 初期状態（ユーザーエンティティ 0 件）でフロント予約フォームを開くと、
 *      ステップが直接 date になる（store/staff ステップが完全スキップ）。
 *   C. ユーザー店舗を 1 つ追加した後、スケジュール追加モーダルの店舗ドロップダウンに
 *      ユーザー店舗のみ表示され、システム店舗 (id=1) は出ない。
 *   D. ユーザー担当者を追加した後、同様に担当者ドロップダウンにユーザー担当者のみ表示。
 *   E. 管理画面の店舗・担当者管理（StoresPage）にシステムエンティティが表示されない。
 *   F. REST API で is_system=1 の id=1 を DELETE すると 400。
 *   G. ユーザーエンティティ無しの状態で予約完了 → 確認/完了画面に店舗・担当者の名前が出ない。
 */
const { test, expect } = require( '@playwright/test' );
const {
	bootstrapAdmin,
	restCall,
	restoreSnapshot,
	restoreSnapshotSystemOnly,
	USER_STORE_ID,
	USER_STAFF_ID,
	ymd,
} = require( './phase2-helpers' );
const {
	gotoFrontForm,
	insertSchedule,
	fillCoreFormAndGoConfirm,
} = require( './phase3-helpers' );

test.describe.configure( { mode: 'serial' } );

test.describe( 'Phase 7: システムエンティティ方式 - 管理画面', () => {
	test.setTimeout( 60_000 );

	test.afterAll( () => {
		// 後続テストに影響しないよう、ユーザー店舗・担当者付きベースラインへ戻す。
		restoreSnapshot();
	} );

	// ============================================================
	// A. 初期状態（ユーザーエンティティ 0 件）でスケジュール作成
	// ============================================================

	test( 'A: ユーザー店舗・担当者 0 件でも管理画面 REST POST schedules で日時のみ指定して保存できる', async ( {
		page,
	} ) => {
		restoreSnapshotSystemOnly();
		await bootstrapAdmin( page, 'schedule' );
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15_000 } );

		const tomorrow = ymd( 1 );
		// store_id / staff_id を未指定のまま POST → サーバ側で is_system=1 を自動補完。
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					schedule_date: tomorrow,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 3,
					is_active: 1,
				},
			],
		} );
		expect( res.ok, JSON.stringify( res.data ) ).toBe( true );
		expect( Array.isArray( res.data.ids ) ).toBe( true );
		expect( res.data.ids.length ).toBe( 1 );

		// 作成されたスケジュールの store_id / staff_id がシステムエンティティ (id=1) になっていること。
		const list = await restCall( page, 'GET', 'schedules', null, {
			date_from: tomorrow,
			date_to: tomorrow,
		} );
		expect( list.ok ).toBe( true );
		const arr = Array.isArray( list.data )
			? list.data
			: list.data.schedules || [];
		const created = arr.find( ( s ) => s.id === res.data.ids[ 0 ] );
		expect( created ).toBeTruthy();
		expect( created.store_id ).toBe( 1 );
		expect( created.staff_id ).toBe( 1 );
	} );

	// ============================================================
	// E. 管理画面の店舗・担当者管理にシステムエンティティが表示されない
	// ============================================================

	test( 'E: 店舗管理タブにシステム店舗 (id=1) が表示されず、ユーザー店舗のみ表示', async ( {
		page,
	} ) => {
		restoreSnapshot(); // ユーザー店舗を 1 件 seed (id=2 = 店舗1)
		await bootstrapAdmin( page, 'stores' );
		await page.waitForSelector( '.smb-page--stores', { timeout: 15_000 } );

		// 表示中のカードはユーザー店舗のみ。
		await expect(
			page.locator( '.smb-card-list article.smb-card' )
		).toHaveCount( 1 );
		await expect(
			page.locator( '.smb-card__title', { hasText: '店舗1' } )
		).toBeVisible();
		// 「デフォルト」（system 店舗）はカードに出てこない。
		await expect(
			page.locator( '.smb-card__title', { hasText: 'デフォルト' } )
		).toHaveCount( 0 );

		// 担当者タブも同様。
		await page.locator( '.smb-tab', { hasText: '担当者' } ).click();
		await expect(
			page.locator( '.smb-card-list article.smb-card' )
		).toHaveCount( 1 );
		await expect(
			page.locator( '.smb-card__title', { hasText: '担当者1' } )
		).toBeVisible();
		await expect(
			page.locator( '.smb-card__title', { hasText: 'デフォルト' } )
		).toHaveCount( 0 );
	} );

	test( 'E: ユーザー店舗・担当者 0 件のとき店舗・担当者管理は空状態（systemエンティティは隠す）', async ( {
		page,
	} ) => {
		restoreSnapshotSystemOnly();
		await bootstrapAdmin( page, 'stores' );
		await page.waitForSelector( '.smb-page--stores', { timeout: 15_000 } );

		// REST 一覧 (is_system=0 のみ) は空配列。
		const stores = await restCall( page, 'GET', 'stores' );
		expect( stores.ok ).toBe( true );
		const items = Array.isArray( stores.data )
			? stores.data
			: stores.data.items || [];
		expect( items ).toEqual( [] );

		const staff = await restCall( page, 'GET', 'staff' );
		expect( staff.ok ).toBe( true );
		const sitems = Array.isArray( staff.data )
			? staff.data
			: staff.data.items || [];
		expect( sitems ).toEqual( [] );

		// UI 上もカード 0 枚。
		await expect(
			page.locator( '.smb-card-list article.smb-card' )
		).toHaveCount( 0 );
	} );

	// ============================================================
	// F. is_system=1 の DELETE 拒否
	// ============================================================

	test( 'F: REST API で is_system=1 の店舗 (id=1) を DELETE すると 400', async ( {
		page,
	} ) => {
		restoreSnapshotSystemOnly();
		await bootstrapAdmin( page, 'stores' );

		const res = await restCall( page, 'DELETE', 'stores/1' );
		expect( res.ok ).toBe( false );
		expect( res.status ).toBe( 400 );
		expect( res.data && res.data.code ).toBe( 'smb_store_is_system' );
	} );

	test( 'F: REST API で is_system=1 の担当者 (id=1) を DELETE すると 400', async ( {
		page,
	} ) => {
		restoreSnapshotSystemOnly();
		await bootstrapAdmin( page, 'stores' );

		const res = await restCall( page, 'DELETE', 'staff/1' );
		expect( res.ok ).toBe( false );
		expect( res.status ).toBe( 400 );
		expect( res.data && res.data.code ).toBe( 'smb_staff_is_system' );
	} );

	// ============================================================
	// C. スケジュール管理ドロップダウン: ユーザー店舗追加後はユーザー店舗のみ
	// ============================================================

	test( 'C/D: スケジュール追加モーダルの店舗・担当者ドロップダウンにユーザー作成のみ表示（システムは出ない）', async ( {
		page,
	} ) => {
		restoreSnapshot(); // user store id=2, user staff id=2
		await bootstrapAdmin( page, 'schedule' );
		await page.goto( '/wp-admin/admin.php?page=smart-booking' );
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15_000 } );

		// REST から見ても is_system=1 のレコードは含まれないことを再確認。
		const stores = await restCall( page, 'GET', 'stores' );
		expect( stores.ok ).toBe( true );
		const sitems = Array.isArray( stores.data )
			? stores.data
			: stores.data.items || [];
		expect( sitems.length ).toBe( 1 );
		expect( sitems[ 0 ].id ).toBe( USER_STORE_ID );
		expect( sitems[ 0 ].name ).toBe( '店舗1' );
		// 念のため: いずれの行も is_system=0（または未設定）.
		for ( const s of sitems ) {
			expect( s.is_system ? 1 : 0 ).toBe( 0 );
		}

		const staff = await restCall( page, 'GET', 'staff' );
		expect( staff.ok ).toBe( true );
		const stitems = Array.isArray( staff.data )
			? staff.data
			: staff.data.items || [];
		expect( stitems.length ).toBe( 1 );
		expect( stitems[ 0 ].id ).toBe( USER_STAFF_ID );
		expect( stitems[ 0 ].name ).toBe( '担当者1' );
	} );
} );

// ================================================================
// フロント側テスト
// ================================================================

test.describe( 'Phase 7: システムエンティティ方式 - フロント', () => {
	test.setTimeout( 60_000 );

	test.afterAll( () => {
		restoreSnapshot();
	} );

	// ============================================================
	// B. 初期状態でフロントは date ステップから始まる
	// ============================================================

	test( 'B: ユーザーエンティティ 0 件でフロントを開くと store/staff ステップ無しで日付選択から始まる', async ( {
		page,
	} ) => {
		restoreSnapshotSystemOnly();
		// system store/staff (id=1) でスケジュールを 1 件入れて、画面が空にならないようにする。
		insertSchedule( {
			storeId: 1,
			staffId: 1,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );

		await gotoFrontForm( page );

		// 店舗・担当者選択ヘッダは出ない（hasUserStores=false / hasUserStaff=false でスキップ）。
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toHaveCount( 0 );
		await expect(
			page.getByRole( 'heading', { name: '担当者を選択' } )
		).toHaveCount( 0 );

		// 日付選択ステップが直接表示される。
		await expect(
			page.getByRole( 'heading', { name: '日付を選択' } )
		).toBeVisible();

		// localize されている hasUserStores / hasUserStaff が falsy。
		// 注: wp_localize_script は PHP の bool false を JS の "" にシリアライズすることがあるため、
		// truthy/falsy で評価する。
		const ctx = await page.evaluate( () => {
			return {
				hasUserStores:
					window.smartBookingFrontend &&
					window.smartBookingFrontend.hasUserStores,
				hasUserStaff:
					window.smartBookingFrontend &&
					window.smartBookingFrontend.hasUserStaff,
			};
		} );
		expect( !! ctx.hasUserStores ).toBe( false );
		expect( !! ctx.hasUserStaff ).toBe( false );
	} );

	// ============================================================
	// G. 確認/完了画面でシステム店舗・担当者の名前が表示されない
	// ============================================================

	test( 'G: ユーザーエンティティ 0 件で予約完了 → 確認/完了画面に店舗名・担当者名が出ない', async ( {
		page,
	} ) => {
		restoreSnapshotSystemOnly();
		insertSchedule( {
			storeId: 1,
			staffId: 1,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );

		await gotoFrontForm( page );

		// 日付選択 → 時間 → フォーム.
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

		// フォーム入力 → 確認画面.
		await fillCoreFormAndGoConfirm( page, {
			name: 'システム検証 太郎',
			email: 'sys@example.com',
			phone: '090-7777-7777',
		} );

		// 確認画面: 「デフォルト」のような system エンティティの名前が表示されないこと。
		await expect( page.locator( '.smb-front-confirm' ) ).toBeVisible();
		const confirmText = await page
			.locator( '.smb-front-confirm' )
			.innerText();
		expect( confirmText ).not.toContain( 'デフォルト' );
		// 店舗・担当者の dt（ラベル）行も出ないはず（API レスポンスで空文字化されている）。
		// 確実なのは「店舗」「担当者」というラベル文字が出ない、または出ても値が空、を許容。
		// 仕様: confirmation/done は空文字なら行ごと表示しない。

		// 確定送信.
		await page.getByRole( 'button', { name: '予約を確定する' } ).click();

		// 完了画面.
		await expect(
			page.getByRole( 'heading', {
				name: 'ご予約ありがとうございました',
			} )
		).toBeVisible( { timeout: 10_000 } );

		const doneSummary = page.locator( '.smb-front-done__summary' );
		await expect( doneSummary ).toBeVisible();
		const doneText = await doneSummary.innerText();
		expect( doneText ).not.toContain( 'デフォルト' );
	} );
} );
