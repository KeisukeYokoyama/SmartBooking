/**
 * Phase 3 Fix-1: Generator 直前修正の 5 件ピンポイント再検証.
 *
 * 検証対象コミット: aab62a5（Phase 3 Fix-1）
 *
 * 1) BUG-PHASE3-1: flow_order='B' で form 後に date へ遷移する（confirm ではない）
 * 2) UX-1: スキップ時の「← 戻る」ボタン非表示（canGoBack ヘルパー反映）
 * 3) UX-7: 電話番号桁数バリデーション (`(((` / 桁数不足 / 文字種違反 / 正常値)
 * 4) UX-8: 確認画面 409 時に「日付を選び直す」ボタンが表示され date に戻る
 * 5) UX-9: text/email/tel エラー <p> に role="alert"
 *
 * すべて desktop プロジェクトで実行する想定（モバイル UA 固有の挙動なし）。
 */
const { test, expect } = require('@playwright/test');
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertStore,
	insertStaff,
	insertSchedule,
	publicRest,
	ymd,
} = require('./phase3-helpers');

// DB seed/restore があるため serial 実行.
test.describe.configure({ mode: 'serial' });

test.describe('Phase 3 Fix-1: Generator 修正 5 件 ピンポイント再検証', () => {
	test.setTimeout(60_000);

	test.beforeEach(async () => {
		restoreBaseline();
	});

	test.afterAll(async () => {
		restoreBaseline();
	});

	// =========================================================================
	// (1) BUG-PHASE3-1: flow_order='B' で form 後に date へ遷移する
	// =========================================================================
	test('BUG-PHASE3-1: flow_order=B で form 後に date へ遷移し、その後 time → confirm へ進める', async ({
		page,
	}) => {
		setOption('smb_booking_flow_order', 'B');
		// 店舗1・担当者1 + ymd(+1) のスケジュール 1 件.
		insertSchedule({
			storeId: 1,
			staffId: 1,
			date: ymd(1),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		});

		await gotoFrontForm(page);

		// flow B + 店舗1・担当者1 → store/staff スキップで form ステップから始まる.
		await expect(page.getByRole('heading', { name: 'お客様情報の入力' })).toBeVisible();

		// 必須3フィールド入力 → 「確認画面へ進む」.
		await page.locator('#smb-front-field-customer_name').fill('flowB 太郎');
		await page.locator('#smb-front-field-customer_email').fill('flowb@example.com');
		await page.locator('#smb-front-field-customer_phone').fill('090-1234-5678');
		await page.getByRole('button', { name: '確認画面へ進む' }).click();

		// 期待: confirm ではなく date ステップへ遷移する.
		await expect(page.getByRole('heading', { name: '日付を選択' })).toBeVisible({ timeout: 10_000 });
		// confirm 画面ヘッダは出ない.
		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toHaveCount(0);

		// 続けて日付を選択 → time 表示 → 時間枠クリック → confirm へ.
		await page.waitForSelector('.smb-front-day-tile:not(.is-disabled)', { timeout: 10_000 });
		await page.locator('.smb-front-day-tile:not(.is-disabled)').first().click();
		await page.getByRole('button', { name: /10:00から11:00/ }).click();

		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toBeVisible({ timeout: 10_000 });

		// 環境復元: flow_order を A に戻す（restoreBaseline でも消えるが念のため）.
		// restoreBaseline は test.beforeEach / afterAll で行われる.
	});

	// =========================================================================
	// (2) UX-1: スキップ時の「← 戻る」ボタン非表示
	// =========================================================================
	test('UX-1: 店舗1・担当者1 → 最初の date ステップに「戻る」ボタンが表示されない', async ({ page }) => {
		insertSchedule({
			storeId: 1,
			staffId: 1,
			date: ymd(1),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		});
		await gotoFrontForm(page);

		await expect(page.getByRole('heading', { name: '日付を選択' })).toBeVisible();
		// StepHeader の戻るボタン (.smb-front-step-header__back) が存在しない.
		await expect(page.locator('.smb-front-step-header__back')).toHaveCount(0);
		// aria-label="前のステップに戻る" のボタンも存在しない.
		await expect(
			page.getByRole('button', { name: '前のステップに戻る' }),
		).toHaveCount(0);
	});

	test('UX-1: 店舗2 + 各担当者2 → StaffSelect / DateSelect / FormInput で「戻る」が出る（回帰）', async ({
		page,
	}) => {
		// 店舗1 に既に「担当者1」がある。さらに店舗1 に追加担当者を作って「2 人」にする.
		insertStaff(1, '担当者A');
		// 店舗2 を追加し、店舗2 にも担当者を 2 人入れる（任意。store 選択肢を増やすため）.
		const store2 = insertStore('店舗2');
		insertStaff(store2, '店舗2-担当B1');
		insertStaff(store2, '店舗2-担当B2');

		// 店舗1 にスケジュールを 1 件入れて DateSelect が空でない状態にする.
		insertSchedule({
			storeId: 1,
			staffId: 1,
			date: ymd(1),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		});

		await gotoFrontForm(page);

		// 1) StoreSelect: そもそも先頭ステップは store. 戻るボタンは無い（idx=0）.
		await expect(page.getByRole('heading', { name: '店舗を選択' })).toBeVisible();
		await expect(page.locator('.smb-front-step-header__back')).toHaveCount(0);
		await page.getByRole('button', { name: /店舗1 を選択/ }).click();

		// 2) StaffSelect: 戻るボタンが出る（store に戻れる）.
		await expect(page.getByRole('heading', { name: '担当者を選択' })).toBeVisible();
		await expect(page.locator('.smb-front-step-header__back')).toHaveCount(1);
		await page.getByRole('button', { name: /担当者1 を選択/ }).click();

		// 3) DateSelect: 戻るボタンが出る（staff に戻れる）.
		await expect(page.getByRole('heading', { name: '日付を選択' })).toBeVisible();
		await expect(page.locator('.smb-front-step-header__back')).toHaveCount(1);

		// 戻るボタンを押すと StaffSelect に戻る.
		await page.locator('.smb-front-step-header__back').click();
		await expect(page.getByRole('heading', { name: '担当者を選択' })).toBeVisible();
	});

	// =========================================================================
	// (3) UX-7: 電話番号桁数バリデーション
	// =========================================================================
	test('UX-7: 電話番号 `(((` → 桁数エラー、`0901234` → 桁数エラー、`090-1234-5678` → エラーなし、`abc` → 文字種エラー', async ({
		page,
	}) => {
		insertSchedule({
			storeId: 1,
			staffId: 1,
			date: ymd(1),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		});
		await gotoFrontForm(page);

		// 日付 → 時間枠 → form へ.
		await page.waitForSelector('.smb-front-day-tile:not(.is-disabled)', { timeout: 10_000 });
		await page.locator('.smb-front-day-tile:not(.is-disabled)').first().click();
		await page.getByRole('button', { name: /10:00から11:00/ }).click();
		await expect(page.getByRole('heading', { name: 'お客様情報の入力' })).toBeVisible();

		const nameInput = page.locator('#smb-front-field-customer_name');
		const emailInput = page.locator('#smb-front-field-customer_email');
		const phoneInput = page.locator('#smb-front-field-customer_phone');
		const phoneErr = page.locator('#smb-front-field-customer_phone-err');
		const submit = page.getByRole('button', { name: '確認画面へ進む' });

		// 共通: 名前・メールは正常値で固定.
		await nameInput.fill('電話 太郎');
		await emailInput.fill('phone@example.com');

		// (a) `(((` → 文字種は正規表現にマッチ（数字・括弧・ハイフン・+）するので
		//     文字種エラーは出ない。数字桁数 0 で「桁数が正しくありません」が出る.
		await phoneInput.fill('(((');
		await submit.click();
		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toHaveCount(0);
		await expect(phoneErr).toContainText('電話番号の桁数が正しくありません');

		// (b) `0901234` → 7 桁で桁数不足.
		await phoneInput.fill('0901234');
		await submit.click();
		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toHaveCount(0);
		await expect(phoneErr).toContainText('電話番号の桁数が正しくありません');

		// (c) `abc` → 文字種違反メッセージ.
		await phoneInput.fill('abc');
		await submit.click();
		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toHaveCount(0);
		await expect(phoneErr).toContainText('数字・ハイフン・括弧・+ のみで入力');

		// (d) `090-1234-5678` → 11 桁、エラーなし → 確認画面へ進む.
		await phoneInput.fill('090-1234-5678');
		await submit.click();
		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toBeVisible({ timeout: 10_000 });
	});

	// =========================================================================
	// (4) UX-8: 確認画面 409 後に「日付を選び直す」ボタン表示 + クリックで date に戻る
	// =========================================================================
	test('UX-8: 同一スケジュールが満席の状態で確認画面から送信 → 409 + 「日付を選び直す」ボタン → クリックで date ステップへ', async ({
		page,
	}) => {
		// capacity=1 のスケジュールを 1 件.
		const schedId = insertSchedule({
			storeId: 1,
			staffId: 1,
			date: ymd(1),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 1,
		});

		await gotoFrontForm(page);

		// 日付選択 → 時間枠 → フォーム入力（確認画面まで進める）.
		await page.waitForSelector('.smb-front-day-tile:not(.is-disabled)', { timeout: 10_000 });
		await page.locator('.smb-front-day-tile:not(.is-disabled)').first().click();
		await page.getByRole('button', { name: /10:00から11:00/ }).click();
		await page.locator('#smb-front-field-customer_name').fill('競合 太郎');
		await page.locator('#smb-front-field-customer_email').fill('conflict@example.com');
		await page.locator('#smb-front-field-customer_phone').fill('090-0000-0001');
		await page.getByRole('button', { name: '確認画面へ進む' }).click();
		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toBeVisible();

		// 確認画面到達後、ユーザーが「予約を確定する」を押す前に
		// 別経路（REST 直叩き）で同一スケジュールを満席にする.
		const otherRes = await publicRest(page, 'public/reservations', {
			method: 'POST',
			body: {
				schedule_id: schedId,
				customer_name: '先行 予約者',
				customer_email: 'first@example.com',
				customer_phone: '090-9999-0000',
				honeypot: '',
				custom_fields: {},
			},
		});
		expect(otherRes.status, 'other tab POST should succeed').toBe(200);
		expect(otherRes.ok, 'other tab POST ok').toBe(true);

		// この時点で booked_count == capacity になり、こちらの送信は 409 で弾かれるはず.
		await page.getByRole('button', { name: '予約を確定する' }).click();

		// エラーバナー + 「日付を選び直す」ボタンが見える.
		const alert = page.locator('.smb-front-confirm__alert');
		await expect(alert).toBeVisible({ timeout: 10_000 });
		const reselectBtn = alert.getByRole('button', { name: '日付を選び直す' });
		await expect(reselectBtn).toBeVisible();

		// クリックで date ステップへ戻る.
		await reselectBtn.click();
		await expect(page.getByRole('heading', { name: '日付を選択' })).toBeVisible({ timeout: 10_000 });
	});

	// =========================================================================
	// (5) UX-9: text/email/tel エラー <p> に role="alert"
	// =========================================================================
	test('UX-9: 必須3フィールド空送信 → text/email/tel のエラー <p> に role="alert" が付く', async ({
		page,
	}) => {
		insertSchedule({
			storeId: 1,
			staffId: 1,
			date: ymd(1),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 3,
		});
		await gotoFrontForm(page);

		await page.waitForSelector('.smb-front-day-tile:not(.is-disabled)', { timeout: 10_000 });
		await page.locator('.smb-front-day-tile:not(.is-disabled)').first().click();
		await page.getByRole('button', { name: /10:00から11:00/ }).click();
		await expect(page.getByRole('heading', { name: 'お客様情報の入力' })).toBeVisible();

		// 全空のまま送信 → text/email/tel フィールドにエラーが出る.
		await page.getByRole('button', { name: '確認画面へ進む' }).click();
		await expect(page.getByRole('heading', { name: '予約内容の確認' })).toHaveCount(0);

		// 各 <p>#field-err 要素に role="alert" が付いていること.
		for (const key of ['customer_name', 'customer_email', 'customer_phone']) {
			const errP = page.locator(`#smb-front-field-${key}-err`);
			await expect(errP).toBeVisible();
			await expect(errP).toHaveAttribute('role', 'alert');
			await expect(errP).toContainText('必須');
		}

		// getByRole('alert') でも 3 件取れる（aria-roledescription による暗黙の role 計算）.
		const alerts = page.locator('.smb-front-form__error[role="alert"]');
		await expect(alerts).toHaveCount(3);
	});
});
