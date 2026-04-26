/**
 * フォーム設定ページ。
 *
 * カスタムフィールドの CRUD + 並び替え。
 * カラー設定（テーマ）は「設定 → デザイン」タブに集約済みなので、ここでは扱わない。
 *
 * 参考: docs/reference-ui/screenshot-4.png, admin-form-fields.png
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorMessage from '../components/ErrorMessage';
import Spinner from '../components/Spinner';
import { useToast } from '../components/ToastContainer';
import CustomFieldList from './formsettings/CustomFieldList';
import CustomFieldModal from './formsettings/CustomFieldModal';
import FieldTypeCards from './formsettings/FieldTypeCards';

export default function FormSettingsPage() {
	// フィールド一覧
	const [fields, setFields] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(null);

	// モーダル状態
	const [modal, setModal] = useState({ open: false, field: null, defaultType: 'text' });
	const [submitting, setSubmitting] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [deleting, setDeleting] = useState(false);

	const { showToast } = useToast();

	const loadFields = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const fieldsRes = await API.customFields.list();
			setFields(Array.isArray(fieldsRes) ? fieldsRes : []);
		} catch (err) {
			setLoadError(err.message || '読み込みに失敗しました。');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadFields();
	}, [loadFields]);

	const existingKeys = useMemo(() => fields.map((f) => f.field_key), [fields]);

	// --- フィールド追加/編集 ---

	const openAdd = (type = 'text') => setModal({ open: true, field: null, defaultType: type });
	const openEdit = (field) => setModal({ open: true, field, defaultType: field.field_type });
	const closeModal = () => setModal({ open: false, field: null, defaultType: 'text' });

	const submitField = async (payload) => {
		setSubmitting(true);
		try {
			if (modal.field) {
				await API.customFields.update(modal.field.id, payload);
				showToast('フィールドを更新しました', 'success');
			} else {
				const nextOrder =
					fields.length > 0
						? Math.max(...fields.map((f) => f.sort_order || 0)) + 10
						: 10;
				await API.customFields.create({ ...payload, sort_order: nextOrder });
				showToast('フィールドを追加しました', 'success');
			}
			closeModal();
			await loadFields();
		} catch (err) {
			showToast(err.message || '保存に失敗しました。', 'error', 6000);
		} finally {
			setSubmitting(false);
		}
	};

	// --- 削除 ---

	const askDelete = (field) => setDeleteTarget(field);

	const confirmDelete = async () => {
		if (!deleteTarget) return;
		setDeleting(true);
		try {
			await API.customFields.remove(deleteTarget.id);
			showToast('フィールドを削除しました', 'success');
			setDeleteTarget(null);
			await loadFields();
		} catch (err) {
			showToast(err.message || '削除に失敗しました。', 'error', 6000);
		} finally {
			setDeleting(false);
		}
	};

	// --- 並び替え ---

	const moveField = async (index, delta) => {
		const target = fields[index + delta];
		const self = fields[index];
		if (!target || !self) return;

		// 楽観更新
		const newList = [...fields];
		newList[index] = target;
		newList[index + delta] = self;
		const renumbered = newList.map((f, i) => ({ ...f, sort_order: (i + 1) * 10 }));
		setFields(renumbered);

		try {
			await API.customFields.reorder(
				renumbered.map((f) => ({ id: f.id, sort_order: f.sort_order }))
			);
		} catch (err) {
			showToast(err.message || '並び替えに失敗しました。', 'error');
			await loadFields();
		}
	};

	// --- 描画 ---

	return (
		<div className="smb-page smb-page--form-settings">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">フォーム設定</h1>
					<p className="smb-page__lead">
						予約フォームで入力してもらう項目を設定します。フォームの色は「設定 → デザイン」から変更できます。
					</p>
				</div>
				{!loading && !loadError && (
					<div className="smb-page__actions">
						<Button variant="primary" onClick={() => openAdd('text')} icon="＋">
							フィールドを追加
						</Button>
					</div>
				)}
			</div>

			{loading && (
				<div className="smb-section-card">
					<div className="smb-loading">
						<Spinner label="読み込み中" />
						<span>読み込み中…</span>
					</div>
				</div>
			)}
			{loadError && !loading && (
				<div className="smb-section-card">
					<ErrorMessage
						message={loadError}
						onRetry={loadFields}
						onDismiss={() => setLoadError(null)}
					/>
				</div>
			)}
			{!loading && !loadError && (
				<>
					<div className="smb-section-card">
						<section className="smb-section">
							<div className="smb-section__header">
								<h2 className="smb-section__title">フィールドタイプから追加</h2>
								<p className="smb-section__lead">
									追加したい入力項目のタイプを選んでください。後から編集・並び替えもできます。
								</p>
							</div>
							<FieldTypeCards onSelect={(type) => openAdd(type)} />
						</section>
					</div>

					<div className="smb-section-card">
						<section className="smb-section">
							<div className="smb-section__header">
								<h2 className="smb-section__title">現在のフィールド一覧</h2>
								<p className="smb-section__lead">
									↑↓ ボタンで並び替えできます。氏名・メール・電話は予約システムの基本項目のため削除できません。
								</p>
							</div>
							<CustomFieldList
								fields={fields}
								onEdit={openEdit}
								onDelete={askDelete}
								onMove={moveField}
							/>
						</section>
					</div>
				</>
			)}

			<CustomFieldModal
				open={modal.open}
				field={modal.field}
				defaultType={modal.defaultType}
				existingKeys={existingKeys}
				onClose={closeModal}
				onSubmit={submitField}
				submitting={submitting}
			/>

			<ConfirmDialog
				open={!!deleteTarget}
				title="フィールドを削除"
				message={
					deleteTarget
						? `「${deleteTarget.field_label}」を削除します。この操作は取り消せません。既に送信された予約データには影響しません。`
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
