/**
 * 予約一覧ページ。
 *
 * 役割:
 *   - フィルタ + ソート + ページネーションで /reservations を表示
 *   - 各行のクイックアクション（承認 / キャンセル / 削除）
 *   - 行クリックで予約詳細モーダル（ステータス変更・メモ編集）
 *   - ヘッダから手動予約作成モーダルを起動
 *   - ヘッダから CSV 出力（現在のフィルタ条件を引き継ぐ）
 *
 * レスポンシブ:
 *   - ≥ 780px: テーブル表示
 *   - < 780px: カードリスト表示
 *
 * 状態管理は useState のみ（外部ライブラリ不使用）。
 * フィルタ変更は 300ms debounce して再取得する。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API, apiDownload } from '../api';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorMessage from '../components/ErrorMessage';
import Spinner from '../components/Spinner';
import { useToast } from '../components/ToastContainer';
import ManualReservationModal from './reservations/ManualReservationModal';
import Pagination from './reservations/Pagination';
import ReservationCardList from './reservations/ReservationCardList';
import ReservationDetailModal from './reservations/ReservationDetailModal';
import ReservationFilters, { EMPTY_FILTERS } from './reservations/ReservationFilters';
import ReservationTable from './reservations/ReservationTable';

const PER_PAGE = 20;
const MOBILE_BREAKPOINT = 780;
const FILTER_DEBOUNCE = 300;

function useIsMobile() {
	const [isMobile, setIsMobile] = useState(() => {
		if (typeof window === 'undefined') return false;
		return window.innerWidth < MOBILE_BREAKPOINT;
	});
	useEffect(() => {
		if (typeof window === 'undefined') return undefined;
		const handler = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		window.addEventListener('resize', handler);
		return () => window.removeEventListener('resize', handler);
	}, []);
	return isMobile;
}

function countActiveFilters(filters) {
	return Object.entries(filters).reduce((acc, [, v]) => acc + (v ? 1 : 0), 0);
}

/**
 * フィルタをクエリパラメタに変換。空値を落とし、id 系は数値化する。
 */
function filtersToParams(filters, sort, page) {
	const p = {};
	if (filters.customer_name) p.customer_name = filters.customer_name;
	if (filters.customer_email) p.customer_email = filters.customer_email;
	if (filters.store_id) p.store_id = filters.store_id;
	if (filters.staff_id) p.staff_id = filters.staff_id;
	if (filters.date_from) p.date_from = filters.date_from;
	if (filters.date_to) p.date_to = filters.date_to;
	if (filters.status) p.status = filters.status;
	p.orderby = sort.orderby;
	p.order = sort.order;
	p.page = page;
	p.per_page = PER_PAGE;
	return p;
}

