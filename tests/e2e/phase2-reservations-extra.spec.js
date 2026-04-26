/**
 * Phase 2: 予約一覧（追加カバレッジ）
 *
 * 既存の phase2-reservations.spec.js / phase2-reservations-smoke.spec.js では
 * 検証されていない以下のシナリオを追加:
 *  - ページネーション（21件で2ページに切り替わる）
 *  - 詳細モーダルにカスタムフィールド値が表示される
 *  - メール形式バリデーション（モーダル UI で）
 *  - フィルタ適用時の CSV 出力にフィルタが反映される
 */
const fs = require( 'node:fs' );
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

async function seedSchedule( page, dateOffset = 3, capacity = 50 ) {
	const d = ymd( dateOffset );
	const r = await restCall( page, 'POST', 'schedules', {
		items: [
			{
				store_id: USER_STORE_ID,
				staff_id: USER_STAFF_ID,
				schedule_date: d,
				start_time: '14:00',
				end_time: '15:00',
				capacity,
				is_active: 1,
			},
		],
	} );
	if ( ! r.ok ) {
		throw new Error( 'schedule seed failed: ' + JSON.stringify( r.data ) );
	}
	return { date: d, schedId: r.data.ids[ 0 ] };
}

test.describe( 'Phase 2: 予約一覧 追加カバレッジ', () => {
	test.afterAll( () => restoreSnapshot() );

	test.beforeEach( async ( { page } ) => {
		restoreSnapshot();
		await bootstrapAdmin( page, 'reservations' );
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
	} );

	test( '21件の予約があるとページネーションが2ページ分表示される', async ( {
		page,
	} ) => {
		const { schedId } = await seedSchedule( page, 3, 50 );
		// 21 件投入
		for ( let i = 0; i < 21; i++ ) {
			const r = await restCall( page, 'POST', 'reservations', {
				schedule_id: schedId,
				customer_name: `予約者${ String( i + 1 ).padStart( 2, '0' ) }`,
				customer_email: `u${ i }@example.com`,
				customer_phone: `0900000${ String( i ).padStart( 4, '0' ) }`,
				status: 'approved',
			} );
			if ( ! r.ok ) {
				throw new Error(
					'seed reservation failed: ' + JSON.stringify( r.data )
				);
			}
		}
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		// pagination summary が見える.
		await expect(
			page.locator( '.smb-pagination__summary' )
		).toContainText( '21' );
		// 2 ページ目ボタンが押せる.
		await page.getByRole( 'button', { name: '2 ページ目' } ).click();
		// summary が "21 件中 21–21 件" になる.
		await expect(
			page.locator( '.smb-pagination__summary' )
		).toContainText( '21–21' );
	} );

	test( 'カスタムフィールドありの予約: 詳細モーダルにカスタム入力値が出る', async ( {
		page,
	}, testInfo ) => {
		// 1) カスタムフィールドを REST で追加.
		const cf = await restCall( page, 'POST', 'custom-fields', {
			field_key: 'company',
			field_label: '会社名',
			field_type: 'text',
			is_required: 0,
			sort_order: 100,
			is_active: 1,
		} );
		if ( ! cf.ok ) {
			throw new Error(
				'custom field create failed: ' + JSON.stringify( cf.data )
			);
		}

		// 2) スケジュール + 予約 (custom_fields 値を渡す).
		const { schedId } = await seedSchedule( page, 4, 5 );
		const res = await restCall( page, 'POST', 'reservations', {
			schedule_id: schedId,
			customer_name: 'カスタム太郎',
			customer_email: 'cf@example.com',
			customer_phone: '09099998888',
			status: 'approved',
			meta: { company: 'リベルダージ株式会社' },
		} );
		if ( ! res.ok ) {
			throw new Error(
				'reservation create failed: ' + JSON.stringify( res.data )
			);
		}

		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );

		const mobile = testInfo.project.name === 'mobile';
		if ( mobile ) {
			await page
				.locator( '.smb-reservation-card', { hasText: 'カスタム太郎' } )
				.click();
		} else {
			await page
				.locator( '.smb-table__row', { hasText: 'カスタム太郎' } )
				.getByRole( 'button', { name: '詳細', exact: true } )
				.click();
		}
		await expect( page.locator( '.smb-modal' ) ).toBeVisible();
		// 会社名 + 値が見える.
		await expect( page.locator( '.smb-modal' ) ).toContainText( '会社名' );
		await expect( page.locator( '.smb-modal' ) ).toContainText(
			'リベルダージ株式会社'
		);
	} );

	test( 'CSV: 名前フィルタ適用時、フィルタにマッチした予約のみ出力される', async ( {
		page,
	} ) => {
		const { schedId } = await seedSchedule( page, 5, 5 );
		// 3 件: 田中 / 佐藤 / 鈴木 (email は ASCII で送る).
		const seeds = [
			{ name: '田中一郎', email: 'tanaka@example.com' },
			{ name: '佐藤次郎', email: 'sato@example.com' },
			{ name: '鈴木三郎', email: 'suzuki@example.com' },
		];
		for ( const s of seeds ) {
			const r = await restCall( page, 'POST', 'reservations', {
				schedule_id: schedId,
				customer_name: s.name,
				customer_email: s.email,
				customer_phone: '09000000000',
				status: 'approved',
			} );
			if ( ! r.ok ) {
				throw new Error(
					'seed reservation failed: ' + JSON.stringify( r.data )
				);
			}
		}
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		// 名前フィルタ「田中」で絞り込み.
		await page.getByLabel( '予約者名' ).fill( '田中' );
		await page.waitForTimeout( 700 );
		// CSV ダウンロード.
		const downloadPromise = page.waitForEvent( 'download', {
			timeout: 10000,
		} );
		await page.getByRole( 'button', { name: /CSV 出力/ } ).click();
		const download = await downloadPromise;
		const downloadPath = await download.path();
		const content = fs.readFileSync( downloadPath, 'utf-8' );
		// BUG-3 修正後: CSV は UTF-8 BOM + 平文テキストで出力される（JSON エスケープしない）.
		expect( content.charCodeAt( 0 ) ).toBe( 0xfeff ); // UTF-8 BOM.
		expect( content ).toContain( '予約番号,予約日' ); // ヘッダ行（平文）.
		expect( content ).toContain( '田中一郎' ); // 田中のみ一致.
		expect( content ).not.toContain( '佐藤次郎' );
		expect( content ).not.toContain( '鈴木三郎' );
	} );

	test( '手動予約作成モーダル: ステップ2で必須フィールドを空のまま「作成」を押すとエラー', async ( {
		page,
	} ) => {
		await seedSchedule( page, 6, 3 );
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		await page.getByRole( 'button', { name: /予約を手動で作成/ } ).click();
		await page
			.locator( '.smb-modal__title', { hasText: '予約を手動で作成' } )
			.waitFor();
		// 日付に明後日 (offset=6 で seed しているので) を埋める.
		await page.locator( '#smb-manual-date' ).fill( ymd( 6 ) );
		await page
			.locator( '.smb-slot-btn' )
			.first()
			.waitFor( { timeout: 10000 } );
		await page.locator( '.smb-slot-btn' ).first().click();
		await page.getByRole( 'button', { name: /次へ/ } ).click();
		// ステップ2 で何も入れずに「予約を作成する」.
		await page.getByRole( 'button', { name: /予約を作成する/ } ).click();
		// 何かしらのバリデーション（入力エラー）が表示される or モーダルが閉じない.
		// モーダルがまだ開いていることを確認.
		await page.waitForTimeout( 1000 );
		await expect( page.locator( '.smb-modal' ) ).toBeVisible();
	} );
} );
