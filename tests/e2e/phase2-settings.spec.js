/**
 * Phase 2: 設定画面（5タブ）
 *
 * - タブ切替（基本設定 / メール通知 / 外部連携 / デザイン / サポート）
 * - 基本設定 / メール通知 / 外部連携 / デザイン の保存・読み込み
 * - テンプレート変数ヘルパー（{customer_name} 等の挿入）
 * - サポートタブの外部リンク
 * - 未保存時のタブ切替警告
 * - 外部連携のデフォルト OFF
 * - 異常系（不正HEX、不正メール、負数）
 * - レスポンシブ（375px）でのタブ切替
 *
 * 実通信（Google Calendar / ChatWork API）はテスト対象外。
 * フェーズ2は「設定値の保存・読み込み・有効/無効切替・バリデーション」のみ検証する。
 */
const { test, expect } = require( '@playwright/test' );
const { execSync } = require( 'node:child_process' );
const path = require( 'node:path' );
const { bootstrapAdmin, restCall } = require( './phase2-helpers' );

test.describe.configure( { mode: 'default' } );

const SETTINGS_KEYS = [
	'smart_booking_booking_flow_order',
	'smart_booking_calendar_view_mode',
	'smart_booking_display_days',
	'smart_booking_booking_deadline_days',
	'smart_booking_booking_deadline_hours',
	'smart_booking_completion_message',
	'smart_booking_mail_from_name',
	'smart_booking_mail_from_email',
	'smart_booking_mail_receipt_user_subject',
	'smart_booking_mail_receipt_user_body',
	'smart_booking_mail_receipt_admin_subject',
	'smart_booking_mail_receipt_admin_body',
	'smart_booking_mail_approval_user_subject',
	'smart_booking_mail_approval_user_body',
	'smart_booking_google_calendar_enabled',
	'smart_booking_google_calendar_id',
	'smart_booking_chatwork_enabled',
	'smart_booking_chatwork_api_token',
	'smart_booking_chatwork_room_id',
	'smart_booking_color_button',
	'smart_booking_color_date_selected',
	'smart_booking_color_time_selected',
	'smart_booking_color_required_mark',
	'smart_booking_color_focus',
];

/**
 * 設定を全てリセット（wp_options から smb_* 設定キーを削除）。
 */
function resetSettings() {
	const quoted = SETTINGS_KEYS.map( ( k ) => `'${ k }'` ).join( ',' );
	try {
		execSync(
			`npx wp-env run cli wp db query "DELETE FROM wp_options WHERE option_name IN (${ quoted });"`,
			{
				cwd: path.resolve( __dirname, '..', '..' ),
				encoding: 'utf8',
				stdio: [ 'ignore', 'pipe', 'pipe' ],
				timeout: 30000,
			}
		);
	} catch ( _e ) {
		// noop.
	}
}

