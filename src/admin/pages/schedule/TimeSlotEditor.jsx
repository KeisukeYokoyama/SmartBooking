/**
 * 時間枠リストエディタ。
 *
 * スケジュール追加 / 編集モーダルで共通利用する。
 * 1行 = (開始時間, 予約可能数, 利用可能, 削除) のセット。
 *
 * 仕様（smart-booking-spec.md 4.2 スケジュール追加）:
 *   - 時間枠単位: 30分 / 60分 / 90分 / 120分（デフォルト60分）
 *   - 追加時、次行の開始時間は前行 + 単位 で自動提案
 *   - 時間の重複は呼び出し側でバリデーション
 *
 * 予約紐付き（booked_count > 0）の行はロック表示にする。
 */
import { minutesToTime, timeToMinutes } from './dateUtils';

const DURATION_OPTIONS = [
	{ value: 30, label: '30分' },
	{ value: 60, label: '60分' },
	{ value: 90, label: '90分' },
	{ value: 120, label: '120分' },
];

export default function TimeSlotEditor({
	slots,
	slotDuration,
	onSlotsChange,
	onDurationChange,
	errors = {},
}) {
	const handleAdd = () => {
		// 末尾行の開始時間 + 単位 を提案。最初の1件は 10:00。
		let nextStart = '10:00';
		if (slots.length > 0) {
			const lastStart = timeToMinutes(slots[slots.length - 1].start_time);
			if (lastStart !== null) {
				nextStart = minutesToTime(lastStart + slotDuration);
			}
		}
		onSlotsChange([
			...slots,
			{ id: null, start_time: nextStart, capacity: 1, is_active: 1, booked_count: 0 },
		]);
	};

	const handleChange = (index, patch) => {
		onSlotsChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
	};

	const handleRemove = (index) => {
		onSlotsChange(slots.filter((_, i) => i !== index));
	};

	return (
		<div className="smb-slot-editor">
			<div className="smb-field">
				<label className="smb-field__label" htmlFor="smb-slot-duration">
					<span>時間枠単位</span>
				</label>
				<select
					id="smb-slot-duration"
					className="smb-select smb-slot-editor__duration"
					value={slotDuration}
					onChange={(e) => onDurationChange(Number(e.target.value))}
				>
					{DURATION_OPTIONS.map((o) => (
						<option key={o.value} value={o.value}>
							{o.label}
						</option>
					))}
				</select>
				<p className="smb-field__help">
					「時間枠を追加」を押したときに、この単位で次の開始時間を提案します。
				</p>
			</div>

			<div className="smb-field">
				<div className="smb-field__label">
					<span>時間枠</span>
					<span className="smb-field__required" aria-label="必須">
						*
					</span>
				</div>

				{slots.length === 0 && (
					<p className="smb-slot-editor__empty">
						「時間枠を追加」ボタンを押して、受付する時間帯を1つ以上登録してください。
					</p>
				)}

				{slots.length > 0 && (
					<ul className="smb-slot-editor__list" role="list">
						{slots.map((slot, i) => {
							const locked = Number(slot.booked_count) > 0;
							const err = errors.slots && errors.slots[i];
							return (
								<li
									key={slot.id != null ? `id-${slot.id}` : `row-${i}`}
									className={`smb-slot-editor__row ${err ? 'has-error' : ''} ${locked ? 'is-locked' : ''}`}
								>
									<div className="smb-slot-editor__row-fields">
										<label className="smb-slot-editor__cell">
											<span className="smb-slot-editor__cell-label">開始時間</span>
											<input
												type="time"
												className="smb-input"
												value={slot.start_time || ''}
												step="300"
												onChange={(e) =>
													handleChange(i, { start_time: e.target.value })
												}
												disabled={locked}
												aria-label={`${i + 1}つ目の時間枠・開始時間`}
											/>
										</label>
										<label className="smb-slot-editor__cell">
											<span className="smb-slot-editor__cell-label">予約可能数</span>
											<input
												type="number"
												min="1"
												className="smb-input"
												value={slot.capacity}
												onChange={(e) =>
													handleChange(i, {
														capacity: Math.max(1, Number(e.target.value) || 1),
													})
												}
												aria-label={`${i + 1}つ目の時間枠・予約可能数`}
											/>
										</label>
										<div className="smb-slot-editor__cell smb-slot-editor__cell--actions">
											<button
												type="button"
												className="smb-link-btn smb-link-btn--danger"
												onClick={() => handleRemove(i)}
												disabled={locked}
												aria-label={`${i + 1}つ目の時間枠を削除`}
											>
												削除
											</button>
										</div>
									</div>
									{locked && (
										<p className="smb-slot-editor__lock-note">
											この時間枠には予約（{slot.booked_count}件）があるため、時間と削除は変更できません。
										</p>
									)}
									{err && <p className="smb-field__error">{err}</p>}
								</li>
							);
						})}
					</ul>
				)}

				<button type="button" className="smb-btn smb-btn--secondary smb-btn--sm" onClick={handleAdd}>
					＋ 時間枠を追加
				</button>

				{errors.slotsGeneral && <p className="smb-field__error">{errors.slotsGeneral}</p>}
			</div>
		</div>
	);
}
