/**
 * Phase 9 Eval-2: フロント予約フォーム リデザイン（デザイントークン / コンポーネントスタイル）検証。
 *
 * 仕様: docs/legacy-ui-handover/spec-amendment-frontend-redesign.md
 *   - 変更2: デザイントークン（カラー）
 *   - 変更3: UIコンポーネント仕様（送信ボタン / 入力フィールド / セクションタイトル / 必須バッジ）
 *
 * 検証方針:
 *   - CSS は `getComputedStyle` で実測する。`page.evaluate` で実際のレンダリング結果を取得し、
 *     `rgb(R, G, B)` 形式で比較する（hex 直比較は使わない）。
 *   - 設定が初期状態（`smb_color_*` オプション未設定）の状態で各デフォルトカラーを検証。
 *   - 5番（管理画面で色変更 → フロント反映）は `wp option update` で smb_color_button を上書きし、
 *     ブラウザ側で reload して反映を確認。テスト後は必ず `wp option delete` で復元（try/finally）。
 *
 * NOTE:
 *   - phase3-helpers.js の `restoreBaseline` / `gotoFrontForm` / `insertSchedulesBulk` を流用。
 *   - `restoreBaseline` は `smb_color_button` 等を `wp option delete` するため、毎テスト前に
 *     呼び出すことで「初期状態 = CSS 既定値が使われる」という前提を担保できる。
 */
const { test, expect } = require( '@playwright/test' );
const { execSync } = require( 'node:child_process' );
const path = require( 'node:path' );
const {
	gotoFrontForm,
	restoreBaseline,
	insertSchedulesBulk,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );

// playwright.config.js が workers=1 を強制しているため fixture 競合は起きない。
// serial モードにすると失敗時に後続テストがスキップされて検証範囲が狭くなるため、
// default モード（個別失敗が他テストに波及しない）で実行する。

/**
 * wp-env CLI コマンドを同期実行する（phase3-helpers の wpCli 同等。
 * helpers から export されていないため最低限のローカル定義）。
 *
 * @param {string} cmd
 * @return {string} stdout
 */
function wpCli( cmd ) {
	return execSync( `npx wp-env run cli ${ cmd }`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 60_000,
	} );
}

/**
 * 今日から 1〜3 日後までの 10:00-11:00 / 14:00-15:00 スケジュールを投入する。
 * メイン画面で日付タイル / 時間スロット / フォーム入力すべてが描画される状態を作る。
 */
function seedFewSchedules() {
	const rows = [];
	for ( let i = 1; i <= 3; i++ ) {
		const d = ymd( i );
		rows.push( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
		rows.push( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: d,
			start: '14:00:00',
			end: '15:00:00',
			capacity: 3,
		} );
	}
	insertSchedulesBulk( rows );
}

/**
 * 指定セレクタの背景色を `rgb(...)` 形式で返す。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          selector
 * @return {Promise<string>}
 */
async function bgColorOf( page, selector ) {
	return page.locator( selector ).first().evaluate( ( el ) => {
		return window.getComputedStyle( el ).backgroundColor;
	} );
}

