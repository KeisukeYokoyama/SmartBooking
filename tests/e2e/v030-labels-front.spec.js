/**
 * v0.3.0 機能① 店舗・担当者の呼び方設定 — フロント反映 E2E（新規・再現/回帰）。
 *
 * 検証:
 *   A. store_label="サロン" / staff_label="先生" → フロント見出しが「サロンを選択」「先生を選択」。
 *   B. 両ラベル空 → 見出しが「店舗を選択」「担当者を選択」（=従来と一致=デグレ無し）。
 *
 * 前提: show_store_front=1 / show_staff_front=1 で店舗・担当者ステップを両方表示させる。
 * baseline は 店舗1(id=2) / 担当者1(id=2) を持つ。
 */
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	USER_STORE_ID,
	USER_STAFF_ID,
	insertSchedule,
	ymd,
} = require( './phase3-helpers' );
const { wpCli } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

function cleanupLabels() {
	try {
		wpCli( 'option delete smart_booking_store_label' );
	} catch ( _e ) {}
	try {
		wpCli( 'option delete smart_booking_staff_label' );
	} catch ( _e ) {}
}

test.describe( 'v0.3.0 ①: 店舗・担当者の呼び方（フロント反映）', () => {
	test.setTimeout( 90_000 );

	test.beforeEach( async () => {
		restoreBaseline();
		cleanupLabels();
		// 店舗選択・担当者選択の両ステップを表示させる。
		setOption( 'smart_booking_show_store_front', 1 );
		setOption( 'smart_booking_show_staff_front', 1 );
		// 現実的なフローのため 1 枠だけ用意（見出し検証には必須ではないが実データで確認）。
		insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 1 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		} );
	} );

	test.afterAll( async () => {
		restoreBaseline();
		cleanupLabels();
	} );

	test( 'A: 呼び方変更 → 見出しが「サロンを選択」「先生を選択」に反映される', async ( {
		page,
	} ) => {
		setOption( 'smart_booking_store_label', 'サロン' );
		setOption( 'smart_booking_staff_label', '先生' );

		await gotoFrontForm( page );

		// 店舗選択ステップ見出し。
		await expect(
			page.getByRole( 'heading', { name: 'サロンを選択' } )
		).toBeVisible();
		// 従来デフォルト表記は出ない。
		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toHaveCount( 0 );
		// サブタイトルにも反映。
		await expect(
			page.getByText( 'ご予約いただくサロンをお選びください。' )
		).toBeVisible();

		// 店舗1 を選択して担当者ステップへ。
		await page.getByRole( 'button', { name: /店舗1 を選択/ } ).click();

		// 担当者選択ステップ見出し。
		await expect(
			page.getByRole( 'heading', { name: '先生を選択' } )
		).toBeVisible();
		await expect(
			page.getByRole( 'heading', { name: '担当者を選択' } )
		).toHaveCount( 0 );
	} );

	test( 'B: ラベル空 → 見出しが従来どおり「店舗を選択」「担当者を選択」（デグレ無し）', async ( {
		page,
	} ) => {
		// ラベルは未設定（beforeEach で delete 済み）。念のため空文字保存も検証。
		setOption( 'smart_booking_store_label', '' );
		setOption( 'smart_booking_staff_label', '' );

		await gotoFrontForm( page );

		await expect(
			page.getByRole( 'heading', { name: '店舗を選択' } )
		).toBeVisible();
		await expect(
			page.getByText( 'ご予約いただく店舗をお選びください。' )
		).toBeVisible();
		// カスタムラベルは出ない。
		await expect(
			page.getByRole( 'heading', { name: 'サロンを選択' } )
		).toHaveCount( 0 );

		await page.getByRole( 'button', { name: /店舗1 を選択/ } ).click();

		await expect(
			page.getByRole( 'heading', { name: '担当者を選択' } )
		).toBeVisible();
		await expect(
			page.getByRole( 'heading', { name: '先生を選択' } )
		).toHaveCount( 0 );
	} );
} );
