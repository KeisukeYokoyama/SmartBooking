/**
 * GTM 連携テスト: 予約フォームの各ステップ遷移時に
 * window.dataLayer へカスタムイベントがプッシュされることを検証する。
 *
 * 仕様（src/frontend/utils/analytics.js / docs/help/markdown/gtm.md と同期）:
 *   - smart_booking_step  / booking_step: store_select | staff_select | date_select | time_select | form_input | confirm
 *   - smart_booking_complete / booking_step: complete
 *
 * 検証戦略:
 *   1. 店舗 2 件 + それぞれ担当者 1 名を作成し、店舗選択・担当者選択ステップを必ず通過させる。
 *   2. 7 日分のスケジュールを投入し、フロー全体を完走する。
 *   3. 完了画面到達後、window.dataLayer から smart_booking_step / smart_booking_complete のイベントだけを取り出し、
 *      期待する booking_step が全て含まれていることを assert。
 */
import { test, expect } from '@playwright/test';

const helpers = require('./phase3-helpers');

const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	insertStore,
	insertStaff,
	insertSchedulesBulk,
	fillCoreFormAndGoConfirm,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = helpers;

type DataLayerEntry = {
	event?: string;
	booking_step?: string;
};

test.describe.configure({ mode: 'serial' });

test.describe('GTM dataLayer 連携', () => {
	test.setTimeout(60_000);

	test.beforeEach(async () => {
		restoreBaseline();
	});

	test.afterAll(async () => {
		restoreBaseline();
	});

	test('予約フロー完走で全ステップのイベントが dataLayer に積まれる', async ({ page }) => {
		// 店舗・担当者の選択ステップを表示させる（手動 ON/OFF トグルが必要）。
		setOption('smabo_show_store_front', 1);
		setOption('smabo_show_staff_front', 1);
		// 店舗 2・担当者 2 にして、store_select / staff_select を必ず経由させる。
		const store2 = insertStore('店舗2');
		insertStaff(store2, '担当者B');

		// 店舗1 に 7 日分のスケジュール（10:00-11:00 / 14:00-15:00）。
		const rows: Array<{
			storeId: number;
			staffId: number;
			date: string;
			start: string;
			end: string;
			capacity: number;
		}> = [];
		for (let i = 1; i <= 6; i++) {
			const d = ymd(i);
			rows.push({
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '10:00:00',
				end: '11:00:00',
				capacity: 3,
			});
			rows.push({
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: d,
				start: '14:00:00',
				end: '15:00:00',
				capacity: 3,
			});
		}
		insertSchedulesBulk(rows);

		await gotoFrontForm(page);

		// store_select 段階 — dataLayer にすでに store_select が積まれているはず。
		await expect(page.getByRole('heading', { name: '店舗を選択' })).toBeVisible();
		await page.getByRole('button', { name: /店舗1 を選択/ }).click();

		// staff_select.
		await expect(page.getByRole('heading', { name: '担当者を選択' })).toBeVisible();
		await page.getByRole('button', { name: /担当者1 を選択/ }).click();

		// date_select / time_select (MainInputPage で同時マウント).
		await expect(page.getByRole('heading', { name: '日付選択' })).toBeVisible();
		await page.waitForSelector('.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		});
		await page.locator('.smb-front-day-tile:not(.is-disabled)').first().click();
		await expect(
			page.getByRole('region', { name: '選択した日の時間枠' })
		).toBeVisible();

		// dataLayer の中間検証: confirm 到達前に store/staff/date/time/form_input が出揃っていること。
		const midSteps = await page.evaluate(() => {
			const dl = (window as unknown as { dataLayer?: DataLayerEntry[] }).dataLayer || [];
			return dl
				.filter(
					(e) =>
						e.event === 'smart_booking_step' ||
						e.event === 'smart_booking_complete'
				)
				.map((e) => e.booking_step);
		});
		expect(midSteps).toEqual(
			expect.arrayContaining([
				'store_select',
				'staff_select',
				'date_select',
				'time_select',
				'form_input',
			])
		);

		// 時間枠 → form 入力 → 確認 → 完了。
		await page.getByRole('button', { name: /10:00から11:00/ }).click();
		await fillCoreFormAndGoConfirm(page, {
			name: 'ガ ターゲ',
			email: 'gtm@example.com',
			phone: '090-1234-5678',
		});
		await expect(
			page.getByRole('heading', { name: '予約内容の確認' })
		).toBeVisible();
		await page.getByRole('button', { name: '予約を確定する' }).click();
		await expect(
			page.getByRole('heading', { name: 'ご予約ありがとうございました' })
		).toBeVisible({ timeout: 10_000 });

		// 最終検証: 期待する全ステップが含まれていること。
		const dataLayer = await page.evaluate(() => {
			const dl = (window as unknown as { dataLayer?: DataLayerEntry[] }).dataLayer || [];
			return dl.slice();
		});
		const steps = dataLayer
			.filter(
				(e) =>
					e.event === 'smart_booking_step' ||
					e.event === 'smart_booking_complete'
			)
			.map((e) => e.booking_step);

		expect(steps).toContain('store_select');
		expect(steps).toContain('staff_select');
		expect(steps).toContain('date_select');
		expect(steps).toContain('time_select');
		expect(steps).toContain('form_input');
		expect(steps).toContain('confirm');
		expect(steps).toContain('complete');

		// complete はイベント名が smart_booking_complete であることを確認。
		const completeEntry = dataLayer.find((e) => e.booking_step === 'complete');
		expect(completeEntry?.event).toBe('smart_booking_complete');

		// それ以外のステップ系は smart_booking_step。
		const stepEntries = dataLayer.filter(
			(e) =>
				e.booking_step !== undefined && e.booking_step !== 'complete'
		);
		for (const e of stepEntries) {
			expect(e.event).toBe('smart_booking_step');
		}
	});

	test('スキップされた店舗ステップでは store_select イベントが送信されない', async ({ page }) => {
		// baseline (店舗1・担当者1) のままアクセス → 店舗・担当者は自動スキップ。
		const rows: Array<{
			storeId: number;
			staffId: number;
			date: string;
			start: string;
			end: string;
			capacity: number;
		}> = [];
		for (let i = 1; i <= 3; i++) {
			rows.push({
				storeId: USER_STORE_ID,
				staffId: USER_STAFF_ID,
				date: ymd(i),
				start: '10:00:00',
				end: '11:00:00',
				capacity: 3,
			});
		}
		insertSchedulesBulk(rows);

		await gotoFrontForm(page);
		await expect(page.getByRole('heading', { name: '日付選択' })).toBeVisible();
		// availability 取得待ち（DateSelect の useEffect 完走後）。
		await page.waitForSelector('.smb-front-day-tile:not(.is-disabled)', {
			timeout: 10_000,
		});

		const steps = await page.evaluate(() => {
			const dl = (window as unknown as { dataLayer?: DataLayerEntry[] }).dataLayer || [];
			return dl
				.filter(
					(e) =>
						e.event === 'smart_booking_step' ||
						e.event === 'smart_booking_complete'
				)
				.map((e) => e.booking_step);
		});

		expect(steps).not.toContain('store_select');
		expect(steps).not.toContain('staff_select');
		expect(steps).toContain('date_select');
	});

	test('GTM (window.dataLayer) 未設置でも JS エラーにならない', async ({ page }) => {
		// dataLayer をあえて未定義のまま開かせる目的で、ネイティブ動作確認。
		// pushBookingEvent は dataLayer がなければ作る実装なので、コンソールエラーが出ないことを確認する。
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				const t = msg.text();
				if (
					t.includes('favicon.ico') ||
					t.includes('Failed to load resource')
				) {
					return;
				}
				errors.push(`console: ${t}`);
			}
		});

		await gotoFrontForm(page);
		await expect(page.getByRole('heading', { name: '日付選択' })).toBeVisible();
		await page.waitForTimeout(500);

		// pushBookingEvent が dataLayer を生成してくれるので、配列であることを確認。
		const isArray = await page.evaluate(() => Array.isArray(window.dataLayer));
		expect(isArray).toBe(true);

		expect(errors, errors.join('\n')).toEqual([]);
	});
});