test.describe( 'Phase 9 Eval-2: デザイントークン / コンポーネントスタイル検証', () => {
	test.setTimeout( 60_000 );

	test.beforeEach( async () => {
		restoreBaseline();
	} );

	test.afterAll( async () => {
		restoreBaseline();
	} );

	// ---- 1) 送信ボタンの背景色 = #f43f5e ----

	test( '送信ボタン (.smb-front-btn-primary) のデフォルト背景色は rgb(244, 63, 94)', async ( {
		page,
	} ) => {
		seedFewSchedules();
		await gotoFrontForm( page );

		// メイン画面の確認ボタンは .smb-front-main-page__confirm-btn に
		// .smb-front-btn-primary が併記されている。
		const btn = page.locator( '.smb-front-btn-primary' ).first();
		await expect( btn ).toBeVisible();

		const bg = await btn.evaluate( ( el ) => window.getComputedStyle( el ).backgroundColor );
		expect( bg ).toBe( 'rgb(244, 63, 94)' );
	} );

	// ---- 2) 日付選択状態の背景色 = #374151（日表示 / 月表示） ----

	test( '日付選択時 (.smb-front-day-tile.is-selected) の背景色は rgb(55, 65, 81)', async ( {
		page,
	} ) => {
		seedFewSchedules();
		await gotoFrontForm( page );

		// availability fetch 完了 → 「:not(.is-disabled)」タイルが描画されるまで待機.
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page.waitForTimeout( 300 );

		// 非 disabled タイルの中から 1 件選ぶ.
		const target = page.locator( '.smb-front-day-tile:not(.is-disabled):not(:disabled)' ).first();
		await target.click();

		// is-selected かつ非 disabled の要素が 1 件確定するまで待つ.
		const selected = page.locator( '.smb-front-day-tile.is-selected:not(.is-disabled):not(:disabled)' );
		await expect( selected ).toHaveCount( 1 );

		// className と CSS 変数の解決値も合わせて取得して、原因切り分けを容易にする.
		const info = await selected.evaluate( ( el ) => {
			const cs = window.getComputedStyle( el );
			const rootStyles = window.getComputedStyle(
				document.getElementById( 'smart-booking-app' ) || el
			);
			return {
				className: el.className,
				disabled: el.disabled,
				ariaPressed: el.getAttribute( 'aria-pressed' ),
				bg: cs.backgroundColor,
				color: cs.color,
				varDateSelected: rootStyles.getPropertyValue( '--smb-front-color-date-selected' ).trim(),
			};
		} );
		// 期待: is-selected ルールが効いている (#374151 = rgb(55,65,81))。
		// 失敗時は info を assertion メッセージに含めて切り分け可能にする.
		expect.soft( info.className ).toContain( 'is-selected' );
		expect.soft( info.varDateSelected ).toMatch( /#374151|rgb\(\s*55,\s*65,\s*81\s*\)/ );
		expect( info.bg, JSON.stringify( info ) ).toBe( 'rgb(55, 65, 81)' );
	} );

	test( '月表示で日付選択時 (.smb-front-month-cell.is-selected) の背景色は rgb(55, 65, 81)', async ( {
		page,
	} ) => {
		seedFewSchedules();
		// restoreBaseline が smb_calendar_view_mode を delete するため、
		// REST 側のデフォルト 'day_only' が返ってトグルが描画されない。
		// 明示的に 'day-and-month'（= REST が 'toggle' に正規化する値）をセットして
		// 日/月トグルが描画される状態を作る。afterAll の restoreBaseline で復元される。
		wpCli( `wp option update smb_calendar_view_mode "day-and-month"` );

		await gotoFrontForm( page );

		// トグルボタンは role="tab"（DateSelect.jsx の <button role="tab">）。
		const monthToggle = page.getByRole( 'tab', { name: /月/ } ).first();
		await expect( monthToggle ).toBeVisible();
		await monthToggle.click();

		await page.waitForSelector(
			'.smb-front-month-cell:not(.is-disabled):not(.is-other-month):not(.is-out-of-range)',
			{ timeout: 10_000 }
		);
		const cell = page
			.locator( '.smb-front-month-cell:not(.is-disabled):not(.is-other-month):not(.is-out-of-range)' )
			.first();
		await cell.click();

		const selected = page.locator( '.smb-front-month-cell.is-selected' );
		await expect( selected ).toHaveCount( 1 );
		const bg = await selected.evaluate( ( el ) => window.getComputedStyle( el ).backgroundColor );
		expect( bg ).toBe( 'rgb(55, 65, 81)' );
	} );

	// ---- 3) 時間選択状態のスタイル ----
	//
	// 旧仕様: 選択時に bg=#374151 のダーク塗り潰し。
	// 新仕様 (legacy UI hover_color.png 踏襲):
	//   - bg は薄いベース色 (--smb-front-bg-light) のまま
	//   - border-color は --smb-front-color-time-selected (青系 #3498db) に変化
	//   - box-shadow inset で太枠を表現
	//   - 文字色は本文色のまま読みやすく維持

	test( '時間選択時 (.smb-front-time-slot.is-selected) は青系ボーダー + 薄背景になる', async ( {
		page,
	} ) => {
		seedFewSchedules();
		await gotoFrontForm( page );

		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		} );
		await page.waitForTimeout( 200 );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled):not(:disabled)' )
			.last()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();

		const selected = page.locator(
			'.smb-front-time-slot.is-selected:not(.is-disabled)'
		);
		await expect( selected ).toHaveCount( 1 );
		// .smb-front-time-btn は border-color / box-shadow に 120ms の transition が掛かっているので、
		// 直後の getComputedStyle は補間値（開始時=デフォルト境界色）を返す。確実に反映後を読むため待つ。
		await page.waitForTimeout( 250 );
		const info = await selected.evaluate( ( el ) => {
			const cs = window.getComputedStyle( el );
			return {
				bg: cs.backgroundColor,
				borderColor: cs.borderTopColor,
				boxShadow: cs.boxShadow,
			};
		} );
		// 背景は薄い (--smb-front-bg-light = #f8f9fa) — ダーク塗り潰しではない。
		expect( info.bg ).toBe( 'rgb(248, 249, 250)' );
		// ボーダーは青系 (--smb-front-color-time-selected デフォルト #3498db)。
		expect( info.borderColor ).toBe( 'rgb(52, 152, 219)' );
		// box-shadow inset で太枠を表現。
		expect( info.boxShadow ).toContain( 'inset' );
	} );

	// ---- 4) 必須バッジの背景色 = #ef4444 ----

	test( '必須バッジ (.smb-front-required-badge) の背景色は rgb(239, 68, 68)', async ( {
		page,
	} ) => {
		seedFewSchedules();
		await gotoFrontForm( page );

		// メイン画面に必須バッジ（フォーム側 / 時間枠ヘッダー）が存在する.
		const badge = page.locator( '.smb-front-required-badge' ).first();
		await expect( badge ).toBeVisible();
		const bg = await badge.evaluate( ( el ) => window.getComputedStyle( el ).backgroundColor );
		expect( bg ).toBe( 'rgb(239, 68, 68)' );
	} );

	// ---- 5) 管理画面で色変更 → フロント反映 ----

	test( 'smb_color_button を変更するとフロントの送信ボタン背景色に反映される', async ( {
		page,
	} ) => {
		seedFewSchedules();
		// オプション直接更新 → ブラウザ reload で反映確認 → テスト後に必ずクリーンアップ.
		try {
			wpCli( `wp option update smb_color_button "#00ff00"` );

			await gotoFrontForm( page );
			// ブラウザ側 fetch キャッシュ対策で networkidle まで待機.
			await page.reload( { waitUntil: 'networkidle' } );
			// 設定反映後の再マウント完了を待つ（confirm ボタン可視まで）.
			await expect( page.locator( '.smb-front-btn-primary' ).first() ).toBeVisible();

			const bg = await bgColorOf( page, '.smb-front-btn-primary' );
			expect( bg ).toBe( 'rgb(0, 255, 0)' );
		} finally {
			// 復元: option を削除して CSS 既定値（#f43f5e）に戻す.
			try {
				wpCli( `wp option delete smb_color_button` );
			} catch ( _e ) {
				// 既に未設定なら無視.
			}
		}
	} );

	// ---- 6) 送信ボタンの border-radius = 8px ----

	test( '送信ボタンの border-radius は 8px', async ( { page } ) => {
		seedFewSchedules();
		await gotoFrontForm( page );

		const btn = page.locator( '.smb-front-btn-primary' ).first();
		await expect( btn ).toBeVisible();
		const radius = await btn.evaluate( ( el ) => window.getComputedStyle( el ).borderTopLeftRadius );
		expect( radius ).toBe( '8px' );
	} );

	// ---- 7) 入力フィールドの padding = 16px (4辺) ----

	test( '入力フィールド (.smb-front-input) の padding は 4 辺すべて 16px', async ( { page } ) => {
		seedFewSchedules();
		await gotoFrontForm( page );

		const input = page.locator( '.smb-front-input' ).first();
		await expect( input ).toBeVisible();
		const padding = await input.evaluate( ( el ) => {
			const s = window.getComputedStyle( el );
			return {
				top: s.paddingTop,
				right: s.paddingRight,
				bottom: s.paddingBottom,
				left: s.paddingLeft,
			};
		} );
		expect( padding ).toEqual( {
			top: '16px',
			right: '16px',
			bottom: '16px',
			left: '16px',
		} );
	} );

	// ---- 8) セクションタイトルの font-size = 22px ----

	test( 'セクションタイトル (.smb-front-section-title) の font-size は 22px', async ( {
		page,
	} ) => {
		seedFewSchedules();
		await gotoFrontForm( page );

		const title = page.locator( '.smb-front-section-title' ).first();
		await expect( title ).toBeVisible();
		const fontSize = await title.evaluate( ( el ) => window.getComputedStyle( el ).fontSize );
		expect( fontSize ).toBe( '22px' );
	} );
} );
