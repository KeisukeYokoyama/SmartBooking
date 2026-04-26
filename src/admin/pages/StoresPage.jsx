/**
 * 店舗・担当者管理ページ。
 *
 * - タブ切替（店舗 / 担当者）
 * - カード形式で一覧表示（画像プレビュー、ステータストグル、並び替え、編集、削除）
 * - 追加/編集はモーダル
 * - 削除は確認ダイアログ（予約紐付きのエラーは専用メッセージで伝える）
 * - 空状態 / ローディング / エラー / 成功トースト すべてを扱う
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ErrorMessage from '../components/ErrorMessage';
import Spinner from '../components/Spinner';
import { useToast } from '../components/ToastContainer';
import StaffCard from './stores/StaffCard';
import StaffFormModal from './stores/StaffFormModal';
import StoreCard from './stores/StoreCard';
import StoreFormModal from './stores/StoreFormModal';

export default function StoresPage() {
	const [tab, setTab] = useState('stores');
	const [stores, setStores] = useState([]);
	const [staff, setStaff] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(null);

	const [formModal, setFormModal] = useState({ type: null, item: null });
	const [submitting, setSubmitting] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [deleting, setDeleting] = useState(false);

	const { showToast } = useToast();

	const load = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const [storesRes, staffRes] = await Promise.all([API.stores.list(), API.staff.list()]);
			setStores(Array.isArray(storesRes) ? storesRes : []);
			setStaff(Array.isArray(staffRes) ? staffRes : []);
		} catch (err) {
			setLoadError(err.message || '読み込みに失敗しました。');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const storeById = useMemo(() => {
		const map = new Map();
		stores.forEach((s) => map.set(s.id, s));
		return map;
	}, [stores]);

	// --- 店舗の操作 ---

	const openAddStore = () => setFormModal({ type: 'store', item: null });
	const openEditStore = (store) => setFormModal({ type: 'store', item: store });
	const closeForm = () => setFormModal({ type: null, item: null });

	const submitStore = async (values) => {
		setSubmitting(true);
		try {
			if (formModal.item) {
				await API.stores.update(formModal.item.id, values);
				showToast('店舗を更新しました', 'success');
			} else {
				await API.stores.create(values);
				showToast('店舗を追加しました', 'success');
			}
			closeForm();
			await load();
		} catch (err) {
			showToast(err.message || '保存に失敗しました。', 'error', 6000);
		} finally {
			setSubmitting(false);
		}
	};

	const toggleStoreActive = async (store, isActive) => {
		// 無効化（ON→OFF）の場合、紐づくスケジュールがあるとフロント予約フォームから消えるため、
		// ユーザーに件数付きで確認する。スケジュール件数取得に失敗した場合は汎用メッセージで確認。
		if (!isActive && !!store.is_active) {
			let count = null;
			try {
				const list = await API.schedules.list({ store_id: store.id });
				if (Array.isArray(list)) count = list.length;
			} catch {
				count = null;
			}
			const msg =
				count !== null && count > 0
					? `この店舗には${count}件のスケジュールが登録されています。無効にすると、フロントの予約フォームに表示されなくなります。よろしいですか？`
					: count === 0
						? null
						: '店舗を無効にすると、フロントの予約フォームに表示されなくなります。よろしいですか？';
			if (msg) {
				const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
				if (!ok) return; // スイッチは元の値を維持（楽観更新前に return）.
			}
		}
		// 楽観更新.
		setStores((prev) => prev.map((s) => (s.id === store.id ? { ...s, is_active: isActive ? 1 : 0 } : s)));
		try {
			await API.stores.update(store.id, { ...store, is_active: isActive ? 1 : 0 });
			showToast(isActive ? '店舗を有効化しました' : '店舗を無効化しました', 'success', 2000);
		} catch (err) {
			// ロールバック.
			setStores((prev) => prev.map((s) => (s.id === store.id ? { ...s, is_active: store.is_active } : s)));
			showToast(err.message || '状態の更新に失敗しました。', 'error');
		}
	};

	// --- 担当者の操作 ---

	const openAddStaff = () => setFormModal({ type: 'staff', item: null });
	const openEditStaff = (s) => setFormModal({ type: 'staff', item: s });

	const submitStaff = async (values) => {
		setSubmitting(true);
		try {
			if (formModal.item) {
				await API.staff.update(formModal.item.id, values);
				showToast('担当者を更新しました', 'success');
			} else {
				await API.staff.create(values);
				showToast('担当者を追加しました', 'success');
			}
			closeForm();
			await load();
		} catch (err) {
			showToast(err.message || '保存に失敗しました。', 'error', 6000);
		} finally {
			setSubmitting(false);
		}
	};

	const toggleStaffActive = async (target, isActive) => {
		// 担当者の無効化（ON→OFF）も同様に、紐づくスケジュール件数を確認する。
		if (!isActive && !!target.is_active) {
			let count = null;
			try {
				const list = await API.schedules.list({ staff_id: target.id });
				if (Array.isArray(list)) count = list.length;
			} catch {
				count = null;
			}
			const msg =
				count !== null && count > 0
					? `この担当者には${count}件のスケジュールが登録されています。無効にすると、フロントの予約フォームに表示されなくなります。よろしいですか？`
					: count === 0
						? null
						: '担当者を無効にすると、フロントの予約フォームに表示されなくなります。よろしいですか？';
			if (msg) {
				const ok = typeof window !== 'undefined' ? window.confirm(msg) : true;
				if (!ok) return;
			}
		}
		setStaff((prev) => prev.map((s) => (s.id === target.id ? { ...s, is_active: isActive ? 1 : 0 } : s)));
		try {
			await API.staff.update(target.id, { ...target, is_active: isActive ? 1 : 0 });
			showToast(isActive ? '担当者を有効化しました' : '担当者を無効化しました', 'success', 2000);
		} catch (err) {
			setStaff((prev) => prev.map((s) => (s.id === target.id ? { ...s, is_active: target.is_active } : s)));
			showToast(err.message || '状態の更新に失敗しました。', 'error');
		}
	};

	// --- 並び替え ---

	const move = async (kind, list, setList, index, delta) => {
		const target = list[index + delta];
		const self = list[index];
		if (!target || !self) return;
		// 楽観更新.
		const newList = [...list];
		newList[index] = target;
		newList[index + delta] = self;
		// sort_order を再採番（10刻みで余裕を持たせる）.
		const renumbered = newList.map((item, i) => ({ ...item, sort_order: (i + 1) * 10 }));
		setList(renumbered);

		try {
			const fn = kind === 'store' ? API.stores.update : API.staff.update;
			await Promise.all([
				fn(self.id, { ...self, sort_order: (index + delta + 1) * 10 }),
				fn(target.id, { ...target, sort_order: (index + 1) * 10 }),
			]);
		} catch (err) {
			showToast(err.message || '並び替えに失敗しました。', 'error');
			await load();
		}
	};

	// --- 削除 ---

	// 担当者削除の場合は CASCADE 削除されるスケジュール件数を事前取得し、
	// 確認ダイアログのメッセージに含めてユーザーに警告する。
	// 件数取得に失敗した場合は scheduleCount=null として汎用メッセージで進める。
	const askDelete = async (kind, item) => {
		if (kind === 'staff') {
			let scheduleCount = null;
			try {
				const list = await API.schedules.list({ staff_id: item.id });
				if (Array.isArray(list)) scheduleCount = list.length;
			} catch {
				scheduleCount = null;
			}
			setDeleteTarget({ kind, item, scheduleCount });
		} else {
			setDeleteTarget({ kind, item, scheduleCount: null });
		}
	};

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		setDeleting(true);
		try {
			if (deleteTarget.kind === 'store') {
				await API.stores.remove(deleteTarget.item.id);
				showToast('店舗を削除しました', 'success');
			} else {
				await API.staff.remove(deleteTarget.item.id);
				showToast('担当者を削除しました', 'success');
			}
			setDeleteTarget(null);
			await load();
		} catch (err) {
			showToast(err.message || '削除に失敗しました。', 'error', 6000);
		} finally {
			setDeleting(false);
		}
	};

	// --- 描画 ---

	const renderStores = () => {
		if (stores.length === 0) {
			return (
				<EmptyState
					title="店舗がまだ登録されていません"
					description="予約を受け付けるには、まず1つ目の店舗を追加してください。"
					action={
						<Button variant="primary" onClick={openAddStore}>
							最初の店舗を追加する
						</Button>
					}
				/>
			);
		}
		return (
			<div className="smb-card-list" role="list">
				{stores.map((store, i) => (
					<StoreCard
						key={store.id}
						store={store}
						index={i}
						total={stores.length}
						onEdit={openEditStore}
						onDelete={(s) => askDelete('store', s)}
						onToggleActive={toggleStoreActive}
						onMoveUp={(_, idx) => move('store', stores, setStores, idx, -1)}
						onMoveDown={(_, idx) => move('store', stores, setStores, idx, 1)}
					/>
				))}
			</div>
		);
	};

	const renderStaff = () => {
		if (stores.length === 0) {
			return (
				<EmptyState
					title="担当者を追加する前に店舗を作成してください"
					description="担当者は必ず店舗に所属します。先に店舗タブから店舗を登録してください。"
					action={
						<Button variant="secondary" onClick={() => setTab('stores')}>
							店舗タブを開く
						</Button>
					}
				/>
			);
		}
		if (staff.length === 0) {
			return (
				<EmptyState
					title="担当者がまだ登録されていません"
					description="予約フォームで選べる担当者を追加しましょう。担当者が1人だけの場合、予約者には担当者選択ステップが表示されません。"
					action={
						<Button variant="primary" onClick={openAddStaff}>
							最初の担当者を追加する
						</Button>
					}
				/>
			);
		}
		return (
			<div className="smb-card-list" role="list">
				{staff.map((s, i) => (
					<StaffCard
						key={s.id}
						staff={s}
						storeName={storeById.get(s.store_id)?.name || '未所属'}
						index={i}
						total={staff.length}
						onEdit={openEditStaff}
						onDelete={(item) => askDelete('staff', item)}
						onToggleActive={toggleStaffActive}
						onMoveUp={(_, idx) => move('staff', staff, setStaff, idx, -1)}
						onMoveDown={(_, idx) => move('staff', staff, setStaff, idx, 1)}
					/>
				))}
			</div>
		);
	};

	return (
		<div className="smb-page smb-page--stores">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">店舗・担当者</h1>
					<p className="smb-page__lead">予約を受け付ける拠点と、その担当者を管理します。</p>
				</div>
				{!loading && !loadError && (
					<div className="smb-page__actions">
						{tab === 'stores' ? (
							<Button variant="primary" onClick={openAddStore} icon="＋">
								店舗を追加
							</Button>
						) : (
							<Button
								variant="primary"
								onClick={openAddStaff}
								icon="＋"
								disabled={stores.length === 0}
							>
								担当者を追加
							</Button>
						)}
					</div>
				)}
			</div>

			<div className="smb-tabs" role="tablist">
				<button
					role="tab"
					type="button"
					aria-selected={tab === 'stores'}
					className={`smb-tab ${tab === 'stores' ? 'is-active' : ''}`}
					onClick={() => setTab('stores')}
				>
					店舗
					<span className="smb-tab__count" aria-hidden="true">
						{stores.length}
					</span>
				</button>
				<button
					role="tab"
					type="button"
					aria-selected={tab === 'staff'}
					className={`smb-tab ${tab === 'staff' ? 'is-active' : ''}`}
					onClick={() => setTab('staff')}
				>
					担当者
					<span className="smb-tab__count" aria-hidden="true">
						{staff.length}
					</span>
				</button>
			</div>

			<div className="smb-section-card">
				{loading && (
					<div className="smb-loading">
						<Spinner label="読み込み中" />
						<span>読み込み中…</span>
					</div>
				)}
				{loadError && !loading && (
					<ErrorMessage message={loadError} onRetry={load} onDismiss={() => setLoadError(null)} />
				)}
				{!loading && !loadError && (tab === 'stores' ? renderStores() : renderStaff())}
			</div>

			<StoreFormModal
				open={formModal.type === 'store'}
				store={formModal.item}
				onClose={closeForm}
				onSubmit={submitStore}
				submitting={submitting}
			/>
			<StaffFormModal
				open={formModal.type === 'staff'}
				staff={formModal.item}
				stores={stores}
				onClose={closeForm}
				onSubmit={submitStaff}
				submitting={submitting}
			/>

			<ConfirmDialog
				open={!!deleteTarget}
				title={deleteTarget?.kind === 'store' ? '店舗を削除' : '担当者を削除'}
				message={(() => {
					if (!deleteTarget) return '';
					const name = deleteTarget.item?.name || '';
					if (deleteTarget.kind === 'store') {
						return `「${name}」を削除します。この操作は取り消せません。予約またはスケジュールが紐づいている場合は削除できません。`;
					}
					// 担当者: スケジュール件数が取得できていれば CASCADE 削除を明示する。
					const c = deleteTarget.scheduleCount;
					if (typeof c === 'number' && c > 0) {
						return `「${name}」を削除します。この担当者には${c}件のスケジュールが登録されており、それらも一緒に削除されます。予約が紐づいている場合は削除できません。この操作は取り消せません。`;
					}
					return `「${name}」を削除します。この操作は取り消せません。予約が紐づいている場合は削除できません。`;
				})()}
				confirmLabel="削除する"
				cancelLabel="キャンセル"
				loading={deleting}
				onConfirm={confirmDelete}
				onCancel={() => setDeleteTarget(null)}
			/>
		</div>
	);
}
