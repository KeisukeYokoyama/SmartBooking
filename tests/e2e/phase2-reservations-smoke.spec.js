/**
 * Phase 2 (Gen-C): 予約一覧ページの基本スモークテスト。
 *
 * - ページが React エラーなしで描画される
 * - フィルタ要素が表示される
 * - ヘッダのアクションボタン（CSV / 手動作成）が表示される
 * - 初期ロード時は「まだ予約がありません」が表示される（wp-env は初期状態で予約なし）
 * - 手動予約作成モーダルが開く
 */
const { test, expect } = require( '@playwright/test' );
const { loginAsAdmin, wpCli } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

test.describe( 'Phase 2: 予約一覧 - スモーク', () => {
	test.beforeAll( async () => {
		// プラグインを必ず有効化.
		try {
			wpCli( 'plugin activate smart-booking' );
		} catch ( _e ) {
			// noop.
		}
	} );

	test.beforeEach( async () => {
		// 各テスト前にクリーン状態にする（スケジュール・予約・メタを削除）.
		try {
			wpCli(
				'db query "DELETE FROM wp_smabo_reservation_meta;" --skip-column-names'
			);
			wpCli(
				'db query "DELETE FROM wp_smabo_reservations;" --skip-column-names'
			);
			wpCli(
				'db query "DELETE FROM wp_smabo_schedules;" --skip-column-names'
			);
		} catch ( _e ) {
			// noop.
		}
	} );

	test( '1. 予約一覧ページが読み込める', async ( { page } ) => {
		await loginAsAdmin( page );
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations'
		);
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );
		await expect( page.locator( '.smb-page__title' ) ).toHaveText(
			'予約一覧'
		);
	} );

	test( '2. ヘッダに CSV 出力・手動予約作成ボタンが表示される', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations'
		);
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );

		await expect(
			page.getByRole( 'button', { name: /CSV 出力/ } )
		).toBeVisible();
		await expect(
			page.getByRole( 'button', { name: /予約を手動で作成/ } )
		).toBeVisible();
	} );

	test( '3. フィルタパネルが表示される', async ( { page } ) => {
		await loginAsAdmin( page );
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations'
		);
		await page.waitForSelector( '.smb-reservation-filters', {
			timeout: 15000,
		} );

		// 主要フィルタが存在する.
		await expect( page.getByLabel( '予約者名' ) ).toBeVisible();
		await expect( page.getByLabel( 'メールアドレス' ) ).toBeVisible();
		// 複数の Select label が "店舗" / "担当者" / "ステータス" を含む.
		await expect(
			page.locator( 'label', { hasText: '店舗' } ).first()
		).toBeVisible();
		await expect(
			page.locator( 'label', { hasText: '担当者' } ).first()
		).toBeVisible();
	} );

	test( '4. 予約がないときは空状態が表示される', async ( { page } ) => {
		await loginAsAdmin( page );
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations'
		);
		// API 応答待ち.
		await page.waitForSelector( '.smb-empty', { timeout: 15000 } );
		await expect( page.locator( '.smb-empty__title' ) ).toContainText(
			'予約がありません'
		);
	} );

	test( '5. 手動予約作成モーダルが開閉できる', async ( { page } ) => {
		await loginAsAdmin( page );
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations'
		);
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );

		await page.getByRole( 'button', { name: /予約を手動で作成/ } ).click();
		// モーダルのタイトル.
		await expect(
			page.locator( '.smb-modal__title', { hasText: '予約を手動で作成' } )
		).toBeVisible();
		// ステップ1 インジケーター.
		await expect(
			page.locator( '.smb-step-indicator__item.is-current' )
		).toContainText( '予約枠を選ぶ' );

		// 閉じる.
		await page.locator( '.smb-modal__close' ).click();
		await expect( page.locator( '.smb-modal' ) ).toHaveCount( 0 );
	} );

	test( '6. スケジュールがある状態で予約を手動作成できる（一覧に反映 + ステータス変更 + 削除）', async ( {
		page,
	} ) => {
		// 明日分のスケジュールを REST API 経由で作成（並列 wp-cli 競合回避）.
		const tomorrow = new Date();
		tomorrow.setDate( tomorrow.getDate() + 1 );
		const ymd = `${ tomorrow.getFullYear() }-${ String(
			tomorrow.getMonth() + 1
		).padStart( 2, '0' ) }-${ String( tomorrow.getDate() ).padStart(
			2,
			'0'
		) }`;

		await loginAsAdmin( page );

		// 管理画面を開き、nonce を取得してから REST で schedules を作成.
		await page.goto(
			'/wp-admin/admin.php?page=smart-booking-reservations'
		);
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );

		const scheduleCreated = await page.evaluate(
			async ( { ymd } ) => {
				const ctx = window.smartBookingAdmin || {};
				const res = await fetch( `${ ctx.restUrl }schedules`, {
					method: 'POST',
					credentials: 'same-origin',
					headers: {
						'Content-Type': 'application/json',
						'X-WP-Nonce': ctx.nonce,
					},
					body: JSON.stringify( {
						items: [
							{
								store_id: 2,
								staff_id: 2,
								schedule_date: ymd,
								start_time: '10:00',
								end_time: '11:00',
								capacity: 2,
								is_active: 1,
							},
						],
					} ),
				} );
				return {
					ok: res.ok,
					status: res.status,
					body: await res.text(),
				};
			},
			{ ymd }
		);
		if ( ! scheduleCreated.ok ) {
			throw new Error(
				`スケジュール作成 API が失敗: ${ scheduleCreated.status } ${ scheduleCreated.body }`
			);
		}

		// 一覧を再読み込み（フィルタ反映のため）.
		await page.reload();
		await page.waitForSelector( '.smb-page--reservations', {
			timeout: 15000,
		} );

		// モーダルを開く.
		await page.getByRole( 'button', { name: /予約を手動で作成/ } ).click();
		await page
			.locator( '.smb-modal__title', { hasText: '予約を手動で作成' } )
			.waitFor();

		// 日付を明日に設定.
		await page.locator( '#smb-manual-date' ).fill( ymd );

		// スロット（時間枠ボタン）が現れるまで待つ.
		await page
			.locator( '.smb-slot-btn' )
			.first()
			.waitFor( { timeout: 10000 } );
		await page.locator( '.smb-slot-btn' ).first().click();

		// 次へ.
		await page.getByRole( 'button', { name: /次へ/ } ).click();

		// ステップ2: 入力.
		await page
			.locator( 'input[type="text"]' )
			.first()
			.fill( 'テスト 太郎' );
		await page
			.locator( 'input[type="email"]' )
			.first()
			.fill( 'taro@example.com' );
		await page.locator( 'input[type="tel"]' ).first().fill( '09012345678' );

		// 作成.
		await page.getByRole( 'button', { name: /予約を作成する/ } ).click();

		// モーダルが閉じる + テーブル or カードに 1 件表示される.
		await page
			.locator( '.smb-modal' )
			.first()
			.waitFor( { state: 'detached', timeout: 10000 } );
		const rowLocator = page.locator(
			'.smb-table__row, .smb-reservation-card'
		);
		await rowLocator.first().waitFor( { timeout: 10000 } );

		// 予約者名が一覧に現れる.
		await expect( page.locator( 'body' ) ).toContainText( 'テスト 太郎' );

		// 最初の行の「キャンセル」ボタンを押してステータスが変わるか.
		const firstRow = rowLocator.first();
		const cancelBtn = firstRow.getByRole( 'button', {
			name: 'キャンセル',
		} );
		if ( await cancelBtn.isVisible().catch( () => false ) ) {
			await cancelBtn.click();
			await expect( firstRow ).toContainText( 'キャンセル', {
				timeout: 5000,
			} );
		}

		// 最終的に片付ける: 削除.
		await firstRow.getByRole( 'button', { name: '削除' } ).click();
		await page.getByRole( 'button', { name: '削除する' } ).click();
		// 削除成功のトーストが出るまで待つ（複数の Toast が積み重なっている可能性があるため last を見る）.
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '削除しました', { timeout: 10000 } );
	} );
} );
