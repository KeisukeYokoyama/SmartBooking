/**
 * 時間枠選択ステップ。
 *
 * 仕様 spec-amendment-frontend-redesign.md「変更3: UIコンポーネント仕様」（時間スロット）:
 *   - 縦並びリスト / 各スロットは幅 100% / padding 15px 20px / 中央寄せ。
 *   - 枠 1px solid var(--smb-front-border-default) / 角丸 8px / 16px 500。
 *   - ホバー: 枠 var(--smb-front-color-focus) / 背景 var(--smb-front-bg-light)。
 *   - 選択: 枠＆背景 var(--smb-front-color-time-selected) (#374151) / 文字 #fff。
 *   - 無効（締切 / 満席）: 背景 var(--smb-front-bg-light) / 文字 var(--smb-front-text-muted) / 接頭に「×」赤文字。
 *
 * 状態 → ラベルマッピング（仕様 3.4 空き状況）:
 *   - available : 通常色、選択可
 *   - few_left  : 通常色のまま選択可、ラベルだけ「残りわずか」
 *   - full      : 無効 + 「×」プレフィックス
 *   - closed    : 無効 + 「×」プレフィックス
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

export default function TimeSelect({ state, dispatch, embedded = true }) {
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

	const sectionHeader = embedded ? (
		<div className="smb-front-time-slots__header">
			<h3 className="smb-front-section-title">
				時間帯選択
				<span className="smb-front-required-badge" aria-hidden="true">必須</span>
			</h3>
			<span className="smb-front-time-slots__date" aria-live="polite">{headerText}</span>
		</div>
	) : (
		<div className="smb-front-time-slots__header">
			<span className="smb-front-time-slots__date" aria-live="polite">{headerText}</span>
			<span className="smb-front-time-slots__subtitle">ご希望の時間を選んでください</span>
		</div>
	);

	return (
		<div
			className="smb-front-time-slots"
			role="region"
			aria-label="選択した日の時間枠"
		>
			{sectionHeader}

			{daySchedules.length === 0 ? (
				<p className="smb-front-empty smb-front-time-slots__empty" role="status">
					この日に予約可能な時間枠はありません。
				</p>
			) : (
				<ul className="smb-front-time-list" role="list">
					{daySchedules.map((s) => {
						const label = AVAILABILITY_LABELS[s.availability] || '';
						const isSelected = selectedTime === s.start_time && state.scheduleId === s.id;
						const disabled = s.availability === 'full' || s.availability === 'closed';
						// 「14時00分から15時00分 残りわずか」のように読み上げられるラベル。
						const timeRangeJa = s.end_time
							? `${s.start_time}から${s.end_time}`
							: s.start_time;
						const ariaLabel = [
							timeRangeJa,
							label,
							disabled ? '選択不可' : '',
							isSelected ? '選択中' : '',
						]
							.filter(Boolean)
							.join(' ');
						return (
							<li key={s.id}>
								<button
									type="button"
									className={[
										'smb-front-time-slot',
										'smb-front-time-btn',
										`is-${s.availability}`,
										isSelected ? 'is-selected' : '',
										disabled ? 'is-disabled' : '',
									]
										.filter(Boolean)
										.join(' ')}
									onClick={() => handleClick(s)}
									disabled={disabled}
									aria-disabled={disabled}
									aria-pressed={isSelected}
									aria-label={ariaLabel}
								>
									{disabled && (
										<span
											className="smb-front-time-slot__prefix smb-front-time-btn__prefix"
											aria-hidden="true"
										>
											×
										</span>
									)}
									<span className="smb-front-time-btn__time" aria-hidden="true">
										{s.start_time}
										{s.end_time ? (
											<>
												<span>〜</span>
												{s.end_time}
											</>
										) : null}
									</span>
									{label && (
										<span
											className={`smb-front-time-btn__badge is-${s.availability}`}
											aria-hidden="true"
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
