/**
 * スケジュール管理ページ（メイン）。
 *
 * 構成:
 *   - ページヘッダ（タイトル + 操作ボタン群）
 *   - フィルター行（月移動、店舗、担当者）
 *   - メインビュー: CalendarGrid + ScheduleDetailPane（日付選択時）
 *   - その下: ScheduleList（選択月のスケジュールを日付別表示）
 *
 * 主要な操作:
 *   - スケジュール追加（ScheduleAddModal）
 *   - スケジュール編集（ScheduleEditModal、差分同期で POST/PUT/DELETE）
 *   - スケジュール削除（店舗×担当者×日付のグループ単位）
 *   - スケジュールコピー（ScheduleCopyModal、各スケジュール行のコピー操作から起動）
 *
 * 状態:
 *   - currentMonth, selectedYmd, selectedStoreId, selectedStaffId
 *   - schedules, stores, staff
 *
 * フィルター変更・月移動のたびに /schedules を再取得する。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorMessage from '../components/ErrorMessage';
import Spinner from '../components/Spinner';
import { useToast } from '../components/ToastContainer';
import CalendarGrid, { groupSchedulesByDate } from './schedule/CalendarGrid';
import ScheduleAddModal from './schedule/ScheduleAddModal';
import ScheduleCopyModal from './schedule/ScheduleCopyModal';
import ScheduleDetailPane from './schedule/ScheduleDetailPane';
import ScheduleEditModal from './schedule/ScheduleEditModal';
import ScheduleList from './schedule/ScheduleList';
import { addMonths, endOfMonth, formatYearMonth, startOfMonth, toYmd } from './schedule/dateUtils';
import Button from '../components/Button';

export default function SchedulePage() {
	const [currentMonth, setCurrentMonth] = useState(() => new Date());
	const [selectedYmd, setSelectedYmd] = useState(null);
	const [selectedStoreId, setSelectedStoreId] = useState(''); // '' = すべて
	const [selectedStaffId, setSelectedStaffId] = useState('');

	const [stores, setStores] = useState([]);
	const [staff, setStaff] = useState([]);
	const [schedules, setSchedules] = useState([]);

	const [loading, setLoading] = useState(true);
	const [scheduleLoading, setScheduleLoading] = useState(false);
	const [loadError, setLoadError] = useState(null);

	const [addModal, setAddModal] = useState({ open: false, defaultDate: null });
	const [editModal, setEditModal] = useState({ open: false, group: null });
	const [copyModal, setCopyModal] = useState({ open: false, source: null });

	const [submitting, setSubmitting] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [deleting, setDeleting] = useState(false);

	const { showToast } = useToast();

	/* --------- 初期ロード（店舗・担当者・設定）--------- */

	const loadBasics = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const [storesRes, staffRes] = await Promise.all([
				API.stores.list(),
				API.staff.list(),
			]);
			setStores(Array.isArray(storesRes) ? storesRes : []);
			setStaff(Array.isArray(staffRes) ? staffRes : []);
		} catch (err) {
			setLoadError(err.message || '初期データの読み込みに失敗しました。');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadBasics();
	}, [loadBasics]);

	/* --------- 月＋フィルタで /schedules を再取得 --------- */

	const loadSchedules = useCallback(async () => {
		setScheduleLoading(true);
		try {
			const params = {
				date_from: toYmd(startOfMonth(currentMonth)),
				date_to: toYmd(endOfMonth(currentMonth)),
			};
			if (selectedStoreId) params.store_id = selectedStoreId;
			if (selectedStaffId) params.staff_id = selectedStaffId;
			const res = await API.schedules.list(params);
			setSchedules(Array.isArray(res) ? res : []);
		} catch (err) {
			showToast(err.message || 'スケジュールの読み込みに失敗しました。', 'error');
		} finally {
			setScheduleLoading(false);
		}
	}, [currentMonth, selectedStoreId, selectedStaffId, showToast]);

	useEffect(() => {
		if (!loading) {
			loadSchedules();
		}
	}, [loading, loadSchedules]);

	/* --------- Maps / Derived --------- */

	const storesById = useMemo(() => {
		const m = new Map();
		stores.forEach((s) => m.set(s.id, s));
		return m;
	}, [stores]);

	const staffById = useMemo(() => {
		const m = new Map();
		staff.forEach((s) => m.set(s.id, s));
		return m;
	}, [staff]);

	const schedulesByDate = useMemo(() => groupSchedulesByDate(schedules), [schedules]);

	const staffFilterOptions = useMemo(() => {
		if (!selectedStoreId) return staff;
		return staff.filter((s) => s.store_id === Number(selectedStoreId));
	}, [staff, selectedStoreId]);

	const daySchedules = selectedYmd ? schedulesByDate.get(selectedYmd) || [] : [];

	/* --------- 操作ハンドラ --------- */

	const goPrevMonth = () => {
		setCurrentMonth(addMonths(currentMonth, -1));
		setSelectedYmd(null);
	};
	const goNextMonth = () => {
		setCurrentMonth(addMonths(currentMonth, 1));
		setSelectedYmd(null);
	};
	const goToday = () => {
		const today = new Date();
		setCurrentMonth(today);
		setSelectedYmd(toYmd(today));
	};

	const handleSelectDate = (ymd) => {
		setSelectedYmd(ymd);
	};

	const openAdd = (defaultDate) => {
		setAddModal({ open: true, defaultDate: defaultDate || selectedYmd });
	};
	const closeAdd = () => setAddModal({ open: false, defaultDate: null });

	const submitAdd = async (items) => {
		setSubmitting(true);
		try {
			await API.schedules.create({ items });
			showToast(`スケジュールを追加しました（${items.length}件）`, 'success');
			closeAdd();
			// 追加した日付を選択状態にする.
			if (items[0]) setSelectedYmd(items[0].schedule_date);
			await loadSchedules();
		} catch (err) {
			showToast(err.message || 'スケジュールの追加に失敗しました。', 'error', 6000);
		} finally {
			setSubmitting(false);
		}
	};

	const openEdit = (group, ymdOverride) => {
		const ymd = ymdOverride || selectedYmd;
		if (!ymd) return;
		const store = storesById.get(group.store_id);
		const s = staffById.get(group.staff_id);
		// storesById / staffById に無いものはシステムエンティティ。ユーザーには内部 ID を見せず「—」表記。
		setEditModal({
			open: true,
			group: {
				date: ymd,
				store_id: group.store_id,
				staff_id: group.staff_id,
				storeName: store?.name || '—',
				staffName: s?.name || '—',
				slots: [...group.slots].sort((a, b) =>
					(a.start_time || '').localeCompare(b.start_time || '')
				),
			},
		});
	};
	const closeEdit = () => setEditModal({ open: false, group: null });

	const submitEdit = async ({ deletions, updates, creates }) => {
		setSubmitting(true);
		try {
			// 削除 → 更新 → 作成 の順で実行。DELETE は予約付きなら拒否される.
			for (const del of deletions) {
				// 予約付きは force=false のまま試み、失敗したらエラー表示に集約.
				// eslint-disable-next-line no-await-in-loop
				await API.schedules.remove(del.id);
			}
			for (const u of updates) {
				// eslint-disable-next-line no-await-in-loop
				await API.schedules.update(u.id, u.payload);
			}
			if (creates.length > 0) {
				await API.schedules.create({ items: creates });
			}
			showToast('スケジュールを更新しました', 'success');
			closeEdit();
			await loadSchedules();
		} catch (err) {
			showToast(err.message || 'スケジュールの更新に失敗しました。', 'error', 6000);
		} finally {
			setSubmitting(false);
		}
	};

	const openCopy = (group, ymdOverride) => {
		const ymd = ymdOverride || selectedYmd;
		if (!ymd) return;
		const store = storesById.get(group.store_id);
		const s = staffById.get(group.staff_id);
		setCopyModal({
			open: true,
			source: {
				date: ymd,
				store_id: group.store_id,
				staff_id: group.staff_id,
				storeName: store?.name || '',
				staffName: s?.name || '',
				slots: [...group.slots].sort((a, b) =>
					(a.start_time || '').localeCompare(b.start_time || '')
				),
			},
		});
	};
	const closeCopy = () => setCopyModal({ open: false, source: null });

	const submitCopy = async (payload) => {
		setSubmitting(true);
		try {
			const res = await API.schedules.copy(payload);
			const parts = [];
			parts.push(`コピー完了: ${res.inserted || 0}件作成`);
			if (res.overwritten) parts.push(`${res.overwritten}件上書き`);
			if (res.skipped) parts.push(`${res.skipped}件スキップ`);
			showToast(parts.join(' / '), 'success');
			closeCopy();
			await loadSchedules();
		} catch (err) {
			showToast(err.message || 'コピーに失敗しました。', 'error', 6000);
		} finally {
			setSubmitting(false);
		}
	};

	const askDelete = (group, ymdOverride) => {
		const ymd = ymdOverride || selectedYmd;
		if (!ymd) return;
		const store = storesById.get(group.store_id);
		const s = staffById.get(group.staff_id);
		// システムエンティティは「—」で表示。
		setDeleteTarget({
			date: ymd,
			store_id: group.store_id,
			staff_id: group.staff_id,
			storeName: store?.name || '—',
			staffName: s?.name || '—',
			slots: group.slots,
		});
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		setDeleting(true);
		try {
			for (const slot of deleteTarget.slots) {
				// eslint-disable-next-line no-await-in-loop
				await API.schedules.remove(slot.id);
			}
			showToast(`${deleteTarget.slots.length}件の時間枠を削除しました`, 'success');
			setDeleteTarget(null);
			await loadSchedules();
		} catch (err) {
			showToast(err.message || '削除に失敗しました。', 'error', 6000);
		} finally {
			setDeleting(false);
		}
	};

	/* --------- 描画 --------- */

	if (loading) {
		return (
			<div className="smb-page smb-page--schedule">
				<div className="smb-loading">
					<Spinner label="読み込み中" />
					<span>読み込み中…</span>
				</div>
			</div>
		);
	}

	if (loadError) {
		return (
			<div className="smb-page smb-page--schedule">
				<ErrorMessage message={loadError} onRetry={loadBasics} onDismiss={() => setLoadError(null)} />
			</div>
		);
	}

	// システムエンティティ方式:
	//   API は is_system=0 のレコードのみ返す。stores=[]/staff=[] の場合でも、
	//   バックエンドにはシステム店舗・担当者が存在しスケジュール POST 時に自動補完される。
	//   よってユーザーに「店舗を登録してください」と要求せず、ドロップダウンだけ非表示にする。
	const storeFilterOptions = [
		{ value: '', label: 'すべての店舗' },
		...stores.map((s) => ({ value: String(s.id), label: s.name })),
	];
	const staffFilterSelect = [
		{ value: '', label: 'すべての担当者' },
		...staffFilterOptions.map((s) => ({ value: String(s.id), label: s.name })),
	];
	// ユーザー作成の店舗・担当者があるかどうか（>=1 件あればフィルタを表示する）。
	const showStoreFilter = stores.length > 0;
	const showStaffFilter = staff.length > 0;

	return (
		<div className="smb-page smb-page--schedule">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">スケジュール管理</h1>
					<p className="smb-page__lead">
						月カレンダーから日付を選んで、店舗・担当者ごとの予約枠を追加・編集できます。
					</p>
				</div>
				<div className="smb-page__actions">
					<Button variant="primary" icon="＋" onClick={() => openAdd()}>
						スケジュールを追加
					</Button>
				</div>
			</div>

			<div className="smb-schedule-toolbar">
				<div className="smb-schedule-toolbar__nav">
					<button
						type="button"
						className="smb-icon-btn"
						onClick={goPrevMonth}
						aria-label="前の月"
					>
						‹
					</button>
					<button
						type="button"
						className="smb-icon-btn"
						onClick={goNextMonth}
						aria-label="次の月"
					>
						›
					</button>
					<button type="button" className="smb-btn smb-btn--secondary smb-btn--sm" onClick={goToday}>
						今日
					</button>
					<h2 className="smb-schedule-toolbar__month">{formatYearMonth(currentMonth)}</h2>
				</div>
				<div className="smb-schedule-toolbar__filters">
					{showStoreFilter && (
						<label className="smb-inline-field">
							<span className="smb-inline-field__label">店舗</span>
							<select
								className="smb-select"
								value={selectedStoreId}
								onChange={(e) => {
									setSelectedStoreId(e.target.value);
									setSelectedStaffId('');
								}}
							>
								{storeFilterOptions.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</label>
					)}
					{showStaffFilter && (
						<label className="smb-inline-field">
							<span className="smb-inline-field__label">担当者</span>
							<select
								className="smb-select"
								value={selectedStaffId}
								onChange={(e) => setSelectedStaffId(e.target.value)}
							>
								{staffFilterSelect.map((o) => (
									<option key={o.value} value={o.value}>
										{o.label}
									</option>
								))}
							</select>
						</label>
					)}
				</div>
			</div>

			<div className="smb-schedule-layout">
				<div className="smb-schedule-layout__calendar">
					<CalendarGrid
						month={currentMonth}
						selectedYmd={selectedYmd}
						onSelect={handleSelectDate}
						schedulesByDate={schedulesByDate}
						storesById={storesById}
					/>
					{scheduleLoading && (
						<div className="smb-schedule-layout__loading" aria-live="polite">
							<Spinner size="sm" label="更新中" />
							<span>更新中…</span>
						</div>
					)}
				</div>
				<div className="smb-schedule-layout__pane">
					<ScheduleDetailPane
						selectedYmd={selectedYmd}
						daySchedules={daySchedules}
						storesById={storesById}
						staffById={staffById}
						onAdd={(ymd) => openAdd(ymd)}
						onEdit={(group) => openEdit(group)}
						onCopy={(group) => openCopy(group)}
						onDelete={(group) => askDelete(group)}
					/>
				</div>
			</div>

			<div className="smb-schedule-layout__list">
				<h2 className="smb-section-title">
					{formatYearMonth(currentMonth)}のスケジュール一覧
				</h2>
				<ScheduleList
					schedules={schedules}
					storesById={storesById}
					staffById={staffById}
					onEdit={openEdit}
					onCopy={openCopy}
					onDelete={askDelete}
				/>
			</div>

			<ScheduleAddModal
				open={addModal.open}
				onClose={closeAdd}
				onSubmit={submitAdd}
				submitting={submitting}
				stores={stores}
				staff={staff}
				defaultDate={addModal.defaultDate}
				defaultStoreId={selectedStoreId ? Number(selectedStoreId) : null}
				defaultStaffId={selectedStaffId ? Number(selectedStaffId) : null}
			/>

			<ScheduleEditModal
				open={editModal.open}
				onClose={closeEdit}
				onSubmit={submitEdit}
				submitting={submitting}
				group={editModal.group}
			/>

			<ScheduleCopyModal
				open={copyModal.open}
				onClose={closeCopy}
				onSubmit={submitCopy}
				submitting={submitting}
				source={copyModal.source}
			/>

			<ConfirmDialog
				open={!!deleteTarget}
				title="スケジュールを削除"
				message={
					deleteTarget
						? `「${deleteTarget.storeName} / ${deleteTarget.staffName}」の ${deleteTarget.date} のスケジュール（${deleteTarget.slots.length}枠）を削除します。この操作は取り消せません。予約が紐づいている場合は削除できません。`
						: ''
				}
				confirmLabel="削除する"
				cancelLabel="キャンセル"
				loading={deleting}
				onConfirm={confirmDelete}
				onCancel={() => setDeleteTarget(null)}
			/>
		</div>
	);
}
