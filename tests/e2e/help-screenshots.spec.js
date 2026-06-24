/**
 * docs/help/ 用スクリーンショットを一括撮影するスペック。
 *
 * - 撮影対象: 12 セクション (installation, stores, staff, schedule,
 *   schedule-copy, booking-form, reservations, custom-fields,
 *   design, email, google-calendar, chatwork)
 * - 出力: docs/help/images/{section}/NN-name.png
 * - 撮影解像度: 1280x720 (desktop)
 *
 * 前提:
 *   - wp-env が起動し、テストデータ (店舗 渋谷店/新宿店, 担当者 田中/鈴木,
 *     スケジュール 7日 × 4枠 × 2セット, 予約 3件, ご相談内容フィールド)
 *     が seed 済みであること。
 *   - smart_booking_show_store_front=1, smart_booking_show_staff_front=1
 *   - フロント予約ページは page_id=7
 */
const { test, expect } = require( '@playwright/test' );
const path = require( 'node:path' );
const { loginAsAdmin } = require( './helpers' );

const IMAGES_ROOT = path.resolve( __dirname, '..', '..', 'docs', 'help', 'images' );

function shotPath( section, name ) {
	return path.join( IMAGES_ROOT, section, name );
}

async function shoot( page, section, name ) {
	await page.screenshot( {
		path: shotPath( section, name ),
		fullPage: false,
		quality: 80,
		type: 'jpeg',
	} ).catch( async () => {
		// PNG fallback (quality is jpeg-only)
		await page.screenshot( { path: shotPath( section, name ), fullPage: false } );
	} );
}

async function shotPng( page, section, name ) {
	await page.screenshot( { path: shotPath( section, name ), fullPage: false } );
}

test.use( {
	viewport: { width: 1280, height: 720 },
} );

test.setTimeout( 60_000 );
test.describe.configure( { mode: 'serial' } );

