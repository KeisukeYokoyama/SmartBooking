/**
 * 日付選択ステップ（カレンダーUI）。
 *
 * 仕様 3.4「カレンダーUI」:
 *   - `settings.calendar_mode` に応じて表示モード切替:
 *       'day_only'   : 横スクロール日表示のみ
 *       'month_only' : 月表示グリッドのみ
 *       'toggle'     : ユーザーが日/月を切替
 *   - 表示範囲は今日 〜 今日 + settings.display_period_days - 1 日後まで。
 *   - 日付を選択すると、カレンダーの下に TimeSelect が差し込まれる（呼び出し元が担当）。
 *   - 締切過ぎた日付・全枠満席の日付は disabled。
 *
 * 本コンポーネントは availability の取得も担当する（useEffect で取得）。
 */
import { useEffect, useMemo, useState } from 'react';
import { publicAPI } from '../api';
import StepHeader from '../components/StepHeader';
import Spinner from '../components/Spinner';
import ErrorMessage from '../components/ErrorMessage';
import {
	WEEKDAY_LABELS,
	addDays,
	addMonths,
	buildDayStrip,
	buildMonthGrid,
	formatYearMonth,
	isSameDay,
	today,
	toYmd,
} from '../dateUtils';

/**
 * 指定 ymd のスケジュール配列から、その日を選択可能にできるかを判定する。
 *
 * @param {object[]} daySchedules その日のスケジュール一覧.
 * @returns {{ disabled: boolean, label: string|null, tone: string|null }}
 */
function classifyDay(daySchedules) {
	if (!daySchedules || daySchedules.length === 0) {
		return { disabled: true, label: null, tone: null };
	}
	let hasOpen = false;
	let hasFew = false;
	let allFullOrClosed = true;
	daySchedules.forEach((s) => {
		if (s.availability === 'available') {
			hasOpen = true;
			allFullOrClosed = false;
		} else if (s.availability === 'few_left') {
			hasFew = true;
			allFullOrClosed = false;
		}
	});
	if (allFullOrClosed) {
		// 全部満席 or 締切 → disabled
		const allClosed = daySchedules.every((s) => s.availability === 'closed');
		return {
			disabled: true,
			label: allClosed ? '締切' : '満席',
			tone: allClosed ? 'closed' : 'full',
		};
	}
	if (!hasOpen && hasFew) {
		return { disabled: false, label: '残りわずか', tone: 'few' };
	}
	return { disabled: false, label: null, tone: 'available' };
}

