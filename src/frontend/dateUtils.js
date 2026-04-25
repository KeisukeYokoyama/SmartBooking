/**
 * フロント予約フォーム用の日付ユーティリティ。
 *
 * - 外部ライブラリ（dayjs/moment 等）は使わない（@wordpress/scripts バンドル軽量化のため）。
 * - タイムゾーンはブラウザローカル基準で計算する。schedule_date は `YYYY-MM-DD` 文字列として扱う。
 */

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * Date を 'YYYY-MM-DD'（ローカルタイム基準）で整形する。
 *
 * @param {Date} date
 * @returns {string}
 */
export function toYmd(date) {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

/**
 * 'YYYY-MM-DD' を Date（ローカルタイム 00:00）にパースする。
 *
 * @param {string} ymd
 * @returns {Date|null}
 */
export function fromYmd(ymd) {
	if (typeof ymd !== 'string') return null;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
	if (!m) return null;
	const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
	return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 指定日数を足した新しい Date を返す。
 *
 * @param {Date} date
 * @param {number} delta
 * @returns {Date}
 */
export function addDays(date, delta) {
	const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	d.setDate(d.getDate() + delta);
	return d;
}

/**
 * 月を delta だけ動かした新しい Date を返す（日は1日に揃える）。
 *
 * @param {Date} date
 * @param {number} delta
 * @returns {Date}
 */
export function addMonths(date, delta) {
	return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * 今日（ローカルタイム 00:00）。
 *
 * @returns {Date}
 */
export function today() {
	const t = new Date();
	return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

/**
 * 2つの日付が同じ日（年月日）かを判定する。
 *
 * @param {Date|null} a
 * @param {Date|null} b
 * @returns {boolean}
 */
export function isSameDay(a, b) {
	if (!a || !b) return false;
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

/**
 * 日表示用のストリップ（今日から N 日連続）を生成する。
 *
 * @param {Date} start 起点日.
 * @param {number} count 日数.
 * @returns {{ date: Date, ymd: string, weekdayLabel: string }[]}
 */
export function buildDayStrip(start, count) {
	const out = [];
	for (let i = 0; i < count; i += 1) {
		const d = addDays(start, i);
		out.push({
			date: d,
			ymd: toYmd(d),
			weekdayLabel: WEEKDAY_LABELS[d.getDay()],
		});
	}
	return out;
}

/**
 * 月カレンダー表示用のグリッド（日曜始まり、6週42セル）を生成する。
 *
 * @param {Date} month 月内の任意日.
 * @returns {{date: Date, ymd: string, isCurrentMonth: boolean, weekdayIndex: number}[]}
 */
export function buildMonthGrid(month) {
	const first = new Date(month.getFullYear(), month.getMonth(), 1);
	const startOffset = first.getDay();
	const gridStart = addDays(first, -startOffset);
	const cells = [];
	for (let i = 0; i < 42; i += 1) {
		const d = addDays(gridStart, i);
		cells.push({
			date: d,
			ymd: toYmd(d),
			isCurrentMonth: d.getMonth() === month.getMonth(),
			weekdayIndex: d.getDay(),
		});
	}
	return cells;
}

/**
 * 月ラベル（例: "2026年4月"）。
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatYearMonth(date) {
	return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/**
 * 日付ラベル（例: "4月27日(月)"）。
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatMonthDay(date) {
	const wd = WEEKDAY_LABELS[date.getDay()];
	return `${date.getMonth() + 1}月${date.getDate()}日(${wd})`;
}