test.describe( 'help screenshots', () => {
	test.beforeEach( async ( { page } ) => {
		await loginAsAdmin( page );
	} );

	test( 'installation', async ( { page } ) => {
		// 01 plugin list
		await page.goto( '/wp-admin/plugins.php', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( 'tr[data-slug="smart-booking"]', { timeout: 10_000 } );
		await page.evaluate( () => window.scrollTo( 0, 0 ) );
		await shotPng( page, 'installation', '01-plugin-list.png' );

		// 02 sidebar menu (Smart Booking のサブメニューが開いた状態)
		await page.goto( '/wp-admin/admin.php?page=smart-booking', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '#smart-booking-admin-app', { timeout: 10_000 } );
		await page.waitForTimeout( 500 );
		await shotPng( page, 'installation', '02-sidebar-menu.png' );
	} );

	test( 'stores', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=smart-booking-stores', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '.smb-page--stores', { timeout: 10_000 } );
		await page.waitForSelector( 'text=渋谷店', { timeout: 10_000 } );
		await page.waitForTimeout( 400 );
		// 03 store list (既にデータ追加済み)
		await shotPng( page, 'stores', '01-store-list.png' );
		await shotPng( page, 'stores', '03-store-added.png' );

		// 02 add modal (空の入力フォーム)
		await page.locator( 'button', { hasText: '店舗を追加' } ).first().click();
		await page.waitForSelector( '.smb-modal, .smb-modal__panel, [role="dialog"]', { timeout: 10_000 } );
		await page.waitForTimeout( 400 );
		await shotPng( page, 'stores', '02-store-add-modal.png' );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 300 );
	} );

	test( 'staff', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=smart-booking-stores', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '.smb-page--stores', { timeout: 10_000 } );
		// 担当者 タブへ切替
		await page.locator( 'button[role="tab"]', { hasText: '担当者' } ).click();
		await page.waitForSelector( 'text=田中 美咲', { timeout: 10_000 } );
		await page.waitForTimeout( 400 );
		await shotPng( page, 'staff', '01-staff-list.png' );
		await shotPng( page, 'staff', '03-staff-added.png' );

		// add modal
		await page.locator( 'button', { hasText: '担当者を追加' } ).first().click();
		await page.waitForSelector( '.smb-modal, .smb-modal__panel, [role="dialog"]', { timeout: 10_000 } );
		await page.waitForTimeout( 400 );
		await shotPng( page, 'staff', '02-staff-add-modal.png' );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 300 );
	} );

	test( 'schedule', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=smart-booking', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '#smart-booking-admin-app', { timeout: 10_000 } );
		await page.waitForSelector( 'text=スケジュールを追加', { timeout: 10_000 } );
		await page.waitForTimeout( 600 );
		await shotPng( page, 'schedule', '01-calendar-view.png' );
		await shotPng( page, 'schedule', '03-schedule-added.png' );

		// add modal
		await page.locator( 'button', { hasText: 'スケジュールを追加' } ).first().click();
		await page.waitForSelector( '[role="dialog"], .smb-modal__panel', { timeout: 10_000 } );
		await page.waitForTimeout( 500 );
		await shotPng( page, 'schedule', '02-add-modal.png' );
		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 400 );
	} );

	test( 'schedule-copy', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=smart-booking', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '#smart-booking-admin-app', { timeout: 10_000 } );
		await page.waitForSelector( 'text=スケジュールを追加', { timeout: 10_000 } );

		// 既存スケジュール行のコピーボタンをクリック
		const copyBtn = page.locator( 'button', { hasText: /^コピー$/ } ).first();
		await copyBtn.waitFor( { timeout: 10_000 } );
		await copyBtn.click();
		await page.waitForSelector( '[role="dialog"], .smb-modal__panel', { timeout: 10_000 } );
		await page.waitForTimeout( 500 );
		// 個別モード (デフォルト)
		await shotPng( page, 'schedule-copy', '01-copy-individual.png' );

		// パターンモードへ切替
		await page.locator( 'label', { hasText: 'パターンで選択' } ).click();
		await page.waitForTimeout( 500 );
		await shotPng( page, 'schedule-copy', '02-copy-pattern.png' );

		await page.keyboard.press( 'Escape' );
		await page.waitForTimeout( 300 );
	} );

	test( 'booking-form-shortcode', async ( { page } ) => {
		// page_id=7 の編集画面
		await page.goto( '/wp-admin/post.php?post=7&action=edit', { waitUntil: 'domcontentloaded' } );
		// Gutenberg のブロックエディタが起動するのを待つ
		await page.waitForSelector( '.editor-styles-wrapper, .edit-post-visual-editor, .interface-interface-skeleton__content', { timeout: 30_000 } );
		// ようこそツアーや welcome guide を閉じる
		const closeBtn = page.locator( 'button[aria-label*="ガイド"], button[aria-label*="閉じる"], button[aria-label*="Close"]' ).first();
		if ( await closeBtn.isVisible().catch( () => false ) ) {
			await closeBtn.click().catch( () => {} );
		}
		await page.waitForTimeout( 1500 );
		await shotPng( page, 'booking-form', '01-shortcode-editor.png' );
	} );

	test( 'booking-form-frontend', async ( { page } ) => {
		// 未ログイン状態だと preview など問題ないが、ログインクッキーがあっても問題なし
		await page.goto( '/?page_id=7', { waitUntil: 'domcontentloaded' } );
		// React マウント完了
		await page.waitForFunction(
			() => !! window.smartBookingFrontend && !! window.smartBookingFrontend.nonce,
			{ timeout: 15_000 }
		);
		await page.waitForSelector( '.smb-front-cards', { timeout: 15_000 } );
		await page.waitForTimeout( 500 );

		// 店舗カードをクリック (渋谷店)
		await page.locator( '.smb-front-card', { hasText: '渋谷店' } ).first().click();
		await page.waitForSelector( '.smb-front-card', { timeout: 10_000 } );
		await page.waitForTimeout( 400 );

		// 担当者カードをクリック (田中 美咲)
		await page.locator( '.smb-front-card', { hasText: '田中' } ).first().click();
		// 日付選択画面待ち
		await page.waitForSelector( '.smb-front-step', { timeout: 10_000 } );
		await page.waitForTimeout( 800 );

		// 02 front-form: 日付選択画面
		await shotPng( page, 'booking-form', '02-front-form.png' );

		// 月表示モード: 有効な日付セル (disabled でない) をクリック
		const dateCell = page.locator( 'button.smb-front-month-cell:not([disabled])' ).first();
		await dateCell.waitFor( { timeout: 15_000 } );
		await dateCell.scrollIntoViewIfNeeded();
		await page.waitForTimeout( 200 );
		// スクロール戻して全体を撮影 (02-front-form 用にすでに撮影済み)
		await dateCell.click();
		// 時間枠が表示されるまで待つ
		await page.waitForSelector( '.smb-front-time-slots, .smb-front-time-list', { timeout: 10_000 } );
		await page.waitForTimeout( 800 );
		await shotPng( page, 'booking-form', '03-front-time-select.png' );

		// 時間枠を選択
		const timeBtn = page.locator( 'button.smb-front-time-slot:not([disabled]), button.smb-front-time-btn:not([disabled])' ).first();
		await timeBtn.click();
		await page.waitForTimeout( 600 );

		// MainInputPage: フィールドの input は id="smb-front-field-{field_key}"
		const nameInput = page.locator( '#smb-front-field-customer_name' );
		await nameInput.waitFor( { timeout: 10_000 } );
		await nameInput.fill( '山田 太郎' );
		await page.locator( '#smb-front-field-customer_email' ).fill( 'taro@example.com' );
		await page.locator( '#smb-front-field-customer_phone' ).fill( '090-1234-5678' );
		const inquiry = page.locator( '#smb-front-field-inquiry' );
		if ( await inquiry.isVisible().catch( () => false ) ) {
			await inquiry.fill( '初めて利用します。よろしくお願いいたします。' );
		}
		// 「予約内容の確認」ボタン
		await page.locator( 'button', { hasText: '予約内容の確認' } ).first().click();
		await page.waitForSelector( 'text=予約を確定する', { timeout: 10_000 } );
		await page.waitForTimeout( 500 );
		await shotPng( page, 'booking-form', '04-front-confirm.png' );

		// 「予約を確定する」をクリック → 完了画面
		await page.locator( 'button', { hasText: '予約を確定する' } ).click();
		await page.waitForSelector( 'text=予約を承りました', { timeout: 15_000 } );
		await page.waitForTimeout( 500 );
		await shotPng( page, 'booking-form', '05-front-complete.png' );
	} );

	test( 'reservations', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=smart-booking-reservations', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '#smart-booking-admin-app', { timeout: 10_000 } );
		await page.waitForSelector( 'text=山田 太郎', { timeout: 15_000 } );
		await page.waitForTimeout( 500 );
		await shotPng( page, 'reservations', '01-reservation-list.png' );

		// CSV ボタンが見える状態
		await shotPng( page, 'reservations', '03-csv-button.png' );

		// 詳細モーダル: 山田 太郎 (pending) の行で「詳細を開く」ボタンをクリック
		await page.locator( 'button[aria-label*="山田 太郎"], button[aria-label*="詳細を開く"]' ).first().click();
		await page.waitForSelector( '[role="dialog"], .smb-modal__panel, .smb-modal', { timeout: 10_000 } );
		await page.waitForTimeout( 600 );
		await shotPng( page, 'reservations', '02-status-change.png' );
		await page.keyboard.press( 'Escape' );
	} );

	test( 'custom-fields', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=smart-booking-form-settings', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '#smart-booking-admin-app', { timeout: 10_000 } );
		await page.waitForSelector( 'text=フィールドタイプから追加', { timeout: 10_000 } );
		await page.waitForTimeout( 600 );
		// 上部にフィールドタイプカード
		await page.evaluate( () => window.scrollTo( 0, 0 ) );
		await shotPng( page, 'custom-fields', '01-field-types.png' );

		// 下部のフィールド一覧へスクロール
		await page.locator( 'text=現在のフィールド一覧' ).scrollIntoViewIfNeeded();
		await page.waitForTimeout( 500 );
		await shotPng( page, 'custom-fields', '02-field-list.png' );
	} );

	test( 'settings-tabs', async ( { page } ) => {
		await page.goto( '/wp-admin/admin.php?page=smart-booking-settings', { waitUntil: 'domcontentloaded' } );
		await page.waitForSelector( '#smart-booking-admin-app', { timeout: 10_000 } );
		await page.waitForSelector( '.smb-tabs', { timeout: 10_000 } );
		await page.waitForTimeout( 500 );

		// メール通知タブ
		await page.locator( 'button[role="tab"]', { hasText: 'メール通知' } ).click();
		await page.waitForTimeout( 500 );
		await shotPng( page, 'email', '01-email-tab.png' );

		// デザインタブ
		await page.locator( 'button[role="tab"]', { hasText: 'デザイン' } ).click();
		await page.waitForTimeout( 500 );
		await shotPng( page, 'design', '01-design-tab.png' );

		// 外部連携タブ
		await page.locator( 'button[role="tab"]', { hasText: '外部連携' } ).click();
		await page.waitForTimeout( 500 );
		// 上部 Google カレンダー
		await page.evaluate( () => window.scrollTo( 0, 0 ) );
		await page.waitForTimeout( 300 );
		await shotPng( page, 'google-calendar', '01-gcal-settings.png' );

		// ChatWork セクションへスクロール（ChatWork通知 見出しが上端付近に来るまで）
		await page.evaluate( () => {
			const headings = Array.from( document.querySelectorAll( 'h2, h3' ) );
			const cw = headings.find( ( h ) => /ChatWork/i.test( h.textContent || '' ) );
			if ( cw ) {
				cw.scrollIntoView( { block: 'start', behavior: 'instant' } );
			} else {
				window.scrollTo( 0, document.body.scrollHeight );
			}
		} );
		await page.waitForTimeout( 500 );
		await shotPng( page, 'chatwork', '01-chatwork-settings.png' );
	} );
} );