export default function DateSelect({
	state,
	dispatch,
	children,
	onBack,
}) {
	const { storeId, staffId, settings, date: selectedYmd } = state;
	const displayDays = settings && settings.display_period_days > 0 ? settings.display_period_days : 7;
	const calendarMode = settings ? settings.calendar_mode : 'day_only';

	// 日/月 切替トグル（モードが 'toggle' のときのみ意味を持つ）。
	const [viewMode, setViewMode] = useState(
		calendarMode === 'month_only' ? 'month' : 'day'
	);

	// 表示範囲: today 〜 today + displayDays - 1.
	const startDate = useMemo(() => today(), []);
	const endDate = useMemo(
		() => addDays(startDate, displayDays - 1),
		[startDate, displayDays]
	);
	const dateFrom = toYmd(startDate);
	const dateTo = toYmd(endDate);

	// availability を取得。storeId/staffId/範囲 が変わった時に再取得。
	useEffect(() => {
		let cancelled = false;
		async function fetchAvailability() {
			dispatch({ type: 'AVAILABILITY_START' });
			try {
				const res = await publicAPI.availability({
					storeId: storeId || undefined,
					staffId: staffId || undefined,
					dateFrom,
					dateTo,
				});
				if (cancelled) return;
				dispatch({
					type: 'AVAILABILITY_SUCCESS',
					payload: {
						schedules: (res && res.schedules) || [],
						dateFrom: (res && res.date_from) || dateFrom,
						dateTo: (res && res.date_to) || dateTo,
						storeId,
						staffId,
					},
				});
			} catch (err) {
				if (cancelled) return;
				dispatch({
					type: 'AVAILABILITY_FAIL',
					payload: err.message || 'スケジュールの取得に失敗しました。',
				});
			}
		}
		fetchAvailability();
		return () => {
			cancelled = true;
		};
	}, [storeId, staffId, dateFrom, dateTo, dispatch]);

	// schedulesByDate: Map<ymd, schedule[]>
	const schedulesByDate = useMemo(() => {
		const map = new Map();
		(state.schedules || []).forEach((s) => {
			if (!map.has(s.schedule_date)) map.set(s.schedule_date, []);
			map.get(s.schedule_date).push(s);
		});
		return map;
	}, [state.schedules]);

	const handleSelect = (ymd) => {
		dispatch({ type: 'SET_DATE', payload: { date: ymd } });
	};

	const showDay = viewMode === 'day' || calendarMode === 'day_only';
	const showMonth = viewMode === 'month' || calendarMode === 'month_only';

	return (
		<div className="smb-front-step">
			<StepHeader
				title="日付を選択"
				subtitle="ご希望の日付を選んでください。"
				onBack={onBack}
			/>

			{calendarMode === 'toggle' && (
				<div
					className="smb-front-calendar-toggle"
					role="tablist"
					aria-label="カレンダー表示切替"
				>
					<button
						type="button"
						role="tab"
						aria-selected={viewMode === 'day'}
						className={`smb-front-calendar-toggle__btn ${viewMode === 'day' ? 'is-active' : ''}`}
						onClick={() => setViewMode('day')}
					>
						日
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={viewMode === 'month'}
						className={`smb-front-calendar-toggle__btn ${viewMode === 'month' ? 'is-active' : ''}`}
						onClick={() => setViewMode('month')}
					>
						月
					</button>
				</div>
			)}

			{state.availabilityLoading && (
				<div className="smb-front-calendar-loading">
					<Spinner size="md" label="スケジュール読み込み中…" />
				</div>
			)}

			{state.availabilityError && (
				<ErrorMessage message={state.availabilityError} />
			)}

			{!state.availabilityLoading && !state.availabilityError && (
				<>
					{showDay && (
						<DayStrip
							startDate={startDate}
							displayDays={displayDays}
							selectedYmd={selectedYmd}
							schedulesByDate={schedulesByDate}
							onSelect={handleSelect}
						/>
					)}

					{showMonth && (
						<MonthCalendar
							startDate={startDate}
							endDate={endDate}
							selectedYmd={selectedYmd}
							schedulesByDate={schedulesByDate}
							onSelect={handleSelect}
						/>
					)}
				</>
			)}

			{/* 日付が選択されたら、カレンダーの下に時間枠（TimeSelect 等）を表示する */}
			{selectedYmd && children}
		</div>
	);
}

/**
 * 日表示ストリップ（横スクロール）。
 */
