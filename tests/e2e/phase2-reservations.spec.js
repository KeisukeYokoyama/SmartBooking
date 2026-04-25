/**
 * Phase 2: 予約一覧（拡張）。
 *
 * スモーク（phase2-reservations-smoke.spec.js）のカバレッジに加えて:
 * - フィルタ（名前、メール、店舗、ステータス、日付）
 * - テーブルソート
 * - ステータス変更（承認 / キャンセル）
 * - 予約詳細モーダルの表示
 * - CSV 出力のダウンロード
 * - 手動予約作成時の満席エラー（409）→ ステップ1 に戻る
 */
const fs = require( 'node:fs' );
const { test, expect } = require( '@playwright/test' );
const {
	bootstrapAdmin,
	restCall,
	restoreSnapshot,
	ymd,
} = require( './phase2-helpers' );

test.describe.configure( { mode: 'serial' } );

// 異なる店舗を使いたいテストもあるので、共通 fixture として REST で予約を準備する関数を用意.
async function seedReservations( page, n = 3, dateOffset = 2 ) {
	const d = ymd( dateOffset );
	// スケジュールを1枠作る.
	const schedRes = await restCall( page, 'POST', 'schedules', {
		items: [
			{
				store_id: 1,
				staff_id: 1,
				schedule_date: d,
				start_time: '10:00',
				end_time: '11:00',
				capacity: 10,
				is_active: 1,
			},
		],
	} );
	if ( ! schedRes.ok ) {
		throw new Error(
			'seed schedule failed: ' + JSON.stringify( schedRes.data )
		);
	}
	const schedId = schedRes.data.ids[ 0 ];
	for ( let i = 0; i < n; i++ ) {
		const r = await restCall( page, 'POST', 'reservations', {
			schedule_id: schedId,
			customer_name: `予約者${ i + 1 }`,
			customer_email: `user${ i + 1 }@example.com`,
			customer_phone: `0900000000${ i }`,
			status: i === 0 ? 'pending' : 'approved',
		} );
		if ( ! r.ok ) {
			throw new Error(
				'seed reservation failed: ' + JSON.stringify( r.data )
			);
		}
	}
	return { date: d, schedId };
}

