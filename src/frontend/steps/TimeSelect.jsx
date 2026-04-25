/**
 * 時間枠選択ステップ。
 *
 * 仕様 3.4「空き状況の表示」:
 *   - available : 通常色、選択可
 *   - few_left  : 警告色（黄色など）+「残りわずか」ラベル、選択可
 *   - full      : グレーアウト + 「満席」ラベル、選択不可
 *   - closed    : グレーアウト + 「締切」ラベル、選択不可
 *
 * state.date に対応する schedule のみ表示。
 * ボタン押下で SET_TIME を dispatch。reducer が次ステップへ自動遷移する。
 */
import { useMemo } from 'react';
import { fromYmd, formatMonthDay } from '../dateUtils';

const AVAILABILITY_LABELS = {
	available: '',
	few_left: '残りわずか',
	full: '満席',
	closed: '締切',
};

export default function TimeSelect({ state, dispatch }) {
	const { date: selectedYmd, schedules, time: selectedTime } = state;

	const daySchedules = useMemo(() => {
		if (!selectedYmd) return [];
		return schedules
			.filter((s) => s.schedule_date === selectedYmd)
			.sort((a, b) => (a.start_time < b.start_time ? -1 : 1));
	}, [schedules, selectedYmd]);

	if (!selectedYmd) return null;

	const dateObj = fromYmd(selectedYmd);
	const headerText = dateObj ? formatMonthDay(dateObj) : selectedYmd;

	const handleClick = (schedule) => {
		if (schedule.availability === 'full' || schedule.availability === 'closed') {
			return;
		}
		dispatch({
			type: 'SET_TIME',
			payload: {
				time: schedule.start_time,
				scheduleId: schedule.id,
			},
		});
	};

	return (
		<div className="smb-front-time-slots">
			<div className="smb-front-time-slots__header">
				<span className="smb-front-time-slots__date">{headerText}</span>
				<span className="smb-front-time-slots__subtitle">ご希望の時間を選んでください</span>
			</div>

			{daySchedules.length === 0 ? (
				<p className="smb-front-empty smb-front-time-slots__empty">
					この日に予約可能な時間枠はありません。
				</p>
			) : (
				<ul className="smb-front-time-list" role="list">
					{daySchedules.map((s) => {
						const label = AVAILABILITY_LABELS[s.availability] || '';
						const isSelected = selectedTime === s.start_time && state.scheduleId === s.id;
						const disabled = s.availability === 'full' || s.availability === 'closed';
						return (
							<li key={s.id}>
								<button
									type="button"
									className={[
										'smb-front-time-btn',
										`is-${s.availability}`,
										isSelected ? 'is-selected' : '',
									]
										.filter(Boolean)
										.join(' ')}
									onClick={() => handleClick(s)}
									disabled={disabled}
									aria-disabled={disabled}
									aria-pressed={isSelected}
								>
									<span className="smb-front-time-btn__time">
										{s.start_time}
										{s.end_time ? (
											<>
												<span aria-hidden="true"> 〜 </span>
												{s.end_time}
											</>
										) : null}
									</span>
									{label && (
										<span
											className={`smb-front-time-btn__badge is-${s.availability}`}
										>
											{label}
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
