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
 * @return {string} 'YYYY-MM-DD' 形式の日付文字列
 */
export function toYmd( date ) {
	const y = date.getFullYear();
	const m = String( date.getMonth() + 1 ).padStart( 2, '0' );
	const d = String( date.getDate() ).padStart( 2, '0' );
	return `${ y }-${ m }-${ d }`;
}

/**
 * 'YYYY-MM-DD' を Date（ローカルタイム 00:00）にパースする。
 * new Date('2026-04-01') は UTC 扱いでズレるため、自前で解析する。
 *
 * @param {string} ymd 'YYYY-MM-DD' 形式の文字列
 * @return {Date|null} パース後の Date / 不正なら null
 */
export function fromYmd( ymd ) {
	if ( typeof ymd !== 'string' ) {
		return null;
	}
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec( ymd );
	if ( ! m ) {
		return null;
	}
	const d = new Date(
		Number( m[ 1 ] ),
		Number( m[ 2 ] ) - 1,
		Number( m[ 3 ] )
	);
	return Number.isNaN( d.getTime() ) ? null : d;
}

/**
 * 指定月の初日 Date を返す。
 *
 * @param {Date} date 月内の任意日.
 * @return {Date} 月初の Date (時刻 00:00)
 */
export function startOfMonth( date ) {
	return new Date( date.getFullYear(), date.getMonth(), 1 );
}

/**
 * 指定月の末日 Date を返す。
 *
 * @param {Date} date 月内の任意日.
 * @return {Date} 月末の Date (時刻 00:00)
 */
export function endOfMonth( date ) {
	return new Date( date.getFullYear(), date.getMonth() + 1, 0 );
}

/**
 * 月を delta だけ動かした新しい Date を返す（日は1日に揃える）。
 *
 * @param {Date}   date  基準日
 * @param {number} delta 正負の整数.
 * @return {Date} 月をシフトした新しい Date (1日)
 */
export function addMonths( date, delta ) {
	return new Date( date.getFullYear(), date.getMonth() + delta, 1 );
}

/**
 * 日を delta だけ動かした新しい Date を返す。
 *
 * @param {Date}   date  基準日
 * @param {number} delta 正負の整数.
 * @return {Date} 日をシフトした新しい Date
 */
export function addDays( date, delta ) {
	const d = new Date( date.getFullYear(), date.getMonth(), date.getDate() );
	d.setDate( d.getDate() + delta );
	return d;
}

/**
 * 2つの日付が同じ日（年月日）かを判定する。
 *
 * @param {Date|null} a 比較対象 1
 * @param {Date|null} b 比較対象 2
 * @return {boolean} 同じ年月日なら true
 */
export function isSameDay( a, b ) {
	if ( ! a || ! b ) {
		return false;
	}
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
 * @return {{date: Date, ymd: string, isCurrentMonth: boolean}[]} 6 週 42 セル分のメタデータ
 */
export function buildMonthGrid( month ) {
	const first = startOfMonth( month );
	const startOffset = first.getDay(); // 0=Sun..6=Sat
	const gridStart = addDays( first, -startOffset );
	const cells = [];
	for ( let i = 0; i < 42; i += 1 ) {
		const d = addDays( gridStart, i );
		cells.push( {
			date: d,
			ymd: toYmd( d ),
			isCurrentMonth: d.getMonth() === month.getMonth(),
		} );
	}
	return cells;
}

/**
 * 曜日ラベル（日〜土）。
 */
export const WEEKDAY_LABELS = [ '日', '月', '火', '水', '木', '金', '土' ];

/**
 * 月ラベル（例: "2026年4月"）。
 *
 * @param {Date} date 対象日
 * @return {string} 年月ラベル
 */
export function formatYearMonth( date ) {
	return `${ date.getFullYear() }年${ date.getMonth() + 1 }月`;
}

/**
 * 日付ラベル（例: "4月27日(月)"）。
 *
 * @param {Date} date 対象日
 * @return {string} 月日と曜日を含むラベル
 */
export function formatMonthDay( date ) {
	const wd = WEEKDAY_LABELS[ date.getDay() ];
	return `${ date.getMonth() + 1 }月${ date.getDate() }日(${ wd })`;
}

/**
 * 日付ラベル（例: "2026年4月27日(月)"）。
 *
 * @param {Date} date 対象日
 * @return {string} 年月日と曜日を含むラベル
 */
export function formatFullDate( date ) {
	const wd = WEEKDAY_LABELS[ date.getDay() ];
	return `${ date.getFullYear() }年${
		date.getMonth() + 1
	}月${ date.getDate() }日(${ wd })`;
}

/**
 * 'HH:MM' / 'HH:MM:SS' を正規化して 'HH:MM' を返す（失敗時は空文字）。
 *
 * @param {string} t 時刻文字列
 * @return {string} 'HH:MM' 形式の時刻 / 失敗時は空文字
 */
export function normalizeTime( t ) {
	if ( typeof t !== 'string' ) {
		return '';
	}
	const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec( t );
	if ( ! m ) {
		return '';
	}
	const h = Math.max( 0, Math.min( 23, Number( m[ 1 ] ) ) );
	const mm = Math.max( 0, Math.min( 59, Number( m[ 2 ] ) ) );
	return `${ String( h ).padStart( 2, '0' ) }:${ String( mm ).padStart(
		2,
		'0'
	) }`;
}

/**
 * 'HH:MM' を分換算する（失敗時は null）。
 *
 * @param {string} t 時刻文字列
 * @return {number|null} 0:00 からの分数 / 失敗時は null
 */
export function timeToMinutes( t ) {
	const n = normalizeTime( t );
	if ( ! n ) {
		return null;
	}
	const [ h, m ] = n.split( ':' ).map( Number );
	return h * 60 + m;
}

/**
 * 分数を 'HH:MM' にフォーマット（24h 範囲内でクランプ）。
 *
 * @param {number} mins 分数
 * @return {string} 'HH:MM' 形式の時刻
 */
export function minutesToTime( mins ) {
	const m = Math.max( 0, Math.min( 23 * 60 + 59, Math.round( mins ) ) );
	const h = Math.floor( m / 60 );
	const mm = m % 60;
	return `${ String( h ).padStart( 2, '0' ) }:${ String( mm ).padStart(
		2,
		'0'
	) }`;
}
