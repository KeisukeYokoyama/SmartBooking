/**
 * 月カレンダーグリッド。
 *
 * - 日〜土、7列 × 6行
 * - 前月末・翌月初の日付は淡色表示（is_other_month）
 * - 今日の日付は is_today として視覚強調
 * - 選択中の日付は is_selected
 * - 各セルに、その日のスケジュールから推定した店舗カラーバッジを表示
 * - バッジ下に件数（時間枠数）・予約状況サマリを小さく表示
 *
 * props:
 *   month: Date（月内の任意日）
 *   selectedYmd: string | null
 *   onSelect: (ymd) => void
 *   schedulesByDate: Map<ymd, schedule[]>
 *   storesById: Map<id, store>
 */
import { buildMonthGrid, isSameDay, toYmd, WEEKDAY_LABELS } from './dateUtils';

function classifyDay(schedules) {
	if (!schedules || schedules.length === 0) return { label: null, tone: null };
	let totalCap = 0;
	let totalBooked = 0;
	let anyActive = false;
	schedules.forEach((s) => {
		totalCap += Number(s.capacity) || 0;
		totalBooked += Number(s.booked_count) || 0;
		if (s.is_active) anyActive = true;
	});
	if (!anyActive) return { label: '停止中', tone: 'inactive' };
	if (totalCap === 0) return { label: null, tone: null };
	if (totalBooked >= totalCap) return { label: '満席', tone: 'full' };
	if (totalBooked >= Math.floor(totalCap * 0.8))
		return { label: '残りわずか', tone: 'warn' };
	return { label: null, tone: 'ok' };
}

export default function CalendarGrid({
	month,
	selectedYmd,
	onSelect,
	schedulesByDate,
	storesById,
}) {
	const cells = buildMonthGrid(month);
	const today = new Date();

	return (
		<div className="smb-calendar">
			<div className="smb-calendar__weekdays" role="row">
				{WEEKDAY_LABELS.map((wd, i) => (
					<div
						key={wd}
						role="columnheader"
						className={`smb-calendar__weekday ${i === 0 ? 'is-sun' : ''} ${i === 6 ? 'is-sat' : ''}`}
					>
						{wd}
					</div>
				))}
			</div>
			<div className="smb-calendar__grid" role="grid">
				{cells.map((cell) => {
					const daySchedules = schedulesByDate.get(cell.ymd) || [];
					// 店舗ごとにグループ化してカラードットを表示.
					const storesOnDay = [];
					const seenStores = new Set();
					daySchedules.forEach((s) => {
						if (!seenStores.has(s.store_id)) {
							seenStores.add(s.store_id);
							const store = storesById.get(s.store_id);
							storesOnDay.push({
								id: s.store_id,
								name: store?.name || '',
								color: store?.calendar_color || '#2271b1',
							});
						}
					});
					const { label, tone } = classifyDay(daySchedules);
					const isToday = isSameDay(cell.date, today);
					const isSelected = selectedYmd === cell.ymd;
					const dow = cell.date.getDay();

					return (
						<button
							type="button"
							key={cell.ymd}
							className={[
								'smb-calendar__cell',
								!cell.isCurrentMonth ? 'is-other-month' : '',
								isToday ? 'is-today' : '',
								isSelected ? 'is-selected' : '',
								dow === 0 ? 'is-sun' : '',
								dow === 6 ? 'is-sat' : '',
								daySchedules.length > 0 ? 'has-schedules' : '',
								tone ? `is-${tone}` : '',
							]
								.filter(Boolean)
								.join(' ')}
							onClick={() => onSelect(cell.ymd)}
							aria-label={`${cell.ymd} を選択`}
							aria-pressed={isSelected}
						>
							<span className="smb-calendar__day">{cell.date.getDate()}</span>
							{daySchedules.length > 0 && (
								<span className="smb-calendar__dots" aria-hidden="true">
									{storesOnDay.slice(0, 3).map((s) => (
										<span
											key={s.id}
											className="smb-calendar__dot"
											style={{ backgroundColor: s.color }}
											title={s.name}
										/>
									))}
									{storesOnDay.length > 3 && (
										<span className="smb-calendar__dot-more">
											+{storesOnDay.length - 3}
										</span>
									)}
								</span>
							)}
							{daySchedules.length > 0 && (
								<span className="smb-calendar__summary">
									<span>{daySchedules.length}枠</span>
									{label && <span className={`smb-calendar__tag is-${tone}`}>{label}</span>}
								</span>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/**
 * 日別スケジュールを Map<ymd, schedule[]> に変換するヘルパ。
 *
 * @param {object[]} schedules
 * @returns {Map<string, object[]>}
 */
export function groupSchedulesByDate(schedules) {
	const map = new Map();
	schedules.forEach((s) => {
		const ymd = s.schedule_date;
		if (!map.has(ymd)) map.set(ymd, []);
		map.get(ymd).push(s);
	});
	return map;
}

/**
 * selectedYmd でフィルタした一覧用のヘルパ。
 */
export { toYmd };