export default function ReservationsPage() {
	const [filters, setFilters] = useState(EMPTY_FILTERS);
	const [sort, setSort] = useState({ orderby: 'schedule_date', order: 'desc' });
	const [page, setPage] = useState(1);

	const [items, setItems] = useState([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [listError, setListError] = useState(null);

	const [stores, setStores] = useState([]);
	const [staff, setStaff] = useState([]);
	const [customFields, setCustomFields] = useState([]);
	const [basicsLoading, setBasicsLoading] = useState(true);
	const [basicsError, setBasicsError] = useState(null);

	const [detailTarget, setDetailTarget] = useState(null); // {id}
	const [manualOpen, setManualOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [deleting, setDeleting] = useState(false);
	const [pendingRowIds, setPendingRowIds] = useState(() => new Set());
	const [csvLoading, setCsvLoading] = useState(false);

	const debounceRef = useRef(null);
	const { showToast } = useToast();
	const isMobile = useIsMobile();

	const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
	const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
	const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);

	// ---- 初期ロード（店舗 / 担当者 / カスタムフィールド）----

	const loadBasics = useCallback(async () => {
		setBasicsLoading(true);
		setBasicsError(null);
		try {
			const [storeRes, staffRes, fieldsRes] = await Promise.all([
				API.stores.list(),
				API.staff.list(),
				API.customFields.list().catch(() => []),
			]);
			setStores(Array.isArray(storeRes) ? storeRes : []);
			setStaff(Array.isArray(staffRes) ? staffRes : []);
			setCustomFields(Array.isArray(fieldsRes) ? fieldsRes : []);
		} catch (err) {
			setBasicsError(err.message || '初期データの読み込みに失敗しました。');
		} finally {
			setBasicsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadBasics();
	}, [loadBasics]);

	// ---- 予約一覧のロード（debounce）----

	const loadReservations = useCallback(
		async (currentFilters, currentSort, currentPage) => {
			setLoading(true);
			setListError(null);
			try {
				const params = filtersToParams(currentFilters, currentSort, currentPage);
				const res = await API.reservations.list(params);
				setItems(Array.isArray(res?.items) ? res.items : []);
				setTotal(typeof res?.total === 'number' ? res.total : 0);
			} catch (err) {
				setListError(err.message || '予約一覧の取得に失敗しました。');
				setItems([]);
				setTotal(0);
			} finally {
				setLoading(false);
			}
		},
		[]
	);

	useEffect(() => {
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			loadReservations(filters, sort, page);
		}, FILTER_DEBOUNCE);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [filters, sort, page, loadReservations]);

	// フィルタ変更で先頭ページに戻す.
	const handleFiltersChange = (next) => {
		setFilters(next);
		setPage(1);
	};

	const handleReset = () => {
		setFilters(EMPTY_FILTERS);
		setPage(1);
	};

	// ---- ソート ----

	const handleSort = (key) => {
		setSort((prev) => {
			if (prev.orderby === key) {
				return { orderby: key, order: prev.order === 'asc' ? 'desc' : 'asc' };
			}
			// 新しい列は意味のある初期方向を選ぶ
			const asc = key === 'customer_name';
			return { orderby: key, order: asc ? 'asc' : 'desc' };
		});
		setPage(1);
	};

	// ---- 行アクション ----

	const markPending = (id, flag) => {
		setPendingRowIds((prev) => {
			const next = new Set(prev);
			if (flag) next.add(id);
			else next.delete(id);
			return next;
		});
	};

	// 楽観更新: 行を特定ステータスに切り替えつつ、失敗したらロールバック.
	const updateReservationStatus = async (row, newStatus, successMessage) => {
		markPending(row.id, true);
		const previous = row.status;
		setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: newStatus } : r)));
		try {
			await API.reservations.update(row.id, { status: newStatus });
			showToast(successMessage, 'success', 2500);
		} catch (err) {
			// ロールバック.
			setItems((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: previous } : r)));
			showToast(err.message || 'ステータスの更新に失敗しました。', 'error', 6000);
		} finally {
			markPending(row.id, false);
		}
	};

	const handleApprove = (row) => updateReservationStatus(row, 'approved', `#${row.id} を承認しました`);
	const handleCancel = (row) => {
		updateReservationStatus(row, 'cancelled', `#${row.id} をキャンセルにしました`);
	};

	const handleOpenDetail = (row) => setDetailTarget({ id: row.id });
	const handleDetailSaved = (updated) => {
		setItems((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
		showToast(`予約 #${updated.id} を更新しました`, 'success');
	};
	const handleAskDelete = (row) => setDeleteTarget(row);

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		setDeleting(true);
		try {
			await API.reservations.remove(deleteTarget.id);
			setItems((prev) => prev.filter((r) => r.id !== deleteTarget.id));
			setTotal((prev) => Math.max(0, prev - 1));
			showToast(`予約 #${deleteTarget.id} を削除しました`, 'success');
			setDeleteTarget(null);
			// 詳細モーダルが対象の予約を開いていたら閉じる.
			if (detailTarget && detailTarget.id === deleteTarget.id) {
				setDetailTarget(null);
			}
			// ページ末尾の1件を削除した直後に表示が空になるケースを救済.
			if (items.length === 1 && page > 1) {
				setPage((p) => Math.max(1, p - 1));
			}
		} catch (err) {
			showToast(err.message || '予約の削除に失敗しました。', 'error', 6000);
		} finally {
			setDeleting(false);
		}
	};

	// ---- 手動予約作成 ----

	const handleCreated = () => {
		setManualOpen(false);
		showToast('予約を作成しました', 'success');
		loadReservations(filters, sort, 1);
		setPage(1);
	};

	// ---- CSV エクスポート ----

	const handleDownloadCsv = async () => {
		setCsvLoading(true);
		try {
			// ソート・ページは CSV エクスポートでは不要（サーバが独自の並び）。フィルタのみ渡す.
			const params = {};
			if (filters.customer_name) params.customer_name = filters.customer_name;
			if (filters.customer_email) params.customer_email = filters.customer_email;
			if (filters.store_id) params.store_id = filters.store_id;
			if (filters.staff_id) params.staff_id = filters.staff_id;
			if (filters.date_from) params.date_from = filters.date_from;
			if (filters.date_to) params.date_to = filters.date_to;
			if (filters.status) params.status = filters.status;

			const today = new Date();
			const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
			await apiDownload('reservations/export/csv', params, `reservations-${ymd}.csv`);
			showToast('CSV をダウンロードしました', 'success');
		} catch (err) {
			showToast(err.message || 'CSV のダウンロードに失敗しました。', 'error', 6000);
		} finally {
			setCsvLoading(false);
		}
	};

	// ---- render ----

	const showEmpty = !loading && !listError && items.length === 0;
	const emptyTitle = activeFilterCount > 0 ? '条件に一致する予約がありません' : 'まだ予約がありません';
	const emptyDesc =
		activeFilterCount > 0
			? 'フィルタ条件を変更するか、「すべてクリア」で絞り込みをリセットしてください。'
			: '予約はフロント画面の予約フォームから入ります。電話などの予約は「予約を手動で作成」から登録できます。';

	return (
		<div className="smb-page smb-page--reservations">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">予約一覧</h1>
					<p className="smb-page__lead">
						受付済みの予約の確認・ステータス変更・削除を行います。
					</p>
				</div>
				<div className="smb-page__actions">
					<Button
						variant="secondary"
						onClick={handleDownloadCsv}
						loading={csvLoading}
						disabled={loading || basicsLoading}
						icon="⇣"
					>
						CSV 出力
					</Button>
					<Button
						variant="primary"
						onClick={() => setManualOpen(true)}
						disabled={basicsLoading || stores.length === 0}
						icon="＋"
					>
						予約を手動で作成
					</Button>
				</div>
			</div>

			{basicsError && !basicsLoading && (
				<ErrorMessage
					message={basicsError}
					onRetry={loadBasics}
					onDismiss={() => setBasicsError(null)}
				/>
			)}

			<ReservationFilters
				filters={filters}
				onChange={handleFiltersChange}
				onReset={handleReset}
				stores={stores}
				staff={staff}
				activeCount={activeFilterCount}
			/>

			<div className="smb-page__content smb-page__content--reservations">
				{listError && !loading && (
					<ErrorMessage
						message={listError}
						onRetry={() => loadReservations(filters, sort, page)}
						onDismiss={() => setListError(null)}
					/>
				)}

				{loading && (
					<div className="smb-loading">
						<Spinner label="読み込み中" />
						<span>予約を読み込んでいます…</span>
					</div>
				)}

				{!loading && !listError && showEmpty && (
					<EmptyState
						icon="📋"
						title={emptyTitle}
						description={emptyDesc}
						action={
							activeFilterCount > 0 ? (
								<Button variant="secondary" onClick={handleReset}>
									絞り込みをクリア
								</Button>
							) : (
								<Button
									variant="primary"
									onClick={() => setManualOpen(true)}
									disabled={stores.length === 0}
								>
									予約を手動で作成
								</Button>
							)
						}
					/>
				)}

				{!loading && !listError && items.length > 0 && (
					<>
						{isMobile ? (
							<ReservationCardList
								items={items}
								storeMap={storeMap}
								staffMap={staffMap}
								onOpenDetail={handleOpenDetail}
								onApprove={handleApprove}
								onCancel={handleCancel}
								onDelete={handleAskDelete}
								pendingRowIds={pendingRowIds}
							/>
						) : (
							<ReservationTable
								items={items}
								storeMap={storeMap}
								staffMap={staffMap}
								sort={sort}
								onSort={handleSort}
								onOpenDetail={handleOpenDetail}
								onApprove={handleApprove}
								onCancel={handleCancel}
								onDelete={handleAskDelete}
								pendingRowIds={pendingRowIds}
							/>
						)}

						<Pagination
							page={page}
							perPage={PER_PAGE}
							total={total}
							onChange={setPage}
						/>
					</>
				)}
			</div>

			<ReservationDetailModal
				open={!!detailTarget}
				reservationId={detailTarget?.id}
				onClose={() => setDetailTarget(null)}
				onSaved={handleDetailSaved}
				onAskDelete={handleAskDelete}
				stores={stores}
				staff={staff}
				customFields={customFields}
			/>

			<ManualReservationModal
				open={manualOpen}
				onClose={() => setManualOpen(false)}
				onCreated={handleCreated}
				stores={stores}
				staff={staff}
				customFields={customFields}
			/>

			<ConfirmDialog
				open={!!deleteTarget}
				title={`予約 #${deleteTarget?.id || ''} を削除`}
				message={
					deleteTarget && deleteTarget.status !== 'cancelled'
						? 'この予約を削除します。関連するスケジュールの予約枠が 1 つ解放されます。この操作は取り消せません。'
						: 'この予約を削除します。この操作は取り消せません。'
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
