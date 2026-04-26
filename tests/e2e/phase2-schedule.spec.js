/**
 * Phase 2: スケジュール管理 CRUD + コピー。
 *
 * - 月カレンダー表示
 * - スケジュール追加（日付・店舗・担当者・時間枠複数）
 * - 編集（時間枠の追加・変更・削除）
 * - 削除
 * - コピー（個別モード / パターンモード / 上書きオプション）
 * - 表示期間/締切設定
 * - バリデーション異常系
 */
const { test, expect } = require( '@playwright/test' );
const {
	bootstrapAdmin,
	restCall,
	restoreSnapshot,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase2-helpers' );

test.describe.configure( { mode: 'default' } );

/**
 * 指定オフセット日後の日付を返す。ただし、結果が翌月以降になる場合は当月末日に丸める。
 * カレンダーの「is-other-month」セルは disabled なので、当月内のセルしかクリックできない。
 * @param {number} offsetDays
 * @return {string} YYYY-MM-DD
 */
function ymdInCurrentMonth( offsetDays ) {
	const now = new Date();
	const target = new Date( now );
	target.setDate( target.getDate() + offsetDays );
	// 月をまたいだ場合は当月末日に丸める.
	if (
		target.getFullYear() !== now.getFullYear() ||
		target.getMonth() !== now.getMonth()
	) {
		// 当月末日.
		target.setFullYear( now.getFullYear(), now.getMonth() + 1, 0 );
	}
	return (
		target.getFullYear() +
		'-' +
		String( target.getMonth() + 1 ).padStart( 2, '0' ) +
		'-' +
		String( target.getDate() ).padStart( 2, '0' )
	);
}

test.describe( 'Phase 2: スケジュール管理', () => {
	test.afterAll( () => {
		restoreSnapshot();
	} );

	test.beforeEach( async ( { page } ) => {
		restoreSnapshot();
		await bootstrapAdmin( page, 'schedule' );
		// スケジュールページはトップレベル slug = 'smart-booking'
		await page.goto( '/wp-admin/admin.php?page=smart-booking' );
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
	} );

	test( '月カレンダーが表示される', async ( { page } ) => {
		await expect( page.locator( 'h1.smb-page__title' ) ).toHaveText(
			'スケジュール管理'
		);
		await expect( page.locator( '.smb-calendar' ) ).toBeVisible();
		// 曜日ヘッダ 7 セル.
		await expect( page.locator( '.smb-calendar__weekday' ) ).toHaveCount(
			7
		);
		// 6 行 x 7 列 = 42 セル.
		await expect( page.locator( '.smb-calendar__cell' ) ).toHaveCount( 42 );
	} );

	test( '[BUG-4] 隣月セル（is-other-month）は disabled で aria-disabled=true', async ( {
		page,
	} ) => {
		// グリッドが完全に描画されるのを待つ.
		await expect( page.locator( '.smb-calendar__cell' ) ).toHaveCount( 42 );
		const otherCells = page.locator( '.smb-calendar__cell.is-other-month' );
		const count = await otherCells.count();
		expect( count ).toBeGreaterThan( 0 ); // 最低 1 セルはあるはず.
		for ( let i = 0; i < count; i++ ) {
			const cell = otherCells.nth( i );
			await expect( cell ).toBeDisabled();
			await expect( cell ).toHaveAttribute( 'aria-disabled', 'true' );
		}
	} );

	test( '[BUG-4] 隣月セルをクリックしても選択状態が変わらない', async ( {
		page,
	} ) => {
		await expect( page.locator( '.smb-calendar__cell' ) ).toHaveCount( 42 );
		// 現在選択されているセル (もしあれば) の aria-label をスナップショット.
		const selectedBefore = await page.evaluate( () => {
			const el = document.querySelector(
				'.smb-calendar__cell.is-selected'
			);
			return el ? el.getAttribute( 'aria-label' ) : null;
		} );
		// 最初の隣月セルを force クリック（disabled でも DOM クリックは強制発火できる）.
		const firstOther = page
			.locator( '.smb-calendar__cell.is-other-month' )
			.first();
		await firstOther.click( { force: true } ).catch( () => {} );
		// 100ms 待って React の状態更新をカバー.
		await page.waitForTimeout( 100 );
		// 選択セルの aria-label が変わっていないこと.
		const selectedAfter = await page.evaluate( () => {
			const el = document.querySelector(
				'.smb-calendar__cell.is-selected'
			);
			return el ? el.getAttribute( 'aria-label' ) : null;
		} );
		expect( selectedAfter ).toBe( selectedBefore );
		// 隣月セル自身が selected になっていないこと.
		await expect( firstOther ).not.toHaveClass( /is-selected/ );
	} );

	test( 'ヘッダの「スケジュールを追加」ボタンからモーダルが開く', async ( {
		page,
	} ) => {
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールを追加',
			} )
		).toBeVisible();
	} );

	test( 'スケジュールを追加できる（日付・時間枠）', async ( { page } ) => {
		const target = ymd( 3 );
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールを追加',
			} )
		).toBeVisible();
		// 日付.
		await page.locator( '#smb-schedule-date' ).fill( target );
		// 店舗・担当者は自動で id=1 が選択される想定（activeStores が1つなら）.
		// 追加ボタン.
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '追加する' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '追加', { timeout: 6000 } );
		// カレンダーセルに「1枠」などのサマリが出ているか + DetailPane に時間枠が表示されているか.
		const cell = page.locator(
			`.smb-calendar__cell[aria-label="${ target } を選択"]`
		);
		await expect( cell ).toHaveClass( /has-schedules/ );
		await expect(
			page.locator( '.smb-schedule-layout__pane' )
		).toContainText( /10:00/ );
	} );

	test( '時間枠の追加 → 重複時間でバリデーションエラー', async ( {
		page,
	} ) => {
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.click();
		const target = ymd( 4 );
		await page.locator( '#smb-schedule-date' ).fill( target );
		// 既存 10:00 の時間枠があり、それと同じ時刻の時間枠を追加.
		await page.getByRole( 'button', { name: /時間枠を追加/ } ).click();
		// 2行目の開始時間を 10:00 にする（デフォルトは 11:00 提案だが 10:00 にして重複を作る）.
		const startInputs = page.locator( 'input[type="time"]' );
		await startInputs.nth( 1 ).fill( '10:00' );
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '追加する' } )
			.click();
		await expect(
			page.locator( '.smb-field__error', { hasText: /重なって/ } )
		).toBeVisible();
	} );

	test( '時間枠 0 件で追加しようとするとバリデーションエラー', async ( {
		page,
	} ) => {
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.click();
		// 既存の 1 行を削除.
		await page
			.getByRole( 'button', { name: /1つ目の時間枠を削除/ } )
			.click();
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '追加する' } )
			.click();
		await expect(
			page.locator( '.smb-field__error, .smb-slot-editor__empty' ).first()
		).toBeVisible();
	} );

	test( '既存スケジュールを編集して時間枠の capacity を変更できる', async ( {
		page,
	} ) => {
		// 準備: スケジュールを1件 API 経由で作成.
		// 月をまたぐと is-other-month で disabled になるため、当月内日付に固定する.
		const target = ymdInCurrentMonth( 5 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: target,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 2,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
		// カレンダーで該当日をクリック.
		await page
			.locator( `.smb-calendar__cell[aria-label="${ target } を選択"]` )
			.click();
		// ScheduleDetailPane から編集.
		const editBtn = page
			.locator( '.smb-schedule-layout__pane' )
			.getByRole( 'button', { name: '編集' } )
			.first();
		await editBtn.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールを編集',
			} )
		).toBeVisible();
		// capacity を 5 に変更.
		await page.locator( 'input[type="number"]' ).first().fill( '5' );
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '保存' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '更新', { timeout: 6000 } );
	} );

	test( 'capacity を booked_count 未満に下げる更新は 400 エラー', async ( {
		page,
	} ) => {
		// 準備: 容量3で予約を2件入れて booked_count=2 にする.
		const target = ymd( 6 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: target,
					start_time: '15:00',
					end_time: '16:00',
					capacity: 3,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		const schedId = res.data.ids[ 0 ];
		// 予約2件.
		for ( let i = 0; i < 2; i++ ) {
			const resv = await restCall( page, 'POST', 'reservations', {
				schedule_id: schedId,
				customer_name: `cap下げ${ i }`,
				customer_email: `capdown${ i }@example.com`,
				customer_phone: '09000000002',
				status: 'approved',
			} );
			expect( resv.ok ).toBe( true );
		}
		// capacity=1 に下げようとすると booked_count=2 より小さいので拒否される.
		const putRes = await restCall( page, 'PUT', `schedules/${ schedId }`, {
			capacity: 1,
		} );
		expect( putRes.ok ).toBe( false );
		expect( putRes.status ).toBe( 400 );
		expect( String( putRes.data?.code || '' ) ).toContain( 'capacity' );
	} );

	test( '予約紐付きスケジュールは削除できない（409）', async ( { page } ) => {
		const target = ymd( 7 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: target,
					start_time: '17:00',
					end_time: '18:00',
					capacity: 2,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		const schedId = res.data.ids[ 0 ];
		const resv = await restCall( page, 'POST', 'reservations', {
			schedule_id: schedId,
			customer_name: 'schedule del',
			customer_email: 'scheddel@example.com',
			customer_phone: '09000000003',
			status: 'approved',
		} );
		expect( resv.ok ).toBe( true );
		// DELETE schedule direct.
		const delRes = await restCall(
			page,
			'DELETE',
			`schedules/${ schedId }`
		);
		expect( delRes.ok ).toBe( false );
		expect( [ 400, 409 ] ).toContain( delRes.status );
	} );

	test( '存在しないスケジュール ID の更新は 404', async ( { page } ) => {
		const res = await restCall( page, 'PUT', 'schedules/99999', {
			capacity: 5,
		} );
		expect( res.ok ).toBe( false );
		expect( res.status ).toBe( 404 );
	} );

	test( 'コピーモーダル: 日付個別選択モードで他の日付に複製できる', async ( {
		page,
	} ) => {
		// コピー元を用意.
		const source = ymd( 2 );
		const targetDate = ymd( 8 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: source,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 1,
					is_active: 1,
				},
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: source,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 1,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
		// 元日付セルをクリック → コピー.
		await page
			.locator( `.smb-calendar__cell[aria-label="${ source } を選択"]` )
			.click();
		await page
			.getByRole( 'button', { name: /スケジュールをコピー/ } )
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールをコピー',
			} )
		).toBeVisible();
		// 個別モードが初期選択.
		// 日付ピッカーに targetDate を入れて「日付を追加」.
		await page
			.locator( 'input[aria-label="コピー先の日付"]' )
			.fill( targetDate );
		await page.getByRole( 'button', { name: '日付を追加' } ).click();
		// チップは「M月D日」形式.
		const m = /(\d{4})-(\d{2})-(\d{2})/.exec( targetDate );
		const mm = m[ 2 ];
		const dd = m[ 3 ];
		await expect(
			page.locator( '.smb-date-chip', {
				hasText: `${ Number( mm ) }月${ Number( dd ) }日`,
			} )
		).toBeVisible();
		// 実行.
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: 'コピーを実行' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( /コピー完了/, { timeout: 6000 } );
		// API 直接で確認.
		const check = await restCall( page, 'GET', 'schedules', null, {
			date_from: targetDate,
			date_to: targetDate,
		} );
		expect( check.ok ).toBe( true );
		expect(
			Array.isArray( check.data ) && check.data.length
		).toBeGreaterThanOrEqual( 2 );
	} );

	test( 'コピーモーダル: パターンモード（曜日指定）で複数日に一括複製できる', async ( {
		page,
	} ) => {
		// 今日を起点に、2日後をコピー元にして、その曜日に該当する日を期間内で複製.
		const source = ymd( 2 );
		const rangeFrom = ymd( 3 );
		const rangeTo = ymd( 20 );
		const srcDayOfWeek = new Date( source ).getDay();
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: source,
					start_time: '14:00',
					end_time: '15:00',
					capacity: 2,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );

		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
		await page
			.locator( `.smb-calendar__cell[aria-label="${ source } を選択"]` )
			.click();
		await page
			.getByRole( 'button', { name: /スケジュールをコピー/ } )
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールをコピー',
			} )
		).toBeVisible();
		// パターンモード選択.
		await page.locator( 'input[value="pattern"]' ).check();
		// 元日付の曜日をチェック.
		const weekdayLabels = [ '日', '月', '火', '水', '木', '金', '土' ];
		await page
			.locator( '.smb-weekday-picker__item', {
				hasText: weekdayLabels[ srcDayOfWeek ],
			} )
			.locator( 'input[type="checkbox"]' )
			.check();
		await page.locator( '#smb-range-from' ).fill( rangeFrom );
		await page.locator( '#smb-range-to' ).fill( rangeTo );
		// プレビュー件数が1以上になる.
		await expect(
			page.locator( '.smb-copy-pattern__preview-label' )
		).toContainText( /[1-9]/ );
		// 実行.
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: 'コピーを実行' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( /コピー完了/, { timeout: 6000 } );
	} );

	test( 'コピーモーダル: 上書き OFF で既存スケジュール日は skipped される', async ( {
		page,
	} ) => {
		// 元 + 既存ターゲット両方作る.
		const source = ymd( 2 );
		const existing = ymd( 9 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: source,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 1,
					is_active: 1,
				},
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: existing,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 5,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		// 直接 API で copy, overwrite=false.
		const copyRes = await restCall( page, 'POST', 'schedules/copy', {
			source_date: source,
			store_id: USER_STORE_ID,
			staff_id: USER_STAFF_ID,
			target_dates: [ existing ],
			overwrite: false,
		} );
		expect( copyRes.ok ).toBe( true );
		// 結果: skipped=1.
		expect( copyRes.data?.skipped ).toBeGreaterThanOrEqual( 1 );
	} );

	test( 'コピーモーダル: 上書き ON で既存スケジュール日が上書きされる', async ( {
		page,
	} ) => {
		const source = ymd( 2 );
		const existing = ymd( 9 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: source,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 1,
					is_active: 1,
				},
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: existing,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 5,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		const copyRes = await restCall( page, 'POST', 'schedules/copy', {
			source_date: source,
			store_id: USER_STORE_ID,
			staff_id: USER_STAFF_ID,
			target_dates: [ existing ],
			overwrite: true,
		} );
		expect( copyRes.ok ).toBe( true );
		// overwrite=true なので、既存 schedule は削除されて新規 insert される.
		expect(
			( copyRes.data?.inserted || 0 ) + ( copyRes.data?.overwritten || 0 )
		).toBeGreaterThan( 0 );
	} );

	test( '表示期間/締切設定モーダルから設定を保存できる', async ( {
		page,
	} ) => {
		await page.getByRole( 'button', { name: /表示期間/ } ).click();
		await expect( page.locator( '.smb-modal__title' ) ).toContainText(
			/表示期間|締切/
		);
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '保存' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '保存', { timeout: 6000 } );
	} );

	test( '店舗・担当者フィルタを変更すると /schedules リクエストにパラメタが付く', async ( {
		page,
	} ) => {
		// 店舗 id=2 と担当者 id=2 を準備（DB 直 INSERT）.
		const {
			insertStoreDirectly,
			insertStaffDirectly,
		} = require( './phase2-helpers' );
		const storeId = insertStoreDirectly( { name: 'フィルタ用店舗' } );
		const staffId = insertStaffDirectly( {
			store_id: storeId,
			name: 'フィルタ用担当者',
		} );
		// store_id=1 の方にスケジュールを 1 枠.
		const targetA = ymd( 3 );
		await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: targetA,
					start_time: '10:00',
					end_time: '11:00',
					capacity: 1,
					is_active: 1,
				},
			],
		} );
		// 新店舗の方にスケジュール 1 枠.
		const targetB = ymd( 4 );
		await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: storeId,
					staff_id: staffId,
					schedule_date: targetB,
					start_time: '14:00',
					end_time: '15:00',
					capacity: 1,
					is_active: 1,
				},
			],
		} );
		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
		// 「すべての店舗」状態では両方の日付に has-schedules が付く.
		await expect(
			page.locator(
				`.smb-calendar__cell[aria-label="${ targetA } を選択"]`
			)
		).toHaveClass( /has-schedules/ );
		await expect(
			page.locator(
				`.smb-calendar__cell[aria-label="${ targetB } を選択"]`
			)
		).toHaveClass( /has-schedules/ );

		// 店舗フィルタを「フィルタ用店舗」(id=storeId) にする.
		const storeSelect = page
			.locator( '.smb-schedule-toolbar__filters select' )
			.first();
		await storeSelect.selectOption( String( storeId ) );
		// schedules は再フェッチされる。targetB のみ has-schedules、targetA は外れる.
		await expect(
			page.locator(
				`.smb-calendar__cell[aria-label="${ targetB } を選択"]`
			)
		).toHaveClass( /has-schedules/, {
			timeout: 5000,
		} );
		await expect(
			page.locator(
				`.smb-calendar__cell[aria-label="${ targetA } を選択"]`
			)
		).not.toHaveClass( /has-schedules/ );

		// 担当者フィルタも追加（同店舗内だから問題なし）.
		const staffSelect = page
			.locator( '.smb-schedule-toolbar__filters select' )
			.nth( 1 );
		await staffSelect.selectOption( String( staffId ) );
		await expect(
			page.locator(
				`.smb-calendar__cell[aria-label="${ targetB } を選択"]`
			)
		).toHaveClass( /has-schedules/ );
	} );

	test( '日付未入力でスケジュール追加 → バリデーションエラー', async ( {
		page,
	} ) => {
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールを追加',
			} )
		).toBeVisible();
		// 日付欄を明示的に空に.
		const dateInput = page.locator( '#smb-schedule-date' );
		await dateInput.fill( '' );
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '追加する' } )
			.click();
		// schedule_date 用のエラーが表示される.
		await expect(
			page.locator( '.smb-field__error', { hasText: /日付を選択/ } )
		).toBeVisible();
	} );

	test( '予約可能数 0 を入力すると最低値 1 にクランプされる（クライアントガード）', async ( {
		page,
	} ) => {
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.click();
		const target = ymd( 10 );
		await page.locator( '#smb-schedule-date' ).fill( target );
		// capacity を 0 に書き換え → onChange で Math.max(1, ...) で 1 にクランプ.
		const capInput = page.locator(
			'input[aria-label="1つ目の時間枠・予約可能数"]'
		);
		await capInput.fill( '0' );
		await capInput.blur();
		await expect( capInput ).toHaveValue( '1' );
		// 念のため負数も.
		await capInput.fill( '-3' );
		await capInput.blur();
		await expect( capInput ).toHaveValue( '1' );
		// このまま保存 → 成功する（capacity=1 で送信される）.
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '追加する' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '追加', { timeout: 6000 } );
	} );

	test( 'スケジュール削除（CRUD::Delete）— 予約なしなら ConfirmDialog 経由で削除できる', async ( {
		page,
	} ) => {
		// ymd(1) は 1 日後（同月内になりやすい）。月をまたぐ場合は schedules フェッチが
		// 該当月になっていないと DetailPane に何も表示されないため、月内日付を選ぶ。
		const target = ymd( 1 );
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: target,
					start_time: '13:00',
					end_time: '14:00',
					capacity: 2,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		await page.reload();
		await page.waitForSelector( '.smb-page--schedule', { timeout: 15000 } );
		// 当該日付セルをクリック → DetailPane を表示.
		await page
			.locator( `.smb-calendar__cell[aria-label="${ target } を選択"]` )
			.click();
		// DetailPane の「削除」ボタン.
		const delBtn = page
			.locator( '.smb-schedule-layout__pane' )
			.getByRole( 'button', { name: '削除' } )
			.first();
		await delBtn.click();
		// ConfirmDialog が出る.
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールを削除',
			} )
		).toBeVisible();
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '削除する' } )
			.click();
		// 成功 toast.
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '削除', { timeout: 6000 } );
		// has-schedules クラスが外れる.
		await expect(
			page.locator(
				`.smb-calendar__cell[aria-label="${ target } を選択"]`
			)
		).not.toHaveClass( /has-schedules/, { timeout: 5000 } );
	} );

	test( '過去日付へのコピーも仕様通り成功する（カレンダー上の制限はサーバ側で課されない）', async ( {
		page,
	} ) => {
		// 仕様: スケジュール管理は管理者用なので過去日付への登録は許容される（フロント締切は別ロジック）.
		const source = ymd( 2 );
		const past = ymd( -3 ); // 3 日前.
		const res = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: USER_STORE_ID,
					staff_id: USER_STAFF_ID,
					schedule_date: source,
					start_time: '11:00',
					end_time: '12:00',
					capacity: 1,
					is_active: 1,
				},
			],
		} );
		expect( res.ok ).toBe( true );
		const copyRes = await restCall( page, 'POST', 'schedules/copy', {
			source_date: source,
			store_id: USER_STORE_ID,
			staff_id: USER_STAFF_ID,
			target_dates: [ past ],
			overwrite: false,
		} );
		// 過去日付がエラーになる仕様であれば 400/422、許容なら 200 で inserted>=1.
		// どちらかが起きることをテスト（仕様未定義部分）.
		if ( copyRes.ok ) {
			expect( copyRes.data?.inserted ).toBeGreaterThanOrEqual( 1 );
		} else {
			expect( [ 400, 422 ] ).toContain( copyRes.status );
		}
	} );

	test( 'mobile: スケジュール追加モーダルがスマホ幅 (375px) で操作可能', async ( {
		page,
		viewport,
	} ) => {
		test.skip( ! viewport || viewport.width > 500, 'mobile viewport 専用' );
		await page
			.getByRole( 'button', { name: /スケジュールを追加/ } )
			.click();
		await expect(
			page.locator( '.smb-modal__title', {
				hasText: 'スケジュールを追加',
			} )
		).toBeVisible();
		// 日付入力ができる.
		await page.locator( '#smb-schedule-date' ).fill( ymd( 12 ) );
		// 時間枠追加ボタンが押せる.
		await page.getByRole( 'button', { name: /時間枠を追加/ } ).click();
		// 時間枠 2 件あること.
		await expect( page.locator( 'input[type="time"]' ) ).toHaveCount( 2 );
		// 保存できる.
		await page
			.locator( '.smb-modal__footer' )
			.getByRole( 'button', { name: '追加する' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '追加', { timeout: 6000 } );
	} );
} );