function DayStrip({ startDate, displayDays, selectedYmd, schedulesByDate, onSelect }) {
	const days = useMemo(
		() => buildDayStrip(startDate, displayDays),
		[startDate, displayDays]
	);
	const todayDate = today();

	return (
		<div
			className="smb-front-day-strip"
			role="list"
			aria-label="予約可能な日付"
		>
			{days.map((d) => {
				const daySchedules = schedulesByDate.get(d.ymd) || [];
				const cls = classifyDay(daySchedules);
				const isSelected = selectedYmd === d.ymd;
				const isToday = isSameDay(d.date, todayDate);
				const dow = d.date.getDay();
				// スクリーンリーダー向けラベル: 「2026年5月1日 火曜日 残りわずか」等。
				const ariaLabel = [
					`${d.date.getFullYear()}年${d.date.getMonth() + 1}月${d.date.getDate()}日`,
					`${d.weekdayLabel}曜日`,
					isToday ? '本日' : '',
					cls.label || '',
					cls.disabled ? '選択不可' : '',
					isSelected ? '選択中' : '',
				]
					.filter(Boolean)
					.join(' ');
				return (
					<button
						key={d.ymd}
						type="button"
						role="listitem"
						className={[
							'smb-front-day-tile',
							isSelected ? 'is-selected' : '',
							isToday ? 'is-today' : '',
							cls.disabled ? 'is-disabled' : '',
							cls.tone ? `is-tone-${cls.tone}` : '',
							dow === 0 ? 'is-sun' : '',
							dow === 6 ? 'is-sat' : '',
						]
							.filter(Boolean)
							.join(' ')}
						onClick={() => {
							if (!cls.disabled) onSelect(d.ymd);
						}}
						disabled={cls.disabled}
						aria-disabled={cls.disabled}
						aria-pressed={isSelected}
						aria-label={ariaLabel}
					>
						<span className="smb-front-day-tile__weekday">{d.weekdayLabel}</span>
						<span className="smb-front-day-tile__day">{d.date.getDate()}</span>
						<span className="smb-front-day-tile__month">
							{d.date.getMonth() + 1}月
						</span>
						{cls.label && (
							<span
								className={`smb-front-day-tile__badge is-${cls.tone}`}
								aria-hidden="true"
							>
								{cls.label}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}

/**
 * 月カレンダーグリッド。
 * startDate/endDate の範囲外セルは disabled（隣月または範囲外）。
 */
function MonthCalendar({
	startDate,
	endDate,
	selectedYmd,
	schedulesByDate,
	onSelect,
}) {
	const [viewMonth, setViewMonth] = useState(
		new Date(startDate.getFullYear(), startDate.getMonth(), 1)
	);
	const cells = useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);
	const todayDate = today();

	const startYmd = toYmd(startDate);
	const endYmd = toYmd(endDate);

	// 月ナビの有効/無効判定。
	const prevMonth = addMonths(viewMonth, -1);
	const nextMonth = addMonths(viewMonth, 1);
	const canPrev =
		toYmd(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0)) >= startYmd;
	const canNext = toYmd(new Date(nextMonth.getFullYear(), nextMonth.getMonth(), 1)) <= endYmd;

	return (
		<div className="smb-front-month">
			<div className="smb-front-month__nav">
				<button
					type="button"
					className="smb-front-month__nav-btn"
					onClick={() => canPrev && setViewMonth(prevMonth)}
					disabled={!canPrev}
					aria-label="前の月"
				>
					←
				</button>
				<div className="smb-front-month__label">{formatYearMonth(viewMonth)}</div>
				<button
					type="button"
					className="smb-front-month__nav-btn"
					onClick={() => canNext && setViewMonth(nextMonth)}
					disabled={!canNext}
					aria-label="次の月"
				>
					→
				</button>
			</div>
			<div className="smb-front-month__weekdays" role="row">
				{WEEKDAY_LABELS.map((wd, i) => (
					<div
						key={wd}
						role="columnheader"
						className={[
							'smb-front-month__weekday',
							i === 0 ? 'is-sun' : '',
							i === 6 ? 'is-sat' : '',
						]
							.filter(Boolean)
							.join(' ')}
					>
						{wd}
					</div>
				))}
			</div>
			<div className="smb-front-month__grid" role="grid">
				{cells.map((cell) => {
					const inRange = cell.ymd >= startYmd && cell.ymd <= endYmd;
					const daySchedules = schedulesByDate.get(cell.ymd) || [];
					const cls = classifyDay(daySchedules);
					const disabled = !cell.isCurrentMonth || !inRange || cls.disabled;
					const isSelected = selectedYmd === cell.ymd;
					const isToday = isSameDay(cell.date, todayDate);
					const dow = cell.weekdayIndex;
					const cellAriaLabel = [
						`${cell.date.getFullYear()}年${cell.date.getMonth() + 1}月${cell.date.getDate()}日`,
						`${WEEKDAY_LABELS[dow]}曜日`,
						isToday ? '本日' : '',
						!cell.isCurrentMonth ? '月外' : '',
						cell.isCurrentMonth && !inRange ? '範囲外' : '',
						cls.label || '',
						disabled ? '選択不可' : '',
						isSelected ? '選択中' : '',
					]
						.filter(Boolean)
						.join(' ');
					return (
						<button
							key={cell.ymd}
							type="button"
							className={[
								'smb-front-month__cell',
								!cell.isCurrentMonth ? 'is-other-month' : '',
								!inRange && cell.isCurrentMonth ? 'is-out-of-range' : '',
								isSelected ? 'is-selected' : '',
								isToday ? 'is-today' : '',
								cls.disabled && inRange && cell.isCurrentMonth ? 'is-disabled' : '',
								cls.tone && inRange ? `is-tone-${cls.tone}` : '',
								dow === 0 ? 'is-sun' : '',
								dow === 6 ? 'is-sat' : '',
							]
								.filter(Boolean)
								.join(' ')}
							onClick={() => {
								if (disabled) return;
								onSelect(cell.ymd);
							}}
							disabled={disabled}
							aria-disabled={disabled}
							aria-pressed={isSelected}
							aria-label={cellAriaLabel}
						>
							<span className="smb-front-month__cell-day" aria-hidden="true">
								{cell.date.getDate()}
							</span>
							{cls.label && cell.isCurrentMonth && inRange && (
								<span
									className={`smb-front-month__cell-badge is-${cls.tone}`}
									aria-hidden="true"
								>
									{cls.label}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
