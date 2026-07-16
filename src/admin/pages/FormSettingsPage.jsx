/**
 * フォーム設定ページ。
 *
 * フォームセレクタ（複数フォーム機能 v0.4.0）+ 選択中フォームのカスタムフィールド CRUD + 並び替え。
 * カラー設定（テーマ）は「設定 → デザイン」タブに集約済みなので、ここでは扱わない。
 *
 * 参考: docs/reference-ui/screenshot-4.png, admin-form-fields.png
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API } from '../api';
import Button from '../components/Button';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorMessage from '../components/ErrorMessage';
import ShortcodeField from '../components/ShortcodeField';
import Spinner from '../components/Spinner';
import { useToast } from '../components/ToastContainer';
import { buildFormShortcode } from '../utils/shortcode';
import CustomFieldList from './formsettings/CustomFieldList';
import CustomFieldModal from './formsettings/CustomFieldModal';
import FieldTypeCards from './formsettings/FieldTypeCards';
import FormNameModal from './formsettings/FormNameModal';

// サーバ側のハードキャップ (SMART_BOOKING_MAX_FORMS) と同じ値。UI 側の予防的な disabled 判定にのみ使う。
const MAX_FORMS = 10;

export default function FormSettingsPage() {
	// フォーム一覧・選択中フォーム
	const [forms, setForms] = useState([]);
	const [selectedFormId, setSelectedFormId] = useState(null);
	const [formsLoading, setFormsLoading] = useState(true);
	const [formsLoadError, setFormsLoadError] = useState(null);

	// フィールド一覧（選択中フォームのもの）
	const [fields, setFields] = useState([]);
	const [fieldsLoading, setFieldsLoading] = useState(true);
	const [fieldsLoadError, setFieldsLoadError] = useState(null);

	// フィールド追加/編集モーダル状態
	const [modal, setModal] = useState({ open: false, field: null, defaultType: 'text' });
	const [submitting, setSubmitting] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [deleting, setDeleting] = useState(false);

	// フォーム追加/名前変更モーダル状態
	const [formModal, setFormModal] = useState({ open: false, mode: 'create', name: '', formId: null });
	const [formSubmitting, setFormSubmitting] = useState(false);
	const [deleteFormTarget, setDeleteFormTarget] = useState(null);
	const [deletingForm, setDeletingForm] = useState(false);

	const { showToast } = useToast();

	// --- フォーム一覧の読み込み ---

	const loadForms = useCallback(async (forceSelectId) => {
		setFormsLoading(true);
		setFormsLoadError(null);
		try {
			const res = await API.forms.list();
			const list = Array.isArray(res) ? res : [];
			setForms(list);
			setSelectedFormId((prev) => {
				if (forceSelectId && list.some((f) => f.id === forceSelectId)) {
					return forceSelectId;
				}
				if (prev && list.some((f) => f.id === prev)) {
					return prev;
				}
				const defaultForm = list.find((f) => f.is_default === 1) || list[0];
				return defaultForm ? defaultForm.id : null;
			});
		} catch (err) {
			setFormsLoadError(err.message || 'フォーム一覧の読み込みに失敗しました。');
		} finally {
			setFormsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadForms();
	}, [loadForms]);

	// --- 選択中フォームのフィールド読み込み ---

	const loadFields = useCallback(async (formId) => {
		setFieldsLoading(true);
		setFieldsLoadError(null);
		try {
			const fieldsRes = await API.customFields.list(formId);
			setFields(Array.isArray(fieldsRes) ? fieldsRes : []);
		} catch (err) {
			setFieldsLoadError(err.message || '読み込みに失敗しました。');
		} finally {
			setFieldsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (selectedFormId) {
			loadFields(selectedFormId);
		}
	}, [selectedFormId, loadFields]);

	const selectedForm = useMemo(
		() => forms.find((f) => f.id === selectedFormId) || null,
		[forms, selectedFormId]
	);

	const existingKeys = useMemo(() => fields.map((f) => f.field_key), [fields]);

	// --- フォーム選択・追加・名前変更・削除 ---

	const handleFormChange = (e) => {
		const id = Number(e.target.value);
		if (id) setSelectedFormId(id);
	};

	const openCreateForm = () => setFormModal({ open: true, mode: 'create', name: '', formId: null });
	const openRenameForm = () => {
		if (!selectedForm) return;
		setFormModal({ open: true, mode: 'rename', name: selectedForm.name, formId: selectedForm.id });
	};
	const closeFormModal = () => setFormModal({ open: false, mode: 'create', name: '', formId: null });

	const submitFormModal = async (name) => {
		setFormSubmitting(true);
		try {
			if (formModal.mode === 'rename' && formModal.formId) {
				await API.forms.update(formModal.formId, { name });
				showToast('フォーム名を変更しました', 'success');
				closeFormModal();
				await loadForms();
			} else {
				const created = await API.forms.create({ name });
				showToast('フォームを追加しました', 'success');
				closeFormModal();
				await loadForms(created?.id);
			}
		} catch (err) {
			showToast(err.message || '保存に失敗しました。', 'error', 6000);
		} finally {
			setFormSubmitting(false);
		}
	};

	const askDeleteForm = () => {
		if (!selectedForm || selectedForm.is_default === 1) return;
		setDeleteFormTarget(selectedForm);
	};

	const confirmDeleteForm = async () => {
		if (!deleteFormTarget) return;
		setDeletingForm(true);
		try {
			await API.forms.remove(deleteFormTarget.id);
			showToast('フォームを削除しました', 'success');
			setDeleteFormTarget(null);
			await loadForms();
		} catch (err) {
			showToast(err.message || '削除に失敗しました。', 'error', 6000);
		} finally {
			setDeletingForm(false);
		}
	};

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
				const created = await API.customFields.create({
					...payload,
					sort_order: nextOrder,
					form_id: selectedFormId,
				});
				// キー欄を空欄で作成した場合はサーバが field_N を自動採番するため、
				// 割り当てられたメール変数名をトーストで知らせる（変数名が分からず困るのを防ぐ）。
				const assignedKey = created && created.field_key ? created.field_key : '';
				if (!payload.field_key && assignedKey) {
					showToast(
						`フィールドを追加しました（メール変数: {${assignedKey}}）`,
						'success'
					);
				} else {
					showToast('フィールドを追加しました', 'success');
				}
			}
			closeModal();
			await loadFields(selectedFormId);
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
			await loadFields(selectedFormId);
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
			await loadFields(selectedFormId);
		}
	};

	// --- 描画 ---

	const showFieldSections = !formsLoading && !formsLoadError && !fieldsLoading && !fieldsLoadError;

	return (
		<div className="smb-page smb-page--form-settings">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">フォーム設定</h1>
					<p className="smb-page__lead">
						予約フォームで入力してもらう項目を設定します。フォームの色は「設定 → デザイン」から変更できます。
					</p>
				</div>
				{showFieldSections && (
					<div className="smb-page__actions">
						<Button variant="primary" onClick={() => openAdd('text')} icon="＋">
							フィールドを追加
						</Button>
					</div>
				)}
			</div>

			{formsLoading && (
				<div className="smb-section-card">
					<div className="smb-loading">
						<Spinner label="読み込み中" />
						<span>読み込み中…</span>
					</div>
				</div>
			)}
			{formsLoadError && !formsLoading && (
				<div className="smb-section-card">
					<ErrorMessage
						message={formsLoadError}
						onRetry={() => loadForms()}
						onDismiss={() => setFormsLoadError(null)}
					/>
				</div>
			)}

			{!formsLoading && !formsLoadError && (
				<div className="smb-section-card">
					<div className="smb-form-selector-bar">
						<label className="smb-inline-field smb-inline-field--grow">
							<span className="smb-inline-field__label">フォーム</span>
							<select
								className="smb-select"
								value={selectedFormId || ''}
								onChange={handleFormChange}
							>
								{forms.map((f) => (
									<option key={f.id} value={f.id}>
										{f.name}
									</option>
								))}
							</select>
						</label>
						<div className="smb-form-selector-bar__actions">
							<Button
								variant="secondary"
								size="sm"
								onClick={openRenameForm}
								disabled={!selectedForm}
							>
								編集
							</Button>
							{selectedForm && selectedForm.is_default !== 1 && (
								<Button variant="ghost" size="sm" onClick={askDeleteForm}>
									削除
								</Button>
							)}
							<Button
								variant="primary"
								size="sm"
								icon="＋"
								onClick={openCreateForm}
								disabled={forms.length >= MAX_FORMS}
							>
								フォームを追加
							</Button>
						</div>
					</div>
					{selectedForm && (
						<ShortcodeField
							code={buildFormShortcode(selectedForm)}
							help="このコードを固定ページや投稿に貼り付けると、このフォームの予約フォームが表示されます。"
						/>
					)}
					{forms.length >= MAX_FORMS && (
						<p className="smb-field__help smb-form-selector-bar__hint">
							フォームは最大{MAX_FORMS}個までです。
						</p>
					)}
				</div>
			)}

			{!formsLoading && !formsLoadError && fieldsLoading && (
				<div className="smb-section-card">
					<div className="smb-loading">
						<Spinner label="読み込み中" />
						<span>読み込み中…</span>
					</div>
				</div>
			)}
			{fieldsLoadError && !fieldsLoading && (
				<div className="smb-section-card">
					<ErrorMessage
						message={fieldsLoadError}
						onRetry={() => loadFields(selectedFormId)}
						onDismiss={() => setFieldsLoadError(null)}
					/>
				</div>
			)}
			{showFieldSections && (
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
				fields={fields}
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

			<FormNameModal
				open={formModal.open}
				mode={formModal.mode}
				initialName={formModal.name}
				submitting={formSubmitting}
				onClose={closeFormModal}
				onSubmit={submitFormModal}
			/>

			<ConfirmDialog
				open={!!deleteFormTarget}
				title="フォームを削除"
				message={
					deleteFormTarget
						? `「${deleteFormTarget.name}」を削除します。このフォームのフィールド定義は削除されます。過去の予約データは残ります。この操作は取り消せません。`
						: ''
				}
				confirmLabel="削除する"
				cancelLabel="キャンセル"
				loading={deletingForm}
				onConfirm={confirmDeleteForm}
				onCancel={() => setDeleteFormTarget(null)}
			/>
		</div>
	);
}
