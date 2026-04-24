/**
 * スケジュール追加モーダル。
 *
 * 仕様（smart-booking-spec.md 4.2 スケジュール追加）+ 参考スクショ
 * (docs/reference-ui/admin-schedule-add-modal.png) を踏まえた実装。
 *
 * 入力:
 *   - 日付（必須）
 *   - 店舗（必須・1店舗のみなら自動選択）
 *   - 担当者（必須・1人のみなら自動選択）
 *   - 時間枠単位（30/60/90/120分）
 *   - 時間枠リスト（開始時間 + 予約可能数。最低1件）
 *   - 利用可能スイッチ
 *
 * バリデーション:
 *   - 必須項目チェック
 *   - 時間枠が1件以上
 *   - 時間の重複チェック（単位幅で衝突しないか）
 *   - capacity >= 1
 *
 * 送信:
 *   同一の日付・店舗・担当者に対し複数時間枠を items: [] として一括 POST。
 */
import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import Switch from '../../components/Switch';
import { Field } from '../../components/Input';
import { minutesToTime, timeToMinutes, toYmd } from './dateUtils';
import TimeSlotEditor from './TimeSlotEditor';

const EMPTY_VALUES = {
	schedule_date: '',
	store_id: '',
	staff_id: '',
	slotDuration: 60,
	is_active: 1,
	slots: [{ id: null, start_time: '10:00', capacity: 1, is_active: 1, booked_count: 0 }],
};