test.describe( 'Phase 2: 設定画面（5タブ）', () => {
	test.afterAll( () => {
		resetSettings();
	} );

	test.beforeEach( async ( { page } ) => {
		resetSettings();
		await bootstrapAdmin( page, 'settings' );
		await page.waitForSelector( '.smb-page--settings', { timeout: 15000 } );
	} );

	// -------------------------
	// 全体（タブ切替）
	// -------------------------

	test( '設定ページが React エラーなしで描画される（h1: 設定）', async ( {
		page,
	} ) => {
		await expect( page.locator( 'h1.smb-page__title' ) ).toHaveText(
			'設定'
		);
		// 5タブが描画されている.
		const tabs = page.locator( '.smb-tabs [role="tab"]' );
		await expect( tabs ).toHaveCount( 5 );
		const tabLabels = await tabs.allTextContents();
		const joined = tabLabels.join( '|' );
		expect( joined ).toContain( '基本設定' );
		expect( joined ).toContain( 'メール通知' );
		expect( joined ).toContain( '外部連携' );
		expect( joined ).toContain( 'デザイン' );
		expect( joined ).toContain( 'サポート' );
	} );

	test( 'タブ切替が動作する（5タブすべて）', async ( { page } ) => {
		// 初期は基本設定タブ（予約フロー セクションタイトル）.
		await expect(
			page.getByRole( 'heading', { name: '予約フロー' } )
		).toBeVisible();

		// メール通知タブへ.
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'メール通知' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: '差出人設定' } )
		).toBeVisible();

		// 外部連携タブへ.
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: '外部連携' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: 'Googleカレンダー連携' } )
		).toBeVisible();

		// デザインタブへ.
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'デザイン' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: 'カラーカスタマイズ' } )
		).toBeVisible();

		// サポートタブへ.
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'サポート' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: 'ヘルプ' } )
		).toBeVisible();
	} );

	// -------------------------
	// 基本設定タブ
	// -------------------------

	test( '基本設定: 予約フロー順序・カレンダー表示モード・表示期間を保存できる', async ( {
		page,
	} ) => {
		// 予約フロー: フォーム → 日付・時間.
		await page
			.locator(
				'input[name="smart_booking_booking_flow_order"][value="form-first"]'
			)
			.check();
		// カレンダー表示モード: 月表示のみ.
		await page
			.locator(
				'input[name="smart_booking_calendar_view_mode"][value="month_only"]'
			)
			.check();
		// 表示期間: 60.
		await page.locator( 'select' ).first().selectOption( '60' );

		await page.getByRole( 'button', { name: '基本設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '基本設定', {
			timeout: 6000,
		} );

		// API 経由で確認.
		const res = await restCall( page, 'GET', 'settings' );
		expect( res.ok ).toBe( true );
		expect( res.data.settings.smart_booking_booking_flow_order ).toBe( 'form-first' );
		expect( res.data.settings.smart_booking_calendar_view_mode ).toBe( 'month_only' );
		expect( String( res.data.settings.smart_booking_display_days ) ).toBe( '60' );
	} );

	test( '基本設定: 予約締切（時間前）を保存すると days=0 として永続化される', async ( {
		page,
	} ) => {
		// 既定で hours. 時間を 5 に.
		await page.getByLabel( '何時間前まで受け付けるか' ).fill( '5' );
		await page.getByRole( 'button', { name: '基本設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '基本設定', {
			timeout: 6000,
		} );

		const res = await restCall( page, 'GET', 'settings' );
		expect( String( res.data.settings.smart_booking_booking_deadline_hours ) ).toBe(
			'5'
		);
		expect( String( res.data.settings.smart_booking_booking_deadline_days ) ).toBe(
			'0'
		);
	} );

	test( '基本設定: 予約締切（日前）に切替→値を保存、hours は 0 に反転する', async ( {
		page,
	} ) => {
		// 日単位に切替.
		await page
			.locator( 'input[name="smb_booking_deadline_type"][value="days"]' )
			.check();
		await page.getByLabel( '何日前まで受け付けるか' ).fill( '3' );
		await page.getByRole( 'button', { name: '基本設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '基本設定', {
			timeout: 6000,
		} );

		const res = await restCall( page, 'GET', 'settings' );
		expect( String( res.data.settings.smart_booking_booking_deadline_days ) ).toBe(
			'3'
		);
		expect( String( res.data.settings.smart_booking_booking_deadline_hours ) ).toBe(
			'0'
		);
	} );

	test( '基本設定: 完了メッセージ（HTML許可）を保存できる', async ( {
		page,
	} ) => {
		const msg =
			'ご予約ありがとうございます。<br>確認メールをお送りしました。';
		await page.getByLabel( '完了画面メッセージ' ).fill( msg );
		await page.getByRole( 'button', { name: '基本設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( '基本設定', {
			timeout: 6000,
		} );

		const res = await restCall( page, 'GET', 'settings' );
		expect( res.data.settings.smart_booking_completion_message ).toContain( '<br>' );
		expect( res.data.settings.smart_booking_completion_message ).toContain(
			'ご予約ありがとうございます'
		);
	} );

	// -------------------------
	// メール通知タブ
	// -------------------------

	test( 'メール通知: 差出人名・差出人メール・各種件名を保存できる', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'メール通知' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: '差出人設定' } )
		).toBeVisible();

		await page.getByLabel( '差出人名' ).fill( 'テスト予約受付' );
		await page
			.getByLabel( '差出人メールアドレス' )
			.fill( 'noreply@example.com' );

		// 予約受付（ユーザー宛）件名.
		const receiptUserSubject = page
			.locator( '.smb-settings-section', {
				has: page.getByRole( 'heading', {
					name: '予約受付メール（ユーザー宛）',
				} ),
			} )
			.getByLabel( '件名' );
		await receiptUserSubject.fill( '受付メールの件名' );

		await page.getByRole( 'button', { name: 'メール設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toContainText( 'メール', {
			timeout: 6000,
		} );

		const res = await restCall( page, 'GET', 'settings' );
		expect( res.data.settings.smart_booking_mail_from_name ).toBe( 'テスト予約受付' );
		expect( res.data.settings.smart_booking_mail_from_email ).toBe(
			'noreply@example.com'
		);
		expect( res.data.settings.smart_booking_mail_receipt_user_subject ).toBe(
			'受付メールの件名'
		);
	} );

	test( 'メール通知: 不正なメールアドレス形式はサニタイズで空に戻される', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'メール通知' } )
			.click();
		await page.getByLabel( '差出人メールアドレス' ).fill( 'not-an-email' );
		await page.getByRole( 'button', { name: 'メール設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toBeVisible( { timeout: 6000 } );

		// REST のサニタイザ（is_email false なら空文字）で empty string が返る.
		const res = await restCall( page, 'GET', 'settings' );
		expect( res.data.settings.smart_booking_mail_from_email ).toBe( '' );
	} );

	test( 'メール通知: テンプレート変数チップで {customer_name} が本文に挿入される', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'メール通知' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: '差出人設定' } )
		).toBeVisible();

		// 予約受付（ユーザー宛）セクションの本文 textarea.
		const section = page.locator( '.smb-settings-section', {
			has: page.getByRole( 'heading', {
				name: '予約受付メール（ユーザー宛）',
			} ),
		} );
		const bodyTa = section.locator( 'textarea' );
		await bodyTa.fill( 'こんにちは、' );
		// カーソル位置を末尾に.
		await bodyTa.focus();
		await page.evaluate( () => {
			const tas = document.querySelectorAll(
				'.smb-settings-section textarea'
			);
			// 最初の本文テキストエリア（予約受付ユーザー宛）.
			const ta = tas[ 0 ];
			ta.selectionStart = ta.value.length;
			ta.selectionEnd = ta.value.length;
		} );

		// その直近の var-helper 内の {customer_name} チップをクリック.
		await section
			.locator( '.smb-var-chip', {
				has: page.locator( 'code', { hasText: '{customer_name}' } ),
			} )
			.click();

		await expect( bodyTa ).toHaveValue( /\{customer_name\}/ );

		// 保存して永続化を確認.
		await page.getByRole( 'button', { name: 'メール設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toBeVisible( { timeout: 6000 } );

		const res = await restCall( page, 'GET', 'settings' );
		expect( res.data.settings.smart_booking_mail_receipt_user_body ).toContain(
			'{customer_name}'
		);
	} );

	// -------------------------
	// 外部連携タブ
	// -------------------------

	test( '外部連携: 初期状態で Google Calendar / ChatWork は OFF', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: '外部連携' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: 'Googleカレンダー連携' } )
		).toBeVisible();

		// Google: Switch（role=switch）の aria-checked=false.
		const googleSwitch = page
			.locator( '.smb-settings-section', {
				has: page.getByRole( 'heading', {
					name: 'Googleカレンダー連携',
				} ),
			} )
			.getByRole( 'switch' );
		await expect( googleSwitch ).toHaveAttribute( 'aria-checked', 'false' );

		// ChatWork.
		const chatworkSwitch = page
			.locator( '.smb-settings-section', {
				has: page.getByRole( 'heading', { name: 'ChatWork通知' } ),
			} )
			.getByRole( 'switch' );
		await expect( chatworkSwitch ).toHaveAttribute(
			'aria-checked',
			'false'
		);

		// デフォルト OFF 時は入力欄 disabled.
		const calendarIdInput = page
			.locator( '.smb-settings-section', {
				has: page.getByRole( 'heading', {
					name: 'Googleカレンダー連携',
				} ),
			} )
			.getByLabel( 'カレンダーID' );
		await expect( calendarIdInput ).toBeDisabled();
	} );

	test( '外部連携: ChatWork 注意書き（通知専用アカウント推奨）が表示される', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: '外部連携' } )
			.click();
		await expect(
			page.getByText( /通知専用の\s*ChatWork\s*アカウント/ )
		).toBeVisible();
	} );

	test( '外部連携: Google ON にしてカレンダーIDを保存できる', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: '外部連携' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: 'Googleカレンダー連携' } )
		).toBeVisible();

		// スイッチ ON.
		const googleSection = page.locator( '.smb-settings-section', {
			has: page.getByRole( 'heading', { name: 'Googleカレンダー連携' } ),
		} );
		await googleSection.locator( '.smb-switch' ).click();
		await expect( googleSection.getByRole( 'switch' ) ).toHaveAttribute(
			'aria-checked',
			'true'
		);

		// カレンダーID 入力.
		await googleSection
			.getByLabel( 'カレンダーID' )
			.fill( 'test@group.calendar.google.com' );

		await page
			.getByRole( 'button', { name: '外部連携の設定を保存' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toBeVisible( { timeout: 6000 } );

		const res = await restCall( page, 'GET', 'settings' );
		// bool は 1/0 で返る.
		expect( String( res.data.settings.smart_booking_google_calendar_enabled ) ).toBe(
			'1'
		);
		expect( res.data.settings.smart_booking_google_calendar_id ).toBe(
			'test@group.calendar.google.com'
		);
	} );

	test( '外部連携: ON → OFF に戻して保存できる（永続化）', async ( {
		page,
	} ) => {
		// まず ON で保存（REST 直接）.
		await restCall( page, 'POST', 'settings', {
			settings: {
				smart_booking_google_calendar_enabled: 1,
				smart_booking_google_calendar_id: 'test@example.com',
			},
		} );
		await page.reload();
		await page.waitForSelector( '.smb-page--settings', { timeout: 15000 } );
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: '外部連携' } )
			.click();

		// ON 状態確認.
		const googleSection = page.locator( '.smb-settings-section', {
			has: page.getByRole( 'heading', { name: 'Googleカレンダー連携' } ),
		} );
		await expect( googleSection.getByRole( 'switch' ) ).toHaveAttribute(
			'aria-checked',
			'true'
		);

		// OFF に切替.
		await googleSection.locator( '.smb-switch' ).click();
		await expect( googleSection.getByRole( 'switch' ) ).toHaveAttribute(
			'aria-checked',
			'false'
		);

		await page
			.getByRole( 'button', { name: '外部連携の設定を保存' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toBeVisible( { timeout: 6000 } );

		const res = await restCall( page, 'GET', 'settings' );
		expect( String( res.data.settings.smart_booking_google_calendar_enabled ) ).toBe(
			'0'
		);
	} );

	test( '外部連携: ChatWork API トークン・ルームID を保存できる', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: '外部連携' } )
			.click();

		const chatworkSection = page.locator( '.smb-settings-section', {
			has: page.getByRole( 'heading', { name: 'ChatWork通知' } ),
		} );
		await chatworkSection.locator( '.smb-switch' ).click();
		await expect( chatworkSection.getByRole( 'switch' ) ).toHaveAttribute(
			'aria-checked',
			'true'
		);

		await chatworkSection
			.getByLabel( 'APIトークン' )
			.fill( 'test-api-token-xxxx' );
		await chatworkSection.getByLabel( 'ルームID' ).fill( '123456789' );

		await page
			.getByRole( 'button', { name: '外部連携の設定を保存' } )
			.click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toBeVisible( { timeout: 6000 } );

		const res = await restCall( page, 'GET', 'settings' );
		expect( String( res.data.settings.smart_booking_chatwork_enabled ) ).toBe( '1' );
		expect( res.data.settings.smart_booking_chatwork_api_token ).toBe(
			'test-api-token-xxxx'
		);
		expect( res.data.settings.smart_booking_chatwork_room_id ).toBe( '123456789' );
	} );

	// -------------------------
	// デザインタブ
	// -------------------------

	test( 'デザイン: カラーコードを保存できる', async ( { page } ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'デザイン' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: 'カラーカスタマイズ' } )
		).toBeVisible();

		// ボタン色 HEX テキストを編集（テキスト入力）.
		const buttonHex = page.getByLabel( 'ボタン色 カラーコード' );
		await buttonHex.fill( '#ff5733' );

		await page.getByRole( 'button', { name: 'テーマ設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toBeVisible( { timeout: 6000 } );

		const res = await restCall( page, 'GET', 'settings' );
		expect( res.data.settings.smart_booking_color_button ).toBe( '#ff5733' );
	} );

	test( 'デザイン: 不正な HEX 形式はクライアント側で拒否される', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'デザイン' } )
			.click();
		const buttonHex = page.getByLabel( 'ボタン色 カラーコード' );
		await buttonHex.fill( 'not-a-hex' );

		await page.getByRole( 'button', { name: 'テーマ設定を保存' } ).click();
		// エラートースト.
		await expect(
			page.locator( '.smb-toast--error' ).last()
		).toContainText( /カラーコード|形式/, { timeout: 6000 } );

		// 値は保存されない.
		const res = await restCall( page, 'GET', 'settings' );
		expect( res.data.settings.smart_booking_color_button ).not.toBe( 'not-a-hex' );
	} );

	// -------------------------
	// サポートタブ
	// -------------------------

	test( 'サポート: 使い方ガイド・FAQ・カスタマイズ相談リンクが表示される', async ( {
		page,
	} ) => {
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'サポート' } )
			.click();
		await expect(
			page.getByRole( 'heading', { name: 'ヘルプ' } )
		).toBeVisible();

		// 3つのリンク要素.
		await expect(
			page.locator( 'text=使い方ガイド' ).first()
		).toBeVisible();
		await expect(
			page.locator( 'text=よくある質問' ).first()
		).toBeVisible();
		await expect(
			page.getByRole( 'button', { name: '公式サイトで相談する' } )
		).toBeVisible();

		// リンク先 URL が wp-smart-booking.com.
		const guide = page.locator( 'a.smb-support-card', {
			hasText: '使い方ガイド',
		} );
		await expect( guide ).toHaveAttribute(
			'href',
			/wp-smart-booking\.com/
		);
		const faq = page.locator( 'a.smb-support-card', {
			hasText: 'よくある質問',
		} );
		await expect( faq ).toHaveAttribute( 'href', /wp-smart-booking\.com/ );
		// 開発元リンク（liberdade-inc.com）も存在.
		await expect(
			page.locator( 'a[href*="liberdade-inc.com"]' ).first()
		).toBeVisible();
	} );

	// -------------------------
	// 未保存ダイアログ
	// -------------------------

	test( '未保存の変更があるタブから別タブに切り替えると警告ダイアログが出る', async ( {
		page,
	} ) => {
		// 基本設定タブで値を変更（ダーティに）.
		await page
			.locator(
				'input[name="smart_booking_booking_flow_order"][value="form-first"]'
			)
			.check();

		// メール通知タブへ切替 → 確認ダイアログ.
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: 'メール通知' } )
			.click();
		await expect(
			page.getByText( '未保存の変更があります' )
		).toBeVisible();
		// キャンセル（このタブに留まる）.
		await page.getByRole( 'button', { name: 'このタブに留まる' } ).click();
		// 基本設定タブのままであることを確認.
		await expect(
			page.getByRole( 'heading', { name: '予約フロー' } )
		).toBeVisible();
	} );

	// -------------------------
	// 異常系・REST 直接
	// -------------------------

	test( 'REST: 負数の表示期間は int キャストされる（負数も許容される点を記録）', async ( {
		page,
	} ) => {
		const res = await restCall( page, 'POST', 'settings', {
			settings: { smart_booking_display_days: -5 },
		} );
		expect( res.ok ).toBe( true );
		// サーバ側は (int) キャストのみ。負数がそのまま保存される挙動を検証する.
		const get = await restCall( page, 'GET', 'settings' );
		expect( Number( get.data.settings.smart_booking_display_days ) ).toBe( -5 );
	} );

	test( 'REST: ホワイトリスト外のキーは無視される', async ( { page } ) => {
		const res = await restCall( page, 'POST', 'settings', {
			settings: { smb_unknown_key: 'evil', smart_booking_display_days: 14 },
		} );
		expect( res.ok ).toBe( true );
		expect( res.data.updated ).toBe( 1 );
		expect( res.data.settings.smb_unknown_key ).toBeUndefined();
		// 未設定は空文字で返る（get_all のフォールバック）.
		const get = await restCall( page, 'GET', 'settings' );
		expect( get.data.settings.smb_unknown_key ).toBeUndefined();
	} );

	test( 'REST: 不正 HEX（色）はサーバで空に正規化される', async ( {
		page,
	} ) => {
		const res = await restCall( page, 'POST', 'settings', {
			settings: { smart_booking_color_button: 'not-a-color' },
		} );
		expect( res.ok ).toBe( true );
		expect( res.data.settings.smart_booking_color_button ).toBe( '' );
	} );

	test( 'REST: 不正メール（差出人）はサーバで空に正規化される', async ( {
		page,
	} ) => {
		const res = await restCall( page, 'POST', 'settings', {
			settings: { smart_booking_mail_from_email: 'not-an-email' },
		} );
		expect( res.ok ).toBe( true );
		expect( res.data.settings.smart_booking_mail_from_email ).toBe( '' );
	} );

	test( 'REST: settings が配列でない POST は 400 エラー', async ( {
		page,
	} ) => {
		const res = await restCall( page, 'POST', 'settings', {
			settings: 'not-an-object',
		} );
		expect( res.status ).toBe( 400 );
	} );

	test( 'REST: nonce なしの GET は 401/403', async ( { page } ) => {
		const result = await page.evaluate( async () => {
			const ctx = window.smartBookingAdmin || {};
			const url = ctx.restUrl.replace( /\/$/, '' ) + '/settings';
			const res = await fetch( url, {
				credentials: 'same-origin',
				headers: { Accept: 'application/json' },
			} );
			return { status: res.status };
		} );
		expect( [ 401, 403 ] ).toContain( result.status );
	} );

	test( 'メール本文の <script> はサーバで除去される（wp_kses_post）', async ( {
		page,
	} ) => {
		const body = 'hello <script>alert(1)</script> world';
		const res = await restCall( page, 'POST', 'settings', {
			settings: { smart_booking_mail_receipt_user_body: body },
		} );
		expect( res.ok ).toBe( true );
		expect( res.data.settings.smart_booking_mail_receipt_user_body ).not.toContain(
			'<script>'
		);
		expect( res.data.settings.smart_booking_mail_receipt_user_body ).toContain(
			'hello'
		);
	} );

	test( 'REST: bool 切替（1 <-> 0）が永続化される', async ( { page } ) => {
		await restCall( page, 'POST', 'settings', {
			settings: { smart_booking_google_calendar_enabled: 1 },
		} );
		let get = await restCall( page, 'GET', 'settings' );
		expect( String( get.data.settings.smart_booking_google_calendar_enabled ) ).toBe(
			'1'
		);
		await restCall( page, 'POST', 'settings', {
			settings: { smart_booking_google_calendar_enabled: 0 },
		} );
		get = await restCall( page, 'GET', 'settings' );
		expect( String( get.data.settings.smart_booking_google_calendar_enabled ) ).toBe(
			'0'
		);
	} );
} );

