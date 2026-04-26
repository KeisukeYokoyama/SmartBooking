/**
 * Phase 8: UI/UX 修正のリグレッション・新規テスト。
 *
 * 検証項目:
 *  Gen-A: 表示修正
 *   1. 空状態が中央揃え + アイコン無し（h3.smb-empty__title が見える / .smb-empty__icon は無い）
 *   2. 担当者カードで写真と名前が重ならない（media の右端 <= title の左端）
 *      + 店舗名が subtitle として表示
 *  Gen-B: モーダル保護 + 危険操作ガード
 *   3. isDirty=false で ESC → window.confirm 出ない
 *   4. isDirty=true で ESC → window.confirm 出る、dismiss でモーダル残る、accept で閉じる
 *   5. スケジュールが紐づく店舗の削除 → 409 + メッセージに「スケジュール」
 *   6. 担当者にスケジュールあり/予約なしで削除 → CASCADE 削除成功
 */
const { test, expect } = require( '@playwright/test' );
const path = require( 'node:path' );
const { execSync } = require( 'node:child_process' );
const {
	bootstrapAdmin,
	restCall,
	restoreSnapshot,
	restoreSnapshotSystemOnly,
	insertStoreDirectly,
	insertStaffDirectly,
	countTable,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase2-helpers' );

function dbQuery( sql ) {
	return execSync(
		`npx wp-env run cli wp db query "${ sql.replace( /"/g, '\\"' ) }" --skip-column-names`,
		{
			cwd: path.resolve( __dirname, '..', '..' ),
			encoding: 'utf8',
			stdio: [ 'ignore', 'pipe', 'pipe' ],
			timeout: 30000,
		}
	);
}

test.describe.configure( { mode: 'default' } );

test.describe( 'Phase 8: UI/UX 修正検証', () => {
	test.afterAll( () => {
		restoreSnapshot();
	} );

	test.describe( 'Gen-A: 表示修正', () => {
		test( '空状態: 店舗ゼロ件で中央揃え、アイコン要素なし', async ( { page } ) => {
			// system-only 状態（is_system=1 のデフォルト店舗のみ、UI には表示されない）
			restoreSnapshotSystemOnly();
			await bootstrapAdmin( page, 'stores' );
			await page.waitForSelector( '.smb-page--stores', { timeout: 15000 } );

			// 空状態の見出しが存在する
			const empty = page.locator( '.smb-empty' ).first();
			await expect( empty ).toBeVisible();
			await expect(
				empty.locator( 'h3.smb-empty__title' )
			).toContainText( '店舗がまだ登録されていません' );

			// アイコン要素が無い
			await expect(
				empty.locator( '.smb-empty__icon' )
			).toHaveCount( 0 );

			// text-align: center（コンポーネント / コンテナ）
			const textAlign = await empty.evaluate(
				( el ) => window.getComputedStyle( el ).textAlign
			);
			expect( [ 'center', '-webkit-center' ] ).toContain( textAlign );
		} );

		test( '担当者カード: 写真と名前が重ならない + 店舗名が subtitle', async ( {
			page,
		} ) => {
			restoreSnapshot(); // 店舗1 + 担当者1 の標準セット
			await bootstrapAdmin( page, 'stores' );
			await page.waitForSelector( '.smb-page--stores', { timeout: 15000 } );

			// 担当者タブへ
			await page.locator( '.smb-tab', { hasText: '担当者' } ).click();
			await page.waitForSelector( 'article.smb-card', { timeout: 10000 } );

			const card = page.locator( 'article.smb-card' ).first();
			const media = card.locator( '.smb-card__media' );
			const title = card.locator( '.smb-card__title' );
			const subtitle = card.locator( '.smb-card__subtitle' );

			await expect( media ).toBeVisible();
			await expect( title ).toBeVisible();
			// 店舗名が subtitle として表示
			await expect( subtitle ).toBeVisible();
			await expect( subtitle ).toContainText( '店舗1' );

			// media と title の bounding box が水平方向に重ならない
			const mediaBox = await media.boundingBox();
			const titleBox = await title.boundingBox();
			expect( mediaBox ).not.toBeNull();
			expect( titleBox ).not.toBeNull();
			// media の右端 <= title の左端
			expect( mediaBox.x + mediaBox.width ).toBeLessThanOrEqual(
				titleBox.x + 1
			);
		} );
	} );

	test.describe( 'Gen-B: モーダル isDirty ガード', () => {
		test.beforeEach( async ( { page } ) => {
			restoreSnapshot();
			await bootstrapAdmin( page, 'stores' );
			await page.waitForSelector( '.smb-page--stores', { timeout: 15000 } );
		} );

		test( 'isDirty=false で ESC → 確認ダイアログ無しで閉じる', async ( {
			page,
		} ) => {
			let dialogShown = false;
			page.on( 'dialog', async ( dialog ) => {
				dialogShown = true;
				await dialog.dismiss();
			} );

			await page
				.getByRole( 'button', { name: /店舗を追加/ } )
				.first()
				.click();
			const modal = page.locator( '.smb-modal' );
			await expect( modal ).toBeVisible();

			// 何も入力せずに ESC
			await page.keyboard.press( 'Escape' );
			// モーダルは消えているはず（確認ダイアログは出ない）
			await expect( modal ).toBeHidden( { timeout: 5000 } );
			expect( dialogShown ).toBe( false );
		} );

		test( 'isDirty=true で ESC → 確認ダイアログが出る (dismiss でモーダル残る)', async ( {
			page,
		} ) => {
			// dialog handler を一括登録（Playwright は1度に1つしか reject/accept できないので明示的に handler を持つ）
			let dialogCount = 0;
			let dialogMessages = [];
			let nextAction = 'dismiss';
			page.on( 'dialog', async ( dialog ) => {
				dialogCount += 1;
				dialogMessages.push( dialog.message() );
				if ( nextAction === 'accept' ) {
					await dialog.accept();
				} else {
					await dialog.dismiss();
				}
			} );

			await page
				.getByRole( 'button', { name: /店舗を追加/ } )
				.first()
				.click();
			const modal = page.locator( '.smb-modal' );
			await expect( modal ).toBeVisible();

			// 店舗名を入力 → isDirty=true
			await page
				.getByLabel( /店舗名/, { exact: false } )
				.first()
				.fill( 'E2E_DIRTY_TEST' );

			// 1回目: dismiss → モーダル残る
			nextAction = 'dismiss';
			await page.locator( '.smb-modal' ).press( 'Escape' );
			// dialog が発火するまで一瞬待つ
			await page.waitForTimeout( 500 );
			expect( dialogCount ).toBeGreaterThanOrEqual( 1 );
			expect( dialogMessages[ 0 ] ).toContain( '入力内容が破棄されますが' );
			await expect( modal ).toBeVisible();

			// 2回目: accept → モーダル閉じる
			nextAction = 'accept';
			await page.locator( '.smb-modal' ).press( 'Escape' );
			await expect( modal ).toBeHidden( { timeout: 5000 } );
			expect( dialogCount ).toBeGreaterThanOrEqual( 2 );
		} );

		test( 'isDirty=true で背景クリック → 確認ダイアログが出る', async ( {
			page,
		} ) => {
			let dialogShown = false;
			let dialogMessage = '';
			page.on( 'dialog', async ( dialog ) => {
				dialogShown = true;
				dialogMessage = dialog.message();
				await dialog.dismiss();
			} );

			await page
				.getByRole( 'button', { name: /店舗を追加/ } )
				.first()
				.click();
			const modal = page.locator( '.smb-modal' );
			await expect( modal ).toBeVisible();

			await page
				.getByLabel( /店舗名/, { exact: false } )
				.first()
				.fill( 'E2E_DIRTY_BACKDROP' );

			// backdrop は onMouseDown でハンドリングされるため mousedown を直接発火する
			await page.evaluate( () => {
				const el = document.querySelector( '.smb-modal-backdrop' );
				if ( ! el ) return;
				const ev = new MouseEvent( 'mousedown', {
					bubbles: true,
					cancelable: true,
				} );
				// target が backdrop 自身であることを保証するため backdrop に dispatch
				el.dispatchEvent( ev );
			} );
			await page.waitForTimeout( 500 );
			expect( dialogShown ).toBe( true );
			expect( dialogMessage ).toContain( '入力内容が破棄されますが' );
			await expect( modal ).toBeVisible();
		} );
	} );

	test.describe( 'Gen-B: 危険操作ガード（削除）', () => {
		test.beforeEach( async ( { page } ) => {
			restoreSnapshot();
			await bootstrapAdmin( page, 'stores' );
		} );

		test( 'スケジュールが紐づく店舗の削除 → 409 + メッセージに「スケジュール」', async ( {
			page,
		} ) => {
			// store_id=USER_STORE_ID, staff_id=USER_STAFF_ID にスケジュールを INSERT
			const date = ymd( 7 );
			dbQuery(
				`INSERT INTO wp_smb_schedules (store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count, is_active, created_at, updated_at) VALUES (${ USER_STORE_ID }, ${ USER_STAFF_ID }, '${ date }', '10:00:00', '11:00:00', 5, 0, 1, NOW(), NOW())`
			);

			const res = await restCall(
				page,
				'DELETE',
				`stores/${ USER_STORE_ID }`
			);
			expect( res.status ).toBe( 409 );
			const msg =
				( res.data && res.data.message ) ||
				( res.data && res.data.code ) ||
				'';
			expect( msg ).toContain( 'スケジュール' );

			// DB 上 まだ店舗が残っている
			const out = dbQuery(
				`SELECT COUNT(*) FROM wp_smb_stores WHERE id=${ USER_STORE_ID }`
			);
			expect( /1/.test( out ) ).toBe( true );
		} );

		test( '担当者にスケジュールあり/予約なしで削除 → CASCADE 削除成功', async ( {
			page,
		} ) => {
			// 別 staff を作って、そこにスケジュールを紐付ける（USER_STAFF_ID は標準）
			const newStaffId = insertStaffDirectly( {
				store_id: USER_STORE_ID,
				name: 'CASCADE_TEST_STAFF',
			} );

			const date = ymd( 8 );
			dbQuery(
				`INSERT INTO wp_smb_schedules (store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count, is_active, created_at, updated_at) VALUES (${ USER_STORE_ID }, ${ newStaffId }, '${ date }', '14:00:00', '15:00:00', 3, 0, 1, NOW(), NOW())`
			);

			// この時点でこの staff のスケジュールは 1 件
			const beforeOut = dbQuery(
				`SELECT COUNT(*) FROM wp_smb_schedules WHERE staff_id=${ newStaffId }`
			);
			expect( /1/.test( beforeOut ) ).toBe( true );

			// 担当者削除 → 200 OK + スケジュールも CASCADE 削除
			const res = await restCall(
				page,
				'DELETE',
				`staff/${ newStaffId }`
			);
			expect( res.status ).toBe( 200 );

			// 担当者が削除されている
			const staffOut = dbQuery(
				`SELECT COUNT(*) FROM wp_smb_staff WHERE id=${ newStaffId }`
			);
			expect( /0/.test( staffOut ) ).toBe( true );

			// スケジュールも削除されている
			const schedOut = dbQuery(
				`SELECT COUNT(*) FROM wp_smb_schedules WHERE staff_id=${ newStaffId }`
			);
			expect( /0/.test( schedOut ) ).toBe( true );
		} );

		test( '予約が紐づく担当者の削除 → 409', async ( { page } ) => {
			// 担当者 + スケジュール + 予約 を作る
			const newStaffId = insertStaffDirectly( {
				store_id: USER_STORE_ID,
				name: 'STAFF_WITH_RES',
			} );

			const date = ymd( 9 );
			dbQuery(
				`INSERT INTO wp_smb_schedules (store_id, staff_id, schedule_date, start_time, end_time, capacity, booked_count, is_active, created_at, updated_at) VALUES (${ USER_STORE_ID }, ${ newStaffId }, '${ date }', '10:00:00', '11:00:00', 5, 1, 1, NOW(), NOW())`
			);
			const schedIdOut = dbQuery(
				`SELECT MAX(id) FROM wp_smb_schedules WHERE staff_id=${ newStaffId }`
			);
			const schedId = parseInt(
				( /(\d+)/.exec( schedIdOut ) || [ , 0 ] )[ 1 ],
				10
			);
			dbQuery(
				`INSERT INTO wp_smb_reservations (schedule_id, store_id, staff_id, schedule_date, schedule_time, customer_name, customer_email, customer_phone, status, created_at, updated_at) VALUES (${ schedId }, ${ USER_STORE_ID }, ${ newStaffId }, '${ date }', '10:00:00', 'TestUser', 'test@example.com', '03-0000-0000', 'pending', NOW(), NOW())`
			);

			const res = await restCall(
				page,
				'DELETE',
				`staff/${ newStaffId }`
			);
			expect( res.status ).toBe( 409 );
			const msg =
				( res.data && res.data.message ) ||
				( res.data && res.data.code ) ||
				'';
			expect( msg ).toContain( '予約' );
		} );
	} );
} );
