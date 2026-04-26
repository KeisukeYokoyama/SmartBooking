/**
 * スケジュール追加・編集モーダル（統合）。
 *
 * 仕様（smart-booking-spec.md 4.2 スケジュール追加）+ 参考スクショ
 * (docs/reference-ui/admin-schedule-add-modal.png) を踏まえた実装。
 *
 * 「追加」と「編集」を1つの操作に統合する。
 *   - 日付 + 店舗 + 担当者 を選択した時点で、その組み合わせの既存スケジュールを
 *     検索し、ヒットすれば既存時間枠をフォームにプリセット（編集モード）。
 *   - 組み合わせを切り替えると、その組み合わせの状態を再ロードする。
 *
 * 入力:
 *   - 日付（必須）
 *   - 店舗（必須・1店舗のみなら自動選択）
 *   - 担当者（必須・1人のみなら自動選択）
 *   - 時間枠単位（30/60/90/120分）
 *   - 時間枠リスト（開始時間 + 予約可能数。最低1件）
 *   - 利用可能スイッチ
 *
 * 送信:
 *   親に { schedule_date, deletions, updates, creates } を渡す。
 *   親側で DELETE → PUT → POST を順に呼んで差分同期する。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import Switch from '../../components/Switch';
import { Field } from '../../components/Input';
import { minutesToTime, timeToMinutes, toYmd } from './dateUtils';
import TimeSlotEditor from './TimeSlotEditor';

function buildSlotsFromExisting(matching) {
	return matching.map((s) => ({
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
}

function defaultEmptySlots() {
	return [{ id: null, start_time: '10:00', capacity: 1, is_active: 1, booked_count: 0 }];
}

function findMatchingSchedules(schedulesByDate, date, storeId, staffId) {
	if (!date || !schedulesByDate) return [];
	const list = schedulesByDate.get(date) || [];
	const wantStoreId = storeId ? Number(storeId) : null;
	const wantStaffId = staffId ? Number(staffId) : null;
	return list
		.filter((s) => {
			if (wantStoreId !== null && Number(s.store_id) !== wantStoreId) return false;
			if (wantStaffId !== null && Number(s.staff_id) !== wantStaffId) return false;
			return true;
		})
		.sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
}

function inferSlotDuration(matching) {
	if (!matching || matching.length === 0) return 60;
	const first = matching[0];
	const sM = timeToMinutes(first.start_time);
	const eM = timeToMinutes(first.end_time);
	if (sM !== null && eM !== null && eM - sM > 0) return eM - sM;
	return 60;
}

const EMPTY_VALUES = {
	schedule_date: '',
	// store_id / staff_id は文字列で保持（Select の value は文字列）。
	// 空文字 '' = 未指定。サーバ側でシステムエンティティ（is_system=1）を自動補完する。
	store_id: '',
	staff_id: '',
	slotDuration: 60,
	is_active: 1,
	slots: defaultEmptySlots(),
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
	schedulesByDate,
}) {
	const [values, setValues] = useState(EMPTY_VALUES);
	const [errors, setErrors] = useState({});
	const initialRef = useRef(EMPTY_VALUES);
	// 現在フォームに読み込まれている (date|store|staff) コンボキー.
	// このキーが変化したときだけ既存データを再ロードする（無限ループ防止）.
	const loadedComboRef = useRef('');
	// 編集モード時の元レコード（API から取得したそのままの形）。
	// 保存時の差分計算（削除対象の特定）に使う。
	const originalSchedulesRef = useRef([]);

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

		const initialDate = defaultDate || toYmd(new Date());
		const matching = findMatchingSchedules(
			schedulesByDate,
			initialDate,
			pickedStoreId,
			pickedStaffId
		);

		let slots, slotDuration, isActive;
		if (matching.length > 0) {
			slots = buildSlotsFromExisting(matching);
			slotDuration = inferSlotDuration(matching);
			isActive = matching.some((s) => s.is_active) ? 1 : 0;
		} else {
			slots = defaultEmptySlots();
			slotDuration = 60;
			isActive = 1;
		}

		const init = {
			schedule_date: initialDate,
			store_id: pickedStoreId || '',
			staff_id: pickedStaffId || '',
			slotDuration,
			is_active: isActive,
			slots,
		};
		initialRef.current = init;
		originalSchedulesRef.current = matching;
		loadedComboRef.current = `${initialDate}|${pickedStoreId || ''}|${pickedStaffId || ''}`;
		setValues(init);
	}, [open, defaultDate, defaultStoreId, defaultStaffId, stores, staff, schedulesByDate]);

	// コンボ（日付・店舗・担当者）が変わったら、その組み合わせの既存スケジュールを再ロード.
	useEffect(() => {
		if (!open) return;
		const comboKey = `${values.schedule_date}|${values.store_id}|${values.staff_id}`;
		if (comboKey === loadedComboRef.current) return;
		if (!values.schedule_date) return;

		const matching = findMatchingSchedules(
			schedulesByDate,
			values.schedule_date,
			values.store_id,
			values.staff_id
		);

		let slots, slotDuration, isActive;
		if (matching.length > 0) {
			slots = buildSlotsFromExisting(matching);
			slotDuration = inferSlotDuration(matching);
			isActive = matching.some((s) => s.is_active) ? 1 : 0;
		} else {
			slots = defaultEmptySlots();
			slotDuration = 60;
			isActive = 1;
		}

		setValues((prev) => ({
			...prev,
			slots,
			slotDuration,
			is_active: isActive,
		}));
		initialRef.current = {
			schedule_date: values.schedule_date,
			store_id: values.store_id,
			staff_id: values.staff_id,
			slotDuration,
			is_active: isActive,
			slots,
		};
		originalSchedulesRef.current = matching;
		loadedComboRef.current = comboKey;
		setErrors({});
	}, [open, values.schedule_date, values.store_id, values.staff_id, schedulesByDate]);

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

	const computedIsDirty = JSON.stringify(values) !== JSON.stringify(initialRef.current);
	const isDirty = !submitting && computedIsDirty;

	// システムエンティティ方式: ユーザー作成の店舗・担当者が無い場合はドロップダウンを出さず、
	// store_id / staff_id を未指定のまま POST する（サーバ側で is_system=1 のエンティティを自動補完）。
	const showStoreSelect = stores.filter((s) => s.is_active).length > 0;
	const showStaffSelect = staffOptions.length > 0;

	const isEditMode = originalSchedulesRef.current.length > 0;

	const validate = () => {
		const next = { slots: [] };
		if (!values.schedule_date) next.schedule_date = '日付を選択してください。';
		if (showStoreSelect && !values.store_id) next.store_id = '店舗を選択してください。';
		if (showStaffSelect && !values.staff_id) next.staff_id = '担当者を選択してください。';

		if (!Array.isArray(values.slots) || values.slots.length === 0) {
			next.slotsGeneral = '時間枠を1件以上追加してください。';
		} else {
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

		// 差分同期: 元レコード(originalSchedulesRef) と現在のスロットを比較し、
		//   削除（元にあって現在に無い id）/ 更新（id あり & 値変更あり）/ 追加（id 無し）に分類.
		const original = originalSchedulesRef.current;
		const currentIds = new Set(
			values.slots.filter((s) => s.id != null).map((s) => s.id)
		);
		const deletions = original.filter((orig) => !currentIds.has(orig.id));

		const updates = [];
		const creates = [];

		values.slots.forEach((s) => {
			const startMin = timeToMinutes(s.start_time);
			const endMin =
				startMin !== null
					? Math.min(24 * 60 - 1, startMin + values.slotDuration)
					: null;
			const start = s.start_time;
			const end = endMin !== null ? minutesToTime(endMin) : s.end_time;

			if (s.id == null) {
				creates.push({
					store_id: values.store_id ? Number(values.store_id) : 0,
					staff_id: values.staff_id ? Number(values.staff_id) : 0,
					schedule_date: values.schedule_date,
					start_time: start,
					end_time: end,
					capacity: Number(s.capacity),
					is_active: values.is_active ? 1 : 0,
				});
			} else {
				const changed =
					s._originalStart !== start ||
					s._originalEnd !== end ||
					Number(s._originalCapacity) !== Number(s.capacity) ||
					Number(s._originalActive) !== (values.is_active ? 1 : 0);
				if (changed) {
					updates.push({
						id: s.id,
						payload: {
							start_time: start,
							end_time: end,
							capacity: Number(s.capacity),
							is_active: values.is_active ? 1 : 0,
						},
					});
				}
			}
		});

		onSubmit({
			schedule_date: values.schedule_date,
			deletions,
			updates,
			creates,
		});
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
			isDirty={isDirty}
			title={isEditMode ? 'スケジュールを設定' : 'スケジュールを追加'}
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
				{isEditMode && (
					<p className="smb-schedule-form__notice">
						この日付・店舗・担当者には既にスケジュールが登録されています。下記の時間枠は現在の登録内容です。追加・変更・削除して保存してください。
					</p>
				)}

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

				{(showStoreSelect || showStaffSelect) && (
					<div className="smb-field-group smb-field-group--contact">
						{showStoreSelect && (
							<Select
								label="店舗"
								required
								error={errors.store_id}
								value={values.store_id}
								onChange={(e) =>
									update({ store_id: e.target.value, staff_id: '' })
								}
								options={storeOptions}
							/>
						)}
						{showStaffSelect && (
							<Select
								label="担当者"
								required
								error={errors.staff_id}
								value={values.staff_id}
								onChange={(e) => update({ staff_id: e.target.value })}
								options={staffSelectOptions}
								help={
									showStoreSelect && !values.store_id
										? '先に店舗を選択してください。'
										: undefined
								}
							/>
						)}
					</div>
				)}

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