test.describe( 'Phase 2: 設定画面 - レスポンシブ（375px）', () => {
	test.afterAll( () => {
		resetSettings();
	} );

	test( 'スマホ幅で 5 タブ切替・基本設定の保存ができる', async ( {
		page,
	} ) => {
		resetSettings();
		await bootstrapAdmin( page, 'settings' );
		await page.waitForSelector( '.smb-page--settings', { timeout: 15000 } );

		// 5 タブすべて切替できる.
		const tabNames = [
			'基本設定',
			'メール通知',
			'外部連携',
			'デザイン',
			'サポート',
		];
		for ( const name of tabNames ) {
			await page
				.locator( '.smb-tabs [role="tab"]', { hasText: name } )
				.click();
			await expect(
				page.locator( '.smb-tabs [role="tab"][aria-selected="true"]' )
			).toContainText( name );
		}

		// 基本設定タブに戻って保存.
		await page
			.locator( '.smb-tabs [role="tab"]', { hasText: '基本設定' } )
			.click();
		await page
			.locator(
				'input[name="smart_booking_calendar_view_mode"][value="month_only"]'
			)
			.check();
		await page.getByRole( 'button', { name: '基本設定を保存' } ).click();
		await expect(
			page.locator( '.smb-toast--success' ).last()
		).toBeVisible( { timeout: 6000 } );
	} );
} );
