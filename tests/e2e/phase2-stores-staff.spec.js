/**
 * Phase 2: 店舗・担当者 CRUD。
 *
 * - タブ切替
 * - 店舗の追加・編集・有効/無効切替・並び替え・削除
 * - 担当者の追加・編集・削除
 * - 必須項目バリデーション
 * - 予約紐付き店舗の削除拒否（409）
 * - 初期店舗（id=1）は復元
 */
const { test, expect } = require('@playwright/test');
const {
	bootstrapAdmin,
	restCall,
	restoreSnapshot,
	insertStoreDirectly,
	insertStaffDirectly,
	countTable,
	ymd,
} = require('./phase2-helpers');

// 各テストは独立（beforeEach で restoreSnapshot）。
// default mode でよいが、wp-cli 並列 race を避けるため workers=1 推奨。
test.describe.configure({ mode: 'default' });

test.describe('Phase 2: 店舗・担当者 管理', () => {
	test.afterAll(() => {
		restoreSnapshot();
	});

	test.beforeEach(async ({ page }) => {
		restoreSnapshot();
		await bootstrapAdmin(page, 'stores');
		await page.waitForSelector('.smb-page--stores', { timeout: 15000 });
	});

	test('店舗タブにデフォルトの店舗が表示される', async ({ page }) => {
		await expect(page.locator('h1.smb-page__title')).toHaveText('店舗・担当者');
		// タブ.
		await expect(page.locator('.smb-tab', { hasText: '店舗' })).toBeVisible();
		await expect(page.locator('.smb-tab', { hasText: '担当者' })).toBeVisible();
		// デフォルト店舗のカードが 1 枚.
		await expect(page.locator('.smb-card-list article.smb-card')).toHaveCount(1);
	});

	test('店舗を追加できる（モーダル → 入力 → 追加 → カードに反映）', async ({ page }) => {
		// [BUG-1] includes/rest/class-rest-stores.php create_item の get_item 呼び出しが
		// WP_REST_Request の $attributes に id を誤セットしており、常に 404 を返す。
		// 挿入自体は成功するため DB には 1 件増える。UI には「追加に失敗」のような誤メッセージが出る。
		const before = countTable('wp_smb_stores');
		await page.getByRole('button', { name: /店舗を追加/ }).first().click();
		await expect(page.locator('.smb-modal__title', { hasText: '店舗を追加' })).toBeVisible();
		await page.getByLabel(/店舗名/, { exact: false }).first().fill('E2E店舗A');
		await page.getByLabel(/店舗説明/).fill('E2E テストで追加された店舗');
		await page.locator('.smb-modal__footer').getByRole('button', { name: /追加する/ }).click();
		// 期待: 成功トースト → モーダル閉じ → カード 2 枚.
		// 実態（BUG-1）: API が 404 を返すため、エラートースト「指定された店舗が見つかりません」。
		await expect(page.locator('.smb-toast--success').last()).toContainText('追加', { timeout: 6000 });
		const after = countTable('wp_smb_stores');
		expect(after).toBe(before + 1);
		await expect(page.locator('.smb-card__title', { hasText: 'E2E店舗A' })).toBeVisible();
	});

	test('必須項目（店舗名）未入力のとき追加ボタンを押すとバリデーションエラーが表示される', async ({ page }) => {
		await page.getByRole('button', { name: /店舗を追加/ }).first().click();
		await expect(page.locator('.smb-modal__title', { hasText: '店舗を追加' })).toBeVisible();
		await page.locator('.smb-modal__footer').getByRole('button', { name: /追加する/ }).click();
		// エラー文言が表示される.
		await expect(page.locator('.smb-field__error', { hasText: '店舗名は必須' })).toBeVisible();
		// モーダルはまだ開いている.
		await expect(page.locator('.smb-modal__title', { hasText: '店舗を追加' })).toBeVisible();
	});

	test('無効な HEX カラーコードで保存するとバリデーションエラーが表示される', async ({ page }) => {
		await page.getByRole('button', { name: /店舗を追加/ }).first().click();
		await page.getByLabel(/店舗名/, { exact: false }).first().fill('色テスト店舗');
		// カラーコード HEX 入力を破壊的に書き換え.
		await page.locator('input[aria-label="カラーコード"]').fill('not-a-color');
		await page.locator('.smb-modal__footer').getByRole('button', { name: /追加する/ }).click();
		await expect(page.locator('.smb-field__error', { hasText: /カラーコード/ })).toBeVisible();
	});

	test('無効なメールアドレスでバリデーションエラーが表示される', async ({ page }) => {
		await page.getByRole('button', { name: /店舗を追加/ }).first().click();
		await page.getByLabel(/店舗名/, { exact: false }).first().fill('メールエラー店舗');
		await page.getByLabel(/メールアドレス/, { exact: false }).first().fill('not-an-email');
		await page.locator('.smb-modal__footer').getByRole('button', { name: /追加する/ }).click();
		await expect(page.locator('.smb-field__error', { hasText: /メールアドレス/ })).toBeVisible();
	});

	test('店舗を編集できる', async ({ page }) => {
		// 既定店舗の編集ボタン.
		await page.locator('.smb-card').first().getByRole('button', { name: '編集' }).click();
		await expect(page.locator('.smb-modal__title', { hasText: '店舗を編集' })).toBeVisible();
		const nameInput = page.getByLabel(/店舗名/, { exact: false }).first();
		await nameInput.fill('編集後の名前');
		await page.locator('.smb-modal__footer').getByRole('button', { name: '保存' }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('更新', { timeout: 6000 });
		await expect(page.locator('.smb-card__title', { hasText: '編集後の名前' })).toBeVisible();
	});

	test('店舗の有効/無効スイッチが切り替わる', async ({ page }) => {
		const card = page.locator('.smb-card').first();
		const checkbox = card.locator('.smb-switch input[type="checkbox"]').first();
		const toggleBefore = await checkbox.isChecked();
		await card.locator('.smb-switch__track').first().click();
		// トースト表示を待って反転を確認.
		await expect(page.locator('.smb-toast').last()).toBeVisible({ timeout: 6000 });
		const toggleAfter = await checkbox.isChecked();
		expect(toggleAfter).toBe(!toggleBefore);
	});

	test('店舗の並び替え（↑↓）が動作する', async ({ page }) => {
		// BUG-1 回避のため DB 直接 INSERT.
		insertStoreDirectly({ name: '並び替え店舗B', calendar_color: '#00aa00', sort_order: 20 });
		await page.reload();
		await page.waitForSelector('.smb-page--stores', { timeout: 15000 });
		await expect(page.locator('.smb-card-list article.smb-card')).toHaveCount(2);

		// 2つ目のカードの↑を押して 1 番目にする.
		const secondCard = page.locator('.smb-card').nth(1);
		const secondTitle = (await secondCard.locator('.smb-card__title').textContent())?.trim();
		await secondCard.locator('button[aria-label="上に移動"]').click();
		// 少し待って並び替え反映.
		await page.waitForTimeout(500);
		const firstTitleAfter = (
			await page.locator('.smb-card').first().locator('.smb-card__title').textContent()
		)?.trim();
		expect(firstTitleAfter).toBe(secondTitle);
	});

	test('予約が紐づいている店舗は削除できず警告が表示される（409）', async ({ page }) => {
		// 明日のスケジュールと予約を事前に用意する.
		const tomorrow = ymd(1);
		const schedRes = await restCall(page, 'POST', 'schedules', {
			items: [
				{
					store_id: 1,
					staff_id: 1,
					schedule_date: tomorrow,
					start_time: '14:00',
					end_time: '15:00',
					capacity: 2,
					is_active: 1,
				},
			],
		});
		expect(schedRes.ok).toBe(true);
		const scheduleId = schedRes.data.ids[0];
		const resvRes = await restCall(page, 'POST', 'reservations', {
			schedule_id: scheduleId,
			customer_name: '紐付け太郎',
			customer_email: 'tied@example.com',
			customer_phone: '09000000000',
			status: 'approved',
		});
		expect(resvRes.ok).toBe(true);

		// 削除を試みる.
		await page.reload();
		await page.waitForSelector('.smb-page--stores', { timeout: 15000 });
		await page.locator('.smb-card').first().getByRole('button', { name: '削除' }).click();
		await expect(page.locator('.smb-modal__title', { hasText: '店舗を削除' })).toBeVisible();
		await page.getByRole('button', { name: '削除する' }).click();
		// エラートーストに「予約」の文字.
		await expect(page.locator('.smb-toast--error').last()).toContainText(/予約/, { timeout: 6000 });
		// カードは残っている.
		await expect(page.locator('.smb-card-list article.smb-card')).toHaveCount(1);
	});

	test('担当者タブ: 担当者の追加・編集・削除', async ({ page }) => {
		// 担当者タブへ.
		await page.locator('.smb-tab', { hasText: '担当者' }).click();
		// 追加.
		await page.getByRole('button', { name: /担当者を追加/ }).first().click();
		await expect(page.locator('.smb-modal__title', { hasText: '担当者を追加' })).toBeVisible();
		await page.getByLabel(/担当者名/, { exact: false }).fill('テスト花子');
		// 保存.
		await page.locator('.smb-modal__footer').getByRole('button', { name: /追加する/ }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('追加', { timeout: 6000 });
		await expect(page.locator('.smb-card__title', { hasText: 'テスト花子' })).toBeVisible();

		// 編集.
		await page.locator('.smb-card', { hasText: 'テスト花子' }).getByRole('button', { name: '編集' }).click();
		const nameInput = page.getByLabel(/担当者名/, { exact: false });
		await nameInput.fill('テスト花子_改');
		await page.locator('.smb-modal__footer').getByRole('button', { name: '保存' }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('更新', { timeout: 6000 });

		// 削除.
		await page.locator('.smb-card', { hasText: 'テスト花子_改' }).getByRole('button', { name: '削除' }).click();
		await page.getByRole('button', { name: '削除する' }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('削除', { timeout: 6000 });
	});

	test('担当者必須項目（名前）のバリデーション', async ({ page }) => {
		await page.locator('.smb-tab', { hasText: '担当者' }).click();
		await page.getByRole('button', { name: /担当者を追加/ }).first().click();
		await page.locator('.smb-modal__footer').getByRole('button', { name: /追加する/ }).click();
		await expect(page.locator('.smb-field__error', { hasText: /担当者名は必須/ })).toBeVisible();
	});

	test('予約が紐づいている担当者は削除できず警告が表示される（409）', async ({ page }) => {
		// BUG-2: staff create_item も stores と同じバグで 404 を返すため DB 直接 INSERT.
		const newStaffId = insertStaffDirectly({ store_id: 1, name: '紐付け担当者', sort_order: 20 });
		expect(newStaffId).toBeGreaterThan(0);

		// その担当者にスケジュール + 予約を紐付け.
		const d = ymd(2);
		const schedRes = await restCall(page, 'POST', 'schedules', {
			items: [
				{
					store_id: 1,
					staff_id: newStaffId,
					schedule_date: d,
					start_time: '09:00',
					end_time: '10:00',
					capacity: 1,
					is_active: 1,
				},
			],
		});
		expect(schedRes.ok).toBe(true);
		const resvRes = await restCall(page, 'POST', 'reservations', {
			schedule_id: schedRes.data.ids[0],
			customer_name: '担当紐付け花子',
			customer_email: 'staff-tied@example.com',
			customer_phone: '09000000001',
			status: 'approved',
		});
		expect(resvRes.ok).toBe(true);

		// 担当者タブで削除試行.
		await page.reload();
		await page.waitForSelector('.smb-page--stores', { timeout: 15000 });
		await page.locator('.smb-tab', { hasText: '担当者' }).click();
		await page
			.locator('.smb-card', { hasText: '紐付け担当者' })
			.getByRole('button', { name: '削除' })
			.click();
		await page.getByRole('button', { name: '削除する' }).click();
		await expect(page.locator('.smb-toast--error').last()).toContainText(/予約/, { timeout: 6000 });
	});

	test('存在しない店舗IDへの更新は 404', async ({ page }) => {
		const res = await restCall(page, 'PUT', 'stores/99999', {
			name: '存在しない',
			calendar_color: '#2271b1',
			is_active: 1,
		});
		expect(res.ok).toBe(false);
		expect(res.status).toBe(404);
	});

	test('存在しない担当者IDへの削除は 404', async ({ page }) => {
		const res = await restCall(page, 'DELETE', 'staff/99999');
		expect(res.ok).toBe(false);
		expect(res.status).toBe(404);
	});
});
