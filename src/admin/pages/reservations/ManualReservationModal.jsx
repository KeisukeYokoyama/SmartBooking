/**
 * 手動予約作成モーダル（2ステップ）。
 *
 * ステップ1: 予約枠を選択
 *   店舗 → 担当者 → 日付 → 時間枠ボタン群（満席はグレーアウト）
 *
 * ステップ2: 予約者情報入力
 *   氏名・メール・電話 + カスタムフィールド + 管理者メモ + ステータス
 *
 * 送信:
 *   POST /reservations { store_id, staff_id, schedule_id, customer_name, ... , meta }
 *   アトミック UPDATE が 0 行影響 → 「満席」エラーをステップ1に戻って表示。
 */
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../api';
import Button from '../../components/Button';
import ErrorMessage from '../../components/ErrorMessage';
import Input from '../../components/Input';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import Spinner from '../../components/Spinner';
import Textarea from '../../components/Textarea';
import { fromYmd, toYmd } from '../schedule/dateUtils';
import CustomFieldRenderer from './CustomFieldRenderer';
import { STATUS_OPTIONS } from './StatusBadge';

const EMPTY_FORM = {
	customer_name: '',
	customer_email: '',
	customer_phone: '',
	status: 'approved',
	admin_memo: '',
};

function formatLocalDate(ymd) {
	const d = fromYmd(ymd);
	if (!d) return '';
	const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
	return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${wd})`;
}

export default function ManualReservationModal({
	open,
	onClose,
	onCreated,
	stores = [],
	staff = [],
	customFields = [],
}) {
	const [step, setStep] = useState(1);
	const [storeId, setStoreId] = useState('');
	const [staffId, setStaffId] = useState('');
	const [date, setDate] = useState(() => toYmd(new Date()));
	const [scheduleId, setScheduleId] = useState(null);

	const [schedules, setSchedules] = useState([]);
	const [scheduleLoading, setScheduleLoading] = useState(false);
	const [scheduleError, setScheduleError] = useState(null);

	const [form, setForm] = useState(EMPTY_FORM);
	const [meta, setMeta] = useState({});
	const [fieldErrors, setFieldErrors] = useState({});
	const [submitting, setSubmitting] = useState(false);
	const [submitError, setSubmitError] = useState(null);

	// システムエンティティ方式: ユーザー店舗・担当者が無い場合はドロップダウンを出さず、
	// 日付だけで該当日のスケジュール（システム店舗のもの含む）を取得する。
	const hasUserStores = stores.length > 0;
	const hasUserStaff = staff.length > 0;

	// 開閉時に状態をリセット.
	useEffect(() => {
		if (open) {
			setStep(1);
			// ユーザー店舗が無い場合は store_id を空のままにする。
			setStoreId(stores[0] ? String(stores[0].id) : '');
			setStaffId('');
			setDate(toYmd(new Date()));
			setScheduleId(null);
			setSchedules([]);
			setScheduleError(null);
			setForm(EMPTY_FORM);
			setMeta({});
			setFieldErrors({});
			setSubmitError(null);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// 候補の担当者（選択店舗に所属 & 有効）.
	const staffOptions = useMemo(() => {
		const list = staff.filter(
			(s) => (!storeId || String(s.store_id) === String(storeId)) && s.is_active
		);
		return [
			{ value: '', label: 'すべての担当者' },
			...list.map((s) => ({ value: String(s.id), label: s.name })),
		];
	}, [staff, storeId]);

	const storeOptions = useMemo(
		() => [
			{ value: '', label: '選択してください' },
			...stores.filter((s) => s.is_active).map((s) => ({ value: String(s.id), label: s.name })),
		],
		[stores]
	);

	// スケジュールを取得（日付指定時。店舗・担当者は任意）.
	// ユーザー店舗が無い場合は store_id を送らず、その日全体のスケジュールを取得する
	// （システム店舗のスケジュールも含めて返る）。
	useEffect(() => {
		if (!open || step !== 1 || !date) return;
		// ユーザー店舗が存在するのに未選択の場合だけスケジュール取得を待つ。
		if (hasUserStores && !storeId) return;
		let cancelled = false;
		setScheduleLoading(true);
		setScheduleError(null);
		setScheduleId(null);
		const params = {
			date_from: date,
			date_to: date,
		};
		if (storeId) params.store_id = storeId;
		if (staffId) params.staff_id = staffId;
		API.schedules
			.list(params)
			.then((rows) => {
				if (cancelled) return;
				setSchedules(Array.isArray(rows) ? rows : []);
			})
			.catch((err) => {
				if (cancelled) return;
				setScheduleError(err.message || 'スケジュールの取得に失敗しました。');
				setSchedules([]);
			})
			.finally(() => {
				if (!cancelled) setScheduleLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, step, storeId, staffId, date, hasUserStores]);

	const selectedSchedule = useMemo(
		() => schedules.find((s) => s.id === scheduleId) || null,
		[schedules, scheduleId]
	);

	// isDirty: ステップ1で予約枠を選んでいる、もしくはステップ2でフォームに入力がある場合は
	// 閉じる前に確認する。ステップ1の店舗/担当者/日付の変更だけでは確認しない（軽い操作のため）。
	const hasFormInput =
		!!form.customer_name.trim() ||
		!!form.customer_email.trim() ||
		!!form.customer_phone.trim() ||
		!!form.admin_memo.trim() ||
		Object.values(meta).some(
			(v) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)
		);
	const isDirty = !submitting && (step === 2 || !!scheduleId || hasFormInput);

	const selectedStaffName = useMemo(() => {
		if (!selectedSchedule) return '';
		const sf = staff.find((s) => s.id === selectedSchedule.staff_id);
		return sf ? sf.name : '';
	}, [selectedSchedule, staff]);

	const selectedStoreName = useMemo(() => {
		if (!selectedSchedule) return '';
		const st = stores.find((s) => s.id === selectedSchedule.store_id);
		return st ? st.name : '';
	}, [selectedSchedule, stores]);

	const displayFields = useMemo(
		() =>
			customFields.filter(
				(f) => !['customer_name', 'customer_email', 'customer_phone'].includes(f.field_key)
			),
		[customFields]
	);

	const coreFieldMeta = useMemo(() => {
		// 初期の 3 フィールドを custom_fields から取り出し、必須フラグとプレースホルダを参照する.
		const byKey = Object.fromEntries(customFields.map((f) => [f.field_key, f]));
		return {
			name: byKey.customer_name || { field_label: '氏名', is_required: 1, placeholder: '' },
			email: byKey.customer_email || { field_label: 'メールアドレス', is_required: 1, placeholder: '' },
			phone: byKey.customer_phone || { field_label: '電話番号', is_required: 1, placeholder: '' },
		};
	}, [customFields]);

	// --- ステップ1 操作 ---

	const goStep2 = () => {
		if (!scheduleId) {
			setScheduleError('予約枠を選択してください。');
			return;
		}
		setScheduleError(null);
		setStep(2);
	};

	// --- ステップ2 操作 ---

	const setField = (patch) => setForm((prev) => ({ ...prev, ...patch }));
	const setMetaValue = (key, value) => setMeta((prev) => ({ ...prev, [key]: value }));

	const validate = () => {
		const errs = {};
		if (!form.customer_name.trim()) errs.customer_name = '氏名は必須です。';
		if (!form.customer_email.trim()) {
			errs.customer_email = 'メールアドレスは必須です。';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customer_email)) {
			errs.customer_email = 'メールアドレスの形式が正しくありません。';
		}
		if (coreFieldMeta.phone.is_required && !form.customer_phone.trim()) {
			errs.customer_phone = '電話番号は必須です。';
		}
		// カスタムフィールドの必須チェック.
		displayFields.forEach((f) => {
			if (!f.is_required) return;
			const v = meta[f.field_key];
			const empty =
				v === undefined ||
				v === null ||
				v === '' ||
				(Array.isArray(v) && v.length === 0);
			if (empty) errs[f.field_key] = '入力してください。';
		});
		setFieldErrors(errs);
		return Object.keys(errs).length === 0;
	};

	const handleSubmit = async (e) => {
		if (e && e.preventDefault) e.preventDefault();
		if (!validate()) return;
		setSubmitting(true);
		setSubmitError(null);
		try {
			const payload = {
				schedule_id: scheduleId,
				customer_name: form.customer_name,
				customer_email: form.customer_email,
				customer_phone: form.customer_phone,
				status: form.status,
				admin_memo: form.admin_memo,
				meta: (() => {
					const clean = {};
					Object.entries(meta).forEach(([k, v]) => {
						if (Array.isArray(v)) {
							clean[k] = v.join(', ');
						} else if (v !== undefined && v !== null) {
							clean[k] = String(v);
						}
					});
					return clean;
				})(),
			};
			const res = await API.reservations.create(payload);
			if (onCreated) onCreated(res);
		} catch (err) {
			// 満席エラーはステップ1に戻ってユーザーに別枠を選ばせる.
			if (err.code === 'smb_reservation_full' || err.status === 409) {
				setSubmitError('この時間枠はちょうど満席になりました。別の枠を選択してください。');
				setStep(1);
				// スケジュール再取得で最新の残数を反映.
				if (date) {
					const reloadParams = {
						date_from: date,
						date_to: date,
					};
					if (storeId) reloadParams.store_id = storeId;
					if (staffId) reloadParams.staff_id = staffId;
					API.schedules
						.list(reloadParams)
						.then((rows) => setSchedules(Array.isArray(rows) ? rows : []))
						.catch(() => {});
				}
			} else {
				setSubmitError(err.message || '予約の作成に失敗しました。');
			}
		} finally {
			setSubmitting(false);
		}
	};

	if (!open) return null;

	// --- Footer ---
	let footer;
	if (step === 1) {
		footer = (
			<>
				<Button variant="secondary" onClick={onClose}>
					キャンセル
				</Button>
				<Button variant="primary" onClick={goStep2} disabled={!scheduleId}>
					次へ: 予約者情報
				</Button>
			</>
		);
	} else {
		footer = (
			<>
				<Button variant="ghost" onClick={() => setStep(1)} disabled={submitting}>
					戻る
				</Button>
				<div className="smb-modal__spacer" />
				<Button variant="secondary" onClick={onClose} disabled={submitting}>
					キャンセル
				</Button>
				<Button variant="primary" onClick={handleSubmit} loading={submitting}>
					予約を作成する
				</Button>
			</>
		);
	}

	return (
		<Modal
			open={open}
			onClose={onClose}
			isDirty={isDirty}
			title="予約を手動で作成"
			size="lg"
			footer={footer}
		>
			<ol className="smb-step-indicator" aria-label="ステップ">
				<li className={`smb-step-indicator__item ${step === 1 ? 'is-current' : step > 1 ? 'is-done' : ''}`}>
					<span className="smb-step-indicator__num">1</span>
					<span className="smb-step-indicator__label">予約枠を選ぶ</span>
				</li>
				<li className={`smb-step-indicator__item ${step === 2 ? 'is-current' : ''}`}>
					<span className="smb-step-indicator__num">2</span>
					<span className="smb-step-indicator__label">予約者情報を入力</span>
				</li>
			</ol>

			{submitError && (
				<ErrorMessage message={submitError} onDismiss={() => setSubmitError(null)} />
			)}

			{step === 1 && (
				<div className="smb-manual-step">
					<div className="smb-manual-step__filters">
						{hasUserStores && (
							<Select
								label="店舗"
								required
								value={storeId}
								onChange={(e) => {
									setStoreId(e.target.value);
									setStaffId('');
								}}
								options={storeOptions}
							/>
						)}
						{hasUserStaff && (
							<Select
								label="担当者"
								value={staffId}
								onChange={(e) => setStaffId(e.target.value)}
								options={staffOptions}
								help={
									hasUserStores && !storeId
										? '先に店舗を選択してください。'
										: '担当者で絞り込めます。'
								}
							/>
						)}
						<div className="smb-field">
							<label className="smb-field__label" htmlFor="smb-manual-date">
								<span>予約日</span>
								<span className="smb-field__required" aria-label="必須">*</span>
							</label>
							<input
								id="smb-manual-date"
								type="date"
								className="smb-input"
								value={date}
								min={toYmd(new Date())}
								onChange={(e) => setDate(e.target.value)}
							/>
						</div>
					</div>

					<div className="smb-manual-step__slots">
						<h4 className="smb-manual-step__title">
							{date ? formatLocalDate(date) : '日付を選択してください'} の予約枠
						</h4>

						{scheduleLoading && (
							<div className="smb-loading">
								<Spinner label="読み込み中" />
							</div>
						)}
						{!scheduleLoading && scheduleError && <ErrorMessage message={scheduleError} />}
						{!scheduleLoading && !scheduleError && hasUserStores && !storeId && (
							<p className="smb-manual-step__empty">店舗を選択すると予約枠が表示されます。</p>
						)}
						{!scheduleLoading &&
							!scheduleError &&
							(!hasUserStores || storeId) &&
							schedules.length === 0 && (
								<p className="smb-manual-step__empty">
									指定の条件ではスケジュールが登録されていません。スケジュール管理画面で登録してください。
								</p>
							)}
						{!scheduleLoading && !scheduleError && schedules.length > 0 && (
							<ul className="smb-manual-step__slot-list" role="list">
								{schedules.map((s) => {
									const remain = Math.max(0, s.capacity - s.booked_count);
									const disabled = !s.is_active || remain <= 0;
									const selected = scheduleId === s.id;
									const staffName = staff.find((x) => x.id === s.staff_id)?.name || '';
									return (
										<li key={s.id}>
											<button
												type="button"
												className={`smb-slot-btn ${selected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`}
												onClick={() => setScheduleId(s.id)}
												disabled={disabled}
												aria-pressed={selected}
											>
												<span className="smb-slot-btn__time">
													{String(s.start_time).slice(0, 5)} – {String(s.end_time).slice(0, 5)}
												</span>
												<span className="smb-slot-btn__staff">{staffName}</span>
												<span className="smb-slot-btn__capacity">
													{disabled && !s.is_active
														? '受付停止'
														: remain <= 0
															? '満席'
															: `残り ${remain}/${s.capacity}`}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</div>
			)}

			{step === 2 && selectedSchedule && (
				<form className="smb-manual-form" onSubmit={handleSubmit} noValidate>
					<div className="smb-manual-form__summary">
						<span className="smb-manual-form__summary-label">選択中の予約枠</span>
						<span className="smb-manual-form__summary-value">
							{formatLocalDate(selectedSchedule.schedule_date)}{' '}
							{String(selectedSchedule.start_time).slice(0, 5)}〜
							{String(selectedSchedule.end_time).slice(0, 5)}
							{selectedStoreName && ` / ${selectedStoreName}`}
							{selectedStaffName && ` / ${selectedStaffName}`}
						</span>
					</div>

					<Input
						label={coreFieldMeta.name.field_label || '氏名'}
						required
						error={fieldErrors.customer_name}
						value={form.customer_name}
						onChange={(e) => setField({ customer_name: e.target.value })}
						placeholder="山田 太郎"
						autoComplete="off"
					/>
					<div className="smb-field-group smb-field-group--contact">
						<Input
							label={coreFieldMeta.email.field_label || 'メールアドレス'}
							required
							type="email"
							error={fieldErrors.customer_email}
							value={form.customer_email}
							onChange={(e) => setField({ customer_email: e.target.value })}
							placeholder="example@example.com"
							autoComplete="off"
						/>
						<Input
							label={coreFieldMeta.phone.field_label || '電話番号'}
							required={!!coreFieldMeta.phone.is_required}
							type="tel"
							error={fieldErrors.customer_phone}
							value={form.customer_phone}
							onChange={(e) => setField({ customer_phone: e.target.value })}
							placeholder="03-1234-5678"
							autoComplete="off"
						/>
					</div>

					{displayFields.map((f) => (
						<CustomFieldRenderer
							key={f.field_key}
							field={f}
							value={meta[f.field_key]}
							onChange={setMetaValue}
							error={fieldErrors[f.field_key]}
						/>
					))}

					<Select
						label="ステータス"
						value={form.status}
						onChange={(e) => setField({ status: e.target.value })}
						options={STATUS_OPTIONS}
						help="電話予約など管理者が直接入力した場合は「承認済み」が一般的です。"
					/>
					<Textarea
						label="管理者メモ（予約者には公開されません）"
						value={form.admin_memo}
						onChange={(e) => setField({ admin_memo: e.target.value })}
						placeholder="社内向けの申し送り事項を記入できます。"
						rows={2}
					/>

					{/* Enter キーでの submit を吸収 */}
					<button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>
						送信
					</button>
				</form>
			)}
		</Modal>
	);
}
