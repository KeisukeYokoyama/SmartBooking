/**
 * Phase 2: フォーム設定（カスタムフィールド + テーマ）。
 *
 * - タブ切替
 * - 初期3フィールドが表示される（氏名・メール・電話）
 * - 初期フィールドの削除は拒否（保護）
 * - 新規フィールド追加（各タイプ）
 * - 並び替え
 * - 選択肢必須（select/radio/checkbox）
 * - テーマタブで色を保存
 */
const { test, expect } = require('@playwright/test');
const { bootstrapAdmin, restCall, restoreSnapshot } = require('./phase2-helpers');

test.describe.configure({ mode: 'default' });

test.describe('Phase 2: フォーム設定（フィールド）', () => {
	test.afterAll(() => {
		restoreSnapshot();
	});

	test.beforeEach(async ({ page }) => {
		restoreSnapshot();
		await bootstrapAdmin(page, 'form-settings');
		await page.waitForSelector('.smb-page--form-settings', { timeout: 15000 });
	});

	test('フィールド設定タブに初期3フィールド（氏名/メール/電話）がロック表示される', async ({ page }) => {
		await expect(page.locator('h1.smb-page__title')).toHaveText('フォーム設定');
		// 3行のカスタムフィールド + ロックアイコン.
		const rows = page.locator('.smb-field-list__row');
		await expect(rows).toHaveCount(3);
		// protected フィールドはロックマーク.
		await expect(page.locator('.smb-field-list__row.is-protected')).toHaveCount(3);
	});

	test('初期フィールドの削除ボタンは無効化されている', async ({ page }) => {
		const row = page.locator('.smb-field-list__row').first();
		const deleteBtn = row.getByRole('button', { name: '削除' });
		await expect(deleteBtn).toBeDisabled();
	});

	test('新規フィールド（text型）をフィールドタイプカードから追加できる', async ({ page }) => {
		// フィールドタイプカードの「1行テキスト」をクリック.
		await page
			.locator('.smb-field-type-card', { hasText: '1行テキスト' })
			.getByRole('button', { name: /追加/ })
			.click();
		await expect(page.locator('.smb-modal__title', { hasText: 'フィールドを追加' })).toBeVisible();
		await page.getByLabel(/ラベル/, { exact: false }).first().fill('会社名');
		// 日本語ラベルは suggestKey が空を返すため、キーを手動で入力.
		const keyField = page.locator('.smb-field', {
			has: page.locator('label', { hasText: 'フィールドキー' }),
		});
		await keyField.locator('input').fill('company_name');
		await page.locator('.smb-modal__footer').getByRole('button', { name: 'フィールドを追加' }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('追加', { timeout: 6000 });
		// 行が 4 行になる.
		await expect(page.locator('.smb-field-list__row')).toHaveCount(4);
	});

	test('select 型は選択肢未入力で追加するとバリデーションエラー', async ({ page }) => {
		await page
			.locator('.smb-field-type-card', { hasText: 'セレクトボックス' })
			.getByRole('button', { name: /追加/ })
			.click();
		await expect(page.locator('.smb-modal__title', { hasText: 'フィールドを追加' })).toBeVisible();
		await page.getByLabel(/ラベル/, { exact: false }).first().fill('性別');
		// 選択肢未入力で送信.
		await page.locator('.smb-modal__footer').getByRole('button', { name: 'フィールドを追加' }).click();
		await expect(
			page.locator('.smb-field__error', { hasText: /選択肢/ })
		).toBeVisible();
	});

	test('フィールドキー重複でバリデーションエラー', async ({ page }) => {
		await page
			.locator('.smb-field-type-card', { hasText: '1行テキスト' })
			.getByRole('button', { name: /追加/ })
			.click();
		await page.getByLabel(/ラベル/, { exact: false }).first().fill('氏名重複');
		// キーを初期フィールドと同じ customer_name に変更.
		const keyInput = page.locator('input').filter({ hasText: '' }).nth(1); // 簡易的に2番目の input を狙う.
		// 確実にキーを取るため label 'フィールドキー' を狙う.
		const keyField = page.locator('.smb-field', { has: page.locator('label', { hasText: 'フィールドキー' }) });
		await keyField.locator('input').fill('customer_name');
		await page.locator('.smb-modal__footer').getByRole('button', { name: 'フィールドを追加' }).click();
		await expect(
			page.locator('.smb-field__error', { hasText: /既に使われています/ })
		).toBeVisible();
	});

	test('追加したフィールドを編集・削除できる', async ({ page }) => {
		// 先にフィールド追加.
		const res = await restCall(page, 'POST', 'custom-fields', {
			field_label: '会社名',
			field_key: 'company_name',
			field_type: 'text',
			is_required: 0,
			sort_order: 40,
		});
		expect(res.ok).toBe(true);
		await page.reload();
		await page.waitForSelector('.smb-page--form-settings', { timeout: 15000 });
		await expect(page.locator('.smb-field-list__row')).toHaveCount(4);

		// 編集.
		await page
			.locator('.smb-field-list__row', { hasText: '会社名' })
			.getByRole('button', { name: '編集' })
			.click();
		await expect(page.locator('.smb-modal__title', { hasText: 'フィールドを編集' })).toBeVisible();
		await page.getByLabel(/ラベル/, { exact: false }).first().fill('会社名称');
		await page.locator('.smb-modal__footer').getByRole('button', { name: '変更を保存' }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('更新', { timeout: 6000 });

		// 削除.
		await page
			.locator('.smb-field-list__row', { hasText: '会社名称' })
			.getByRole('button', { name: '削除' })
			.click();
		await page.getByRole('button', { name: '削除する' }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('削除', { timeout: 6000 });
		await expect(page.locator('.smb-field-list__row')).toHaveCount(3);
	});

	test('↓ ボタンで並び替えできる', async ({ page }) => {
		// 1つ新規フィールド追加して末尾に足す.
		await restCall(page, 'POST', 'custom-fields', {
			field_label: '並び替え用',
			field_key: 'reorder_test',
			field_type: 'text',
			is_required: 0,
			sort_order: 100,
		});
		await page.reload();
		await page.waitForSelector('.smb-page--form-settings', { timeout: 15000 });
		const rowsBefore = await page.locator('.smb-field-list__row').allTextContents();
		// 1 行目（customer_name）の ↓ を押す.
		await page
			.locator('.smb-field-list__row')
			.first()
			.getByRole('button', { name: '下へ移動' })
			.click();
		await page.waitForTimeout(800);
		const rowsAfter = await page.locator('.smb-field-list__row').allTextContents();
		expect(rowsBefore[0]).not.toBe(rowsAfter[0]);
	});

	test('初期フィールド customer_name を DELETE するとAPIが 400 を返す（保護）', async ({ page }) => {
		// customer_name の id を取得.
		const list = await restCall(page, 'GET', 'custom-fields');
		expect(list.ok).toBe(true);
		const target = list.data.find((f) => f.field_key === 'customer_name');
		expect(target).toBeTruthy();
		const delRes = await restCall(page, 'DELETE', `custom-fields/${target.id}`);
		expect(delRes.ok).toBe(false);
		expect(delRes.status).toBe(400);
		expect(String(delRes.data?.code || '')).toContain('protected');
	});

	test('初期フィールドはタイプ変更 / 必須解除しても結果的に元の値が保持される', async ({ page }) => {
		const list = await restCall(page, 'GET', 'custom-fields');
		const target = list.data.find((f) => f.field_key === 'customer_name');
		// 意図的に type を変え、is_required=0 にしてみる.
		const putRes = await restCall(page, 'PUT', `custom-fields/${target.id}`, {
			field_label: 'お名前（改）',
			field_key: 'customer_name',
			field_type: 'textarea',
			is_required: 0,
			sort_order: target.sort_order,
		});
		expect(putRes.ok).toBe(true);
		// 確認: 保護属性が保たれている（type は text のまま、is_required=1 のまま）.
		const after = await restCall(page, 'GET', `custom-fields/${target.id}`);
		expect(after.ok).toBe(true);
		expect(after.data.field_type).toBe('text');
		expect(Number(after.data.is_required)).toBe(1);
	});

	test('テーマタブ: ボタン色を変更して保存できる', async ({ page }) => {
		await page.locator('.smb-tab', { hasText: 'テーマ設定' }).click();
		await expect(page.locator('.smb-theme-settings')).toBeVisible();
		// HEX テキスト入力を書き換え.
		const hexInputs = page.locator('input[aria-label*="カラーコード"]');
		await hexInputs.first().fill('#ff0000');
		await page.getByRole('button', { name: 'テーマ設定を保存' }).click();
		await expect(page.locator('.smb-toast--success').last()).toContainText('保存', { timeout: 6000 });
	});

	test('テーマタブ: 不正な HEX 値でバリデーションエラー', async ({ page }) => {
		await page.locator('.smb-tab', { hasText: 'テーマ設定' }).click();
		const hexInputs = page.locator('input[aria-label*="カラーコード"]');
		await hexInputs.first().fill('zzzzzz');
		await page.getByRole('button', { name: 'テーマ設定を保存' }).click();
		await expect(page.locator('.smb-field__error, .smb-toast--error').first()).toBeVisible();
	});
});