export default function ScheduleAddModal({
	open,
	onClose,
	onSubmit,
	submitting,
	stores,
	staff,
	defaultDate,
	defaultStoreId,
	defaultStaffId,
}) {
	const [values, setValues] = useState(EMPTY_VALUES);
	const [errors, setErrors] = useState({});

	// モーダルを開くたびに初期化.
	useEffect(() => {
		if (!open) return;
		setErrors({});
		const activeStores = stores.filter((s) => s.is_active);
		const pickedStoreId =
			defaultStoreId && activeStores.some((s) => s.id === defaultStoreId)
				? defaultStoreId
				: activeStores.length === 1
					? activeStores[0].id
					: '';
		const staffForStore = staff.filter(
			(s) => s.is_active && (!pickedStoreId || s.store_id === pickedStoreId)
		);
		const pickedStaffId =
			defaultStaffId && staffForStore.some((s) => s.id === defaultStaffId)
				? defaultStaffId
				: staffForStore.length === 1
					? staffForStore[0].id
					: '';
		setValues({
			...EMPTY_VALUES,
			schedule_date: defaultDate || toYmd(new Date()),
			store_id: pickedStoreId || '',
			staff_id: pickedStaffId || '',
			slots: [{ id: null, start_time: '10:00', capacity: 1, is_active: 1, booked_count: 0 }],
		});
	}, [open, defaultDate, defaultStoreId, defaultStaffId, stores, staff]);

	// 店舗変更時に担当者を自動絞り込み.
	const staffOptions = useMemo(() => {
		const filtered = staff.filter(
			(s) => s.is_active && (!values.store_id || s.store_id === Number(values.store_id))
		);
		return filtered;
	}, [staff, values.store_id]);

	useEffect(() => {
		if (!open) return;
		if (
			values.staff_id &&
			!staffOptions.some((s) => s.id === Number(values.staff_id))
		) {
			setValues((prev) => ({
				...prev,
				staff_id: staffOptions.length === 1 ? staffOptions[0].id : '',
			}));
		}
	}, [staffOptions, open, values.staff_id]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const validate = () => {
		const next = { slots: [] };
		if (!values.schedule_date) next.schedule_date = '日付を選択してください。';
		if (!values.store_id) next.store_id = '店舗を選択してください。';
		if (!values.staff_id) next.staff_id = '担当者を選択してください。';

		if (!Array.isArray(values.slots) || values.slots.length === 0) {
			next.slotsGeneral = '時間枠を1件以上追加してください。';
		} else {
			// 重複チェック（単位時間幅で衝突するか）.
			const normalized = values.slots.map((s, i) => ({
				...s,
				index: i,
				startMin: timeToMinutes(s.start_time),
			}));
			normalized.forEach((s, i) => {
				if (s.startMin === null) {
					next.slots[i] = '開始時間の形式が正しくありません。';
				} else if (Number(s.capacity) < 1) {
					next.slots[i] = '予約可能数は1以上で入力してください。';
				}
			});
			const sorted = [...normalized]
				.filter((s) => s.startMin !== null)
				.sort((a, b) => a.startMin - b.startMin);
			for (let i = 1; i < sorted.length; i += 1) {
				const prev = sorted[i - 1];
				const cur = sorted[i];
				if (cur.startMin < prev.startMin + values.slotDuration) {
					next.slots[cur.index] =
						`前の時間枠（${prev.start_time}）と重なっています。時間枠単位（${values.slotDuration}分）以上の間隔を空けてください。`;
				}
			}
		}

		setErrors(next);
		const hasSlotErr = next.slots && next.slots.some(Boolean);
		return (
			!next.schedule_date &&
			!next.store_id &&
			!next.staff_id &&
			!next.slotsGeneral &&
			!hasSlotErr
		);
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (!validate()) return;
		// items 配列として送信.
		const items = values.slots.map((s) => {
			const startMin = timeToMinutes(s.start_time);
			const endMin = Math.min(24 * 60 - 1, (startMin ?? 0) + values.slotDuration);
			return {
				store_id: Number(values.store_id),
				staff_id: Number(values.staff_id),
				schedule_date: values.schedule_date,
				start_time: s.start_time,
				end_time: minutesToTime(endMin),
				capacity: Number(s.capacity),
				is_active: values.is_active ? 1 : 0,
			};
		});
		onSubmit(items);
	};

	const storeOptions = [
		{ value: '', label: '店舗を選択' },
		...stores
			.filter((s) => s.is_active)
			.map((s) => ({ value: String(s.id), label: s.name })),
	];
	const staffSelectOptions = [
		{ value: '', label: '担当者を選択' },
		...staffOptions.map((s) => ({ value: String(s.id), label: s.name })),
	];

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="スケジュールを追加"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						追加する
					</Button>
				</>
			}
		>
			<form className="smb-form smb-schedule-form" onSubmit={handleSubmit} noValidate>
				<Field
					label="日付"
					required
					error={errors.schedule_date}
					htmlFor="smb-schedule-date"
				>
					<input
						id="smb-schedule-date"
						type="date"
						className="smb-input"
						value={values.schedule_date}
						onChange={(e) => update({ schedule_date: e.target.value })}
					/>
				</Field>

				<div className="smb-field-group smb-field-group--contact">
					<Select
						label="店舗"
						required
						error={errors.store_id}
						value={values.store_id}
						onChange={(e) => update({ store_id: e.target.value, staff_id: '' })}
						options={storeOptions}
					/>
					<Select
						label="担当者"
						required
						error={errors.staff_id}
						value={values.staff_id}
						onChange={(e) => update({ staff_id: e.target.value })}
						options={staffSelectOptions}
						help={!values.store_id ? '先に店舗を選択してください。' : undefined}
					/>
				</div>

				<TimeSlotEditor
					slots={values.slots}
					slotDuration={values.slotDuration}
					onSlotsChange={(slots) => update({ slots })}
					onDurationChange={(slotDuration) => update({ slotDuration })}
					errors={{ slots: errors.slots, slotsGeneral: errors.slotsGeneral }}
				/>

				<div className="smb-field">
					<div className="smb-field__label">
						<span>利用可能</span>
					</div>
					<Switch
						checked={!!values.is_active}
						onChange={(v) => update({ is_active: v ? 1 : 0 })}
						label={
							values.is_active
								? '予約を受け付ける（通常）'
								: '一時的に停止（臨時休業など）'
						}
					/>
				</div>

				<button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>
					送信
				</button>
			</form>
		</Modal>
	);
}