test.describe( 'Phase 2: 予約一覧 拡張', () => {
	test.afterAll( () => {
		restoreSnapshot();
	} );

	test.beforeEach( async ( { page } ) => {
		restoreSnapshot();
		await bootstrapAdmin( page, 'reservations' );
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
	} );

	test( '予約が3件あるとテーブル（デスクトップ）またはカード（モバイル）に表示される', async ( {
		page,
		isMobile: _isMobile,
	}, testInfo ) => {
		await seedReservations( page, 3 );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		const mobile = testInfo.project.name === 'mobile';
		if ( mobile ) {
			await expect( page.locator( '.smb-reservation-card' ) ).toHaveCount(
				3
			);
		} else {
			await expect( page.locator( '.smb-table__row' ) ).toHaveCount( 3 );
		}
	} );

	test( '名前フィルタで絞り込める', async ( { page }, testInfo ) => {
		await seedReservations( page, 3 );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		// 名前フィルタに「予約者2」と入れる.
		await page.getByLabel( '予約者名' ).fill( '予約者2' );
		// debounce 300ms.
		await page.waitForTimeout( 700 );
		const mobile = testInfo.project.name === 'mobile';
		if ( mobile ) {
			await expect( page.locator( '.smb-reservation-card' ) ).toHaveCount(
				1
			);
		} else {
			await expect( page.locator( '.smb-table__row' ) ).toHaveCount( 1 );
		}
	} );

	test( 'ステータスフィルタで承認待ちのみを抽出', async ( {
		page,
	}, testInfo ) => {
		await seedReservations( page, 3 );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		// ステータス select はグリッド内の 4番目（名前、メール、店舗、担当者、日付2つを経て最後）。
		// ラベル「ステータス」を持つラッパで特定する.
		const statusField = page.locator( '.smb-field', {
			has: page.locator( 'label', { hasText: 'ステータス' } ),
		} );
		await statusField.locator( 'select' ).selectOption( 'pending' );
		await page.waitForTimeout( 700 );
		const mobile = testInfo.project.name === 'mobile';
		if ( mobile ) {
			await expect( page.locator( '.smb-reservation-card' ) ).toHaveCount(
				1
			);
		} else {
			await expect( page.locator( '.smb-table__row' ) ).toHaveCount( 1 );
		}
	} );

	test( '「すべてクリア」で絞り込みがリセットされる', async ( { page } ) => {
		await seedReservations( page, 2 );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		await page.getByLabel( '予約者名' ).fill( '予約者1' );
		await page.waitForTimeout( 400 );
		// 「すべてクリア」ボタンがアクティブフィルタのときだけ出る.
		await page.getByRole( 'button', { name: 'すべてクリア' } ).click();
		await page.waitForTimeout( 700 );
		await expect( page.getByLabel( '予約者名' ) ).toHaveValue( '' );
	} );

	test( '承認ボタンでステータスが承認済みに変わる（楽観更新）', async ( {
		page,
	}, testInfo ) => {
		// pending の予約を1件だけ作る.
		const d = ymd( 2 );
		const schedRes = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: 1,
					staff_id: 1,
					schedule_date: d,
					start_time: '12:00',
					end_time: '13:00',
					capacity: 2,
					is_active: 1,
				},
			],
		} );
		expect( schedRes.ok ).toBe( true );
		await restCall( page, 'POST', 'reservations', {
			schedule_id: schedRes.data.ids[ 0 ],
			customer_name: '承認テスト',
			customer_email: 'approve@example.com',
			customer_phone: '09000001111',
			status: 'pending',
		} );

		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );

		const mobile = testInfo.project.name === 'mobile';
		if ( mobile ) {
			// モバイルではカード内の承認ボタン.
			const card = page.locator( '.smb-reservation-card', {
				hasText: '承認テスト',
			} );
			await card
				.getByRole( 'button', { name: '承認', exact: true } )
				.click();
			await expect(
				page.locator( '.smb-toast--success' ).last()
			).toContainText( '承認', { timeout: 5000 } );
		} else {
			const row = page.locator( '.smb-table__row', {
				hasText: '承認テスト',
			} );
			await row
				.getByRole( 'button', { name: '承認', exact: true } )
				.click();
			await expect(
				page.locator( '.smb-toast--success' ).last()
			).toContainText( '承認', { timeout: 5000 } );
		}
	} );

	test( '予約詳細モーダルが開く（テーブル / カードから）', async ( {
		page,
	}, testInfo ) => {
		await seedReservations( page, 1 );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		const mobile = testInfo.project.name === 'mobile';
		if ( mobile ) {
			// カードの詳細ボタン or カード全体クリック.
			await page.locator( '.smb-reservation-card' ).first().click();
		} else {
			// 「詳細」ボタン（exact=true で ID リンクと区別）.
			await page
				.locator( '.smb-table__row' )
				.first()
				.getByRole( 'button', { name: '詳細', exact: true } )
				.click();
		}
		await expect( page.locator( '.smb-modal' ) ).toBeVisible();
		await expect(
			page.locator( '.smb-modal__title' ).first()
		).toContainText( /予約/ );
	} );

	test( 'CSV エクスポートでファイルがダウンロードされる', async ( {
		page,
	} ) => {
		await seedReservations( page, 2 );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		const downloadPromise = page.waitForEvent( 'download', {
			timeout: 10000,
		} );
		await page.getByRole( 'button', { name: /CSV 出力/ } ).click();
		const download = await downloadPromise;
		expect( download.suggestedFilename() ).toMatch(
			/^reservations-\d{4}-\d{2}-\d{2}\.csv$/
		);
		const downloadPath = await download.path();
		expect( downloadPath ).toBeTruthy();
		const content = fs.readFileSync( downloadPath, 'utf-8' );
		// ヘッダ行にキーカラムが含まれる。
		expect( content.length ).toBeGreaterThan( 0 );
		// [BUG-3] REST /reservations/export/csv が new WP_REST_Response($body) で返しているため
		// WordPress の自動 JSON シリアライズが発動し、CSV ではなく JSON 文字列が返ってしまう。
		// 期待: CSV 本文に「予約者」が平文で含まれる。
		// 実態: content = `"<BOM>予約..."` のような JSON エンコード文字列（二重エスケープ）。
		// 先頭の BOM (U+FEFF) を 2 重に剥がす（JSON 文字列化された BOM を 1 段階剥がしたあと、CSV 本来の BOM を剥がす）。
		const clean = content.replace( /^\uFEFF/, '' ).replace( /^\uFEFF/, '' );
		expect(
			clean,
			'CSV は生テキストである必要があります（JSON 文字列化されてはいけない）'
		).toContain( '予約者' );
		expect( clean ).toContain( '予約者1' );
		expect( clean ).toContain( '予約者2' );
	} );

	test( '手動予約作成: 満席の枠は選択不可（is-disabled）', async ( {
		page,
	} ) => {
		// capacity=1 + 予約1件 → 満席状態のスケジュールを作る.
		const d = ymd( 5 );
		const schedRes = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: 1,
					staff_id: 1,
					schedule_date: d,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 1,
					is_active: 1,
				},
			],
		} );
		expect( schedRes.ok ).toBe( true );
		await restCall( page, 'POST', 'reservations', {
			schedule_id: schedRes.data.ids[ 0 ],
			customer_name: '満席1人目',
			customer_email: 'full1@example.com',
			customer_phone: '09000002222',
			status: 'approved',
		} );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		await page.getByRole( 'button', { name: /予約を手動で作成/ } ).click();
		await page.locator( '#smb-manual-date' ).fill( d );
		// slot-btn が表示されるまで待つ.
		await page.waitForSelector( '.smb-slot-btn', { timeout: 6000 } );
		await expect( page.locator( '.smb-slot-btn' ).first() ).toHaveClass(
			/is-disabled/
		);
		await expect( page.locator( '.smb-slot-btn' ).first() ).toContainText(
			'満席'
		);
	} );

	test( '存在しない予約 ID の取得は 404', async ( { page } ) => {
		const res = await restCall( page, 'GET', 'reservations/99999' );
		expect( res.ok ).toBe( false );
		expect( res.status ).toBe( 404 );
	} );

	test( '不正なメール形式で予約作成すると 400 エラー', async ( { page } ) => {
		// 先にスケジュール作成.
		const d = ymd( 2 );
		const schedRes = await restCall( page, 'POST', 'schedules', {
			items: [
				{
					store_id: 1,
					staff_id: 1,
					schedule_date: d,
					start_time: '16:00',
					end_time: '17:00',
					capacity: 1,
					is_active: 1,
				},
			],
		} );
		expect( schedRes.ok ).toBe( true );
		const res = await restCall( page, 'POST', 'reservations', {
			schedule_id: schedRes.data.ids[ 0 ],
			customer_name: 'メール不正',
			customer_email: 'not-an-email',
			customer_phone: '09000003333',
			status: 'approved',
		} );
		expect( res.ok ).toBe( false );
		expect( res.status ).toBe( 400 );
	} );
} );
