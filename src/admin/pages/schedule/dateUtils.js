/**
 * スケジュール管理で使うローカル日付ユーティリティ。
 *
 * 外部ライブラリ（moment/dayjs 等）は使わない。ネイティブ Date + Intl で処理する。
 * タイムゾーンは常にブラウザのローカルタイムゾーン基準で計算する。
 * schedule_date は必ず 'YYYY-MM-DD' 形式の文字列として扱い、タイムゾーン混入を避ける。
 */

/**
 * 指定 Date を 'YYYY-MM-DD'（ローカルタイム基準）で整形する。
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
 * new Date('2026-04-01') は UTC 扱いでズレるため、自前で解析する。
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
 * 指定月の初日 Date を返す。
 *
 * @param {Date} date 月内の任意日.
 * @returns {Date}
 */
export function startOfMonth(date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * 指定月の末日 Date を返す。
 *
 * @param {Date} date 月内の任意日.
 * @returns {Date}
 */
export function endOfMonth(date) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

/**
 * 月を delta だけ動かした新しい Date を返す（日は1日に揃える）。
 *
 * @param {Date} date
 * @param {number} delta 正負の整数.
 * @returns {Date}
 */
export function addMonths(date, delta) {
	return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

/**
 * 日を delta だけ動かした新しい Date を返す。
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
 * 月カレンダー表示用のグリッド（日曜始まり、6週42セル）を生成する。
 *
 * @param {Date} month 月内の任意日.
 * @returns {{date: Date, ymd: string, isCurrentMonth: boolean}[]}
 */
export function buildMonthGrid(month) {
	const first = startOfMonth(month);
	const startOffset = first.getDay(); // 0=Sun..6=Sat
	const gridStart = addDays(first, -startOffset);
	const cells = [];
	for (let i = 0; i < 42; i += 1) {
		const d = addDays(gridStart, i);
		cells.push({
			date: d,
			ymd: toYmd(d),
			isCurrentMonth: d.getMonth() === month.getMonth(),
		});
	}
	return cells;
}

/**
 * 曜日ラベル（日〜土）。
 */
export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

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

/**
 * 日付ラベル（例: "2026年4月27日(月)"）。
 *
 * @param {Date} date
 * @returns {string}
 */
export function formatFullDate(date) {
	const wd = WEEKDAY_LABELS[date.getDay()];
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日(${wd})`;
}

/**
 * 'HH:MM' / 'HH:MM:SS' を正規化して 'HH:MM' を返す（失敗時は空文字）。
 *
 * @param {string} t
 * @returns {string}
 */
export function normalizeTime(t) {
	if (typeof t !== 'string') return '';
	const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(t);
	if (!m) return '';
	const h = Math.max(0, Math.min(23, Number(m[1])));
	const mm = Math.max(0, Math.min(59, Number(m[2])));
	return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * 'HH:MM' を分換算する（失敗時は null）。
 *
 * @param {string} t
 * @returns {number|null}
 */
export function timeToMinutes(t) {
	const n = normalizeTime(t);
	if (!n) return null;
	const [h, m] = n.split(':').map(Number);
	return h * 60 + m;
}

/**
 * 分数を 'HH:MM' にフォーマット（24h 範囲内でクランプ）。
 *
 * @param {number} mins
 * @returns {string}
 */
export function minutesToTime(mins) {
	const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
	const h = Math.floor(m / 60);
	const mm = m % 60;
	return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}
