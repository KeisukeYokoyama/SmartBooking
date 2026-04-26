/**
 * スケジュール編集モーダル。
 *
 * 編集対象は「同じ日付・店舗・担当者」に属する複数時間枠（＝ schedules 行のグループ）。
 * 差分同期で保存する:
 *   - 既存行（id あり） → 値が変わっていれば PUT、削除されたら DELETE
 *   - 新規行（id なし）   → POST（items 形式でまとめて）
 *
 * 予約紐付き（booked_count > 0）の行は start_time・capacity 変更不可。
 * 日付・店舗・担当者は編集不可（変更したい場合は削除して追加し直す運用）。
 */
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Switch from '../../components/Switch';
import { Field } from '../../components/Input';
import { formatFullDate, fromYmd, minutesToTime, timeToMinutes } from './dateUtils';
import TimeSlotEditor from './TimeSlotEditor';

export default function ScheduleEditModal({
	open,
	onClose,
	onSubmit,
	submitting,
	group, // { date, store_id, staff_id, storeName, staffName, slots: [...] }
}) {
	const [slots, setSlots] = useState([]);
	const [slotDuration, setSlotDuration] = useState(60);
	const [groupActive, setGroupActive] = useState(true);
	const [errors, setErrors] = useState({});
	const initialRef = useRef({ slots: [], slotDuration: 60, groupActive: true });

	useEffect(() => {
		if (!open || !group) return;
		setErrors({});
		const initSlots = group.slots.map((s) => ({
			id: s.id,
			start_time: (s.start_time || '').slice(0, 5),
			end_time: (s.end_time || '').slice(0, 5),
			capacity: s.capacity,
			is_active: s.is_active,
			booked_count: s.booked_count,
			_originalCapacity: s.capacity,
			_originalStart: (s.start_time || '').slice(0, 5),
			_originalEnd: (s.end_time || '').slice(0, 5),
			_originalActive: s.is_active,
		}));
		setSlots(initSlots);
		// 既存データの単位を推定: 最初の行の end - start.
		let initDuration = 60;
		if (group.slots[0]) {
			const s = timeToMinutes(group.slots[0].start_time);
			const e = timeToMinutes(group.slots[0].end_time);
			if (s !== null && e !== null && e - s > 0) {
				initDuration = e - s;
			}
		}
		setSlotDuration(initDuration);
		// グループ全体の is_active（1件でも有効なら有効表示）.
		const initGroupActive = group.slots.some((s) => s.is_active);
		setGroupActive(initGroupActive);
		initialRef.current = {
			slots: initSlots,
			slotDuration: initDuration,
			groupActive: initGroupActive,
		};
	}, [open, group]);

	const computedIsDirty =
		JSON.stringify(slots) !== JSON.stringify(initialRef.current.slots) ||
		slotDuration !== initialRef.current.slotDuration ||
		groupActive !== initialRef.current.groupActive;
	const isDirty = !submitting && computedIsDirty;

	const validate = () => {
		const next = { slots: [] };
		if (!Array.isArray(slots) || slots.length === 0) {
			next.slotsGeneral = '時間枠を1件以上残してください。削除する場合はモーダル外の削除ボタンを使ってください。';
			setErrors(next);
			return false;
		}
		const normalized = slots.map((s, i) => ({
			...s,
			index: i,
			startMin: timeToMinutes(s.start_time),
		}));
		normalized.forEach((s, i) => {
			if (s.startMin === null) {
				next.slots[i] = '開始時間の形式が正しくありません。';
			} else if (Number(s.capacity) < 1) {
				next.slots[i] = '予約可能数は1以上で入力してください。';
			} else if (s.id && Number(s.capacity) < Number(s.booked_count)) {
				next.slots[i] = `既存予約（${s.booked_count}件）より少ない定員には変更できません。`;
			}
		});
		const sorted = [...normalized]
			.filter((s) => s.startMin !== null)
			.sort((a, b) => a.startMin - b.startMin);
		for (let i = 1; i < sorted.length; i += 1) {
			const prev = sorted[i - 1];
			const cur = sorted[i];
			if (cur.startMin < prev.startMin + slotDuration) {
				next.slots[cur.index] =
					`前の時間枠（${prev.start_time}）と重なっています。時間枠単位（${slotDuration}分）以上の間隔を空けてください。`;
			}
		}
		setErrors(next);
		const hasSlotErr = next.slots && next.slots.some(Boolean);
		return !next.slotsGeneral && !hasSlotErr;
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (!validate()) return;
		if (!group) return;

		// 既存の id 一覧
		const currentIds = new Set(
			slots.filter((s) => s.id != null).map((s) => s.id)
		);
		const deletions = group.slots.filter((orig) => !currentIds.has(orig.id));

		const updates = [];
		const creates = [];

		slots.forEach((s) => {
			const startMin = timeToMinutes(s.start_time);
			const endMin =
				startMin !== null ? Math.min(24 * 60 - 1, startMin + slotDuration) : null;
			const start = s.start_time;
			const end = endMin !== null ? minutesToTime(endMin) : s.end_time;

			if (s.id == null) {
				creates.push({
					store_id: group.store_id,
					staff_id: group.staff_id,
					schedule_date: group.date,
					start_time: start,
					end_time: end,
					capacity: Number(s.capacity),
					is_active: groupActive ? 1 : 0,
				});
			} else {
				const changed =
					s._originalStart !== start ||
					s._originalEnd !== end ||
					Number(s._originalCapacity) !== Number(s.capacity) ||
					Number(s._originalActive) !== (groupActive ? 1 : 0);
				if (changed) {
					updates.push({
						id: s.id,
						payload: {
							start_time: start,
							end_time: end,
							capacity: Number(s.capacity),
							is_active: groupActive ? 1 : 0,
						},
					});
				}
			}
		});

		onSubmit({ deletions, updates, creates });
	};

	if (!group) return null;

	const dateLabel = (() => {
		const d = fromYmd(group.date);
		return d ? formatFullDate(d) : group.date;
	})();

	return (
		<Modal
			open={open}
			onClose={onClose}
			isDirty={isDirty}
			title="スケジュールを編集"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						保存
					</Button>
				</>
			}
		>
			<form className="smb-form smb-schedule-form" onSubmit={handleSubmit} noValidate>
				<div className="smb-schedule-form__context">
					<div>
						<span className="smb-schedule-form__label">日付</span>
						<span className="smb-schedule-form__value">{dateLabel}</span>
					</div>
					<div>
						<span className="smb-schedule-form__label">店舗</span>
						<span className="smb-schedule-form__value">{group.storeName}</span>
					</div>
					<div>
						<span className="smb-schedule-form__label">担当者</span>
						<span className="smb-schedule-form__value">{group.staffName}</span>
					</div>
				</div>

				<Field label="利用可能">
					<Switch
						checked={!!groupActive}
						onChange={(v) => setGroupActive(v)}
						label={
							groupActive
								? '予約を受け付ける（通常）'
								: '一時的に停止（臨時休業など）'
						}
					/>
				</Field>

				<TimeSlotEditor
					slots={slots}
					slotDuration={slotDuration}
					onSlotsChange={setSlots}
					onDurationChange={setSlotDuration}
					errors={{ slots: errors.slots, slotsGeneral: errors.slotsGeneral }}
				/>

				<button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>
					送信
				</button>
			</form>
		</Modal>
	);
}
