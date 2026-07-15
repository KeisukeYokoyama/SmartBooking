/**
 * 予約一覧フィルタパネル。
 *
 * - 予約者名・メール・店舗・担当者・日付範囲・ステータスの絞り込み入力
 * - debounce は親側の effect で行う (300ms)
 * - 折りたたみトグル対応 (モバイルで省スペース)
 * - 「検索」「リセット」ボタン
 */
import { useMemo, useState } from 'react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Select from '../../components/Select';
import { STATUS_OPTIONS } from './StatusBadge';

const EMPTY_FILTERS = {
	customer_name: '',
	customer_email: '',
	store_id: '',
	staff_id: '',
	date_from: '',
	date_to: '',
	status: '',
	form_id: '',
};

export { EMPTY_FILTERS };

export default function ReservationFilters({
	filters,
	onChange,
	onReset,
	stores = [],
	staff = [],
	forms = [],
	showForm = false,
	activeCount = 0,
}) {
	const [open, setOpen] = useState(true);

	const update = (patch) => onChange({ ...filters, ...patch });

	const storeOptions = useMemo(
		() => [
			{ value: '', label: 'すべての店舗' },
			...stores.map((s) => ({ value: String(s.id), label: s.name })),
		],
		[stores]
	);

	const staffOptions = useMemo(() => {
		let list = staff;
		if (filters.store_id) {
			list = staff.filter((s) => String(s.store_id) === String(filters.store_id));
		}
		return [
			{ value: '', label: filters.store_id ? '店舗内のすべての担当者' : 'すべての担当者' },
			...list.map((s) => ({ value: String(s.id), label: s.name })),
		];
	}, [staff, filters.store_id]);

	const statusOptions = [{ value: '', label: 'すべてのステータス' }, ...STATUS_OPTIONS];

	const formOptions = useMemo(
		() => [
			{ value: '', label: 'すべてのフォーム' },
			...forms.map((f) => ({ value: String(f.id), label: f.name })),
		],
		[forms]
	);

	const handleStoreChange = (storeId) => {
		// 店舗が変わったら、その店舗に属さない担当者フィルタをクリア.
		const stillValid = staff.some(
			(s) => String(s.id) === String(filters.staff_id) && String(s.store_id) === String(storeId)
		);
		update({
			store_id: storeId,
			staff_id: stillValid ? filters.staff_id : '',
		});
	};

	return (
		<section className="smb-reservation-filters" aria-label="絞り込み">
			<header className="smb-reservation-filters__header">
				<button
					type="button"
					className="smb-reservation-filters__toggle"
					aria-expanded={open}
					aria-controls="smb-reservation-filters-body"
					onClick={() => setOpen((v) => !v)}
				>
					<span className="smb-reservation-filters__toggle-icon" aria-hidden="true">
						{open ? '▾' : '▸'}
					</span>
					<span>絞り込み</span>
					{activeCount > 0 && (
						<span className="smb-reservation-filters__count" aria-label={`${activeCount} 件の条件が有効`}>
							{activeCount}
						</span>
					)}
				</button>
				{activeCount > 0 && (
					<button
						type="button"
						className="smb-reservation-filters__clear"
						onClick={onReset}
					>
						すべてクリア
					</button>
				)}
			</header>

			{open && (
				<div className="smb-reservation-filters__body" id="smb-reservation-filters-body">
					<div className="smb-reservation-filters__grid">
						<Input
							label="予約者名"
							type="search"
							placeholder="部分一致"
							value={filters.customer_name}
							onChange={(e) => update({ customer_name: e.target.value })}
						/>
						<Input
							label="メールアドレス"
							type="search"
							placeholder="部分一致"
							value={filters.customer_email}
							onChange={(e) => update({ customer_email: e.target.value })}
						/>
						<Select
							label="店舗"
							options={storeOptions}
							value={filters.store_id}
							onChange={(e) => handleStoreChange(e.target.value)}
						/>
						<Select
							label="担当者"
							options={staffOptions}
							value={filters.staff_id}
							onChange={(e) => update({ staff_id: e.target.value })}
						/>
						{showForm && (
							<Select
								label="フォーム"
								options={formOptions}
								value={filters.form_id}
								onChange={(e) => update({ form_id: e.target.value })}
							/>
						)}

						<div className="smb-reservation-filters__date-range">
							<div className="smb-field">
								<label className="smb-field__label" htmlFor="smb-date-from">
									<span>予約日（開始）</span>
								</label>
								<input
									id="smb-date-from"
									type="date"
									className="smb-input"
									value={filters.date_from}
									onChange={(e) => update({ date_from: e.target.value })}
								/>
							</div>
							<span className="smb-reservation-filters__date-sep" aria-hidden="true">
								〜
							</span>
							<div className="smb-field">
								<label className="smb-field__label" htmlFor="smb-date-to">
									<span>予約日（終了）</span>
								</label>
								<input
									id="smb-date-to"
									type="date"
									className="smb-input"
									value={filters.date_to}
									onChange={(e) => update({ date_to: e.target.value })}
								/>
							</div>
						</div>

						<Select
							label="ステータス"
							options={statusOptions}
							value={filters.status}
							onChange={(e) => update({ status: e.target.value })}
						/>
					</div>

					<div className="smb-reservation-filters__actions">
						<Button variant="ghost" onClick={onReset}>
							リセット
						</Button>
					</div>
				</div>
			)}
		</section>
	);
}
