/**
 * フォーム設定ページ。
 *
 * - フィールド設定タブ: カスタムフィールドの CRUD + 並び替え
 * - テーマ設定タブ: カラー設定 + リアルタイムプレビュー
 *
 * 参考: docs/reference-ui/screenshot-4.png, admin-form-fields.png, admin-form-theme.png
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
import ThemeColorPicker from './formsettings/ThemeColorPicker';

export default function FormSettingsPage() {
	const [tab, setTab] = useState('fields');

	// フィールド一覧
	const [fields, setFields] = useState([]);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(null);

	// モーダル状態
	const [modal, setModal] = useState({ open: false, field: null, defaultType: 'text' });
	const [submitting, setSubmitting] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState(null);
	const [deleting, setDeleting] = useState(false);

	// テーマ設定
	const [settings, setSettings] = useState({});
	const [themeSaving, setThemeSaving] = useState(false);

	const { showToast } = useToast();

	const loadFields = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const [fieldsRes, settingsRes] = await Promise.all([
				API.customFields.list(),
				API.settings.get(),
			]);
			setFields(Array.isArray(fieldsRes) ? fieldsRes : []);
			setSettings(settingsRes && settingsRes.settings ? settingsRes.settings : {});
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

	// --- テーマ設定保存 ---

	const saveTheme = async (patch) => {
		setThemeSaving(true);
		try {
			const res = await API.settings.update(patch);
			setSettings((prev) => ({ ...prev, ...(res?.settings || patch) }));
			showToast('テーマ設定を保存しました', 'success');
		} catch (err) {
			showToast(err.message || '保存に失敗しました。', 'error', 6000);
		} finally {
			setThemeSaving(false);
		}
	};

	// --- 描画 ---

	const renderFieldsTab = () => {
		return (
			<div className="smb-form-settings">
				<section className="smb-section">
					<div className="smb-section__header">
						<h2 className="smb-section__title">フィールドタイプから追加</h2>
						<p className="smb-section__lead">
							追加したい入力項目のタイプを選んでください。後から編集・並び替えもできます。
						</p>
					</div>
					<FieldTypeCards onSelect={(type) => openAdd(type)} />
				</section>

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
		);
	};

	const renderThemeTab = () => (
		<ThemeColorPicker settings={settings} onSave={saveTheme} saving={themeSaving} />
	);

	return (
		<div className="smb-page smb-page--form-settings">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">フォーム設定</h1>
					<p className="smb-page__lead">
						予約フォームで入力してもらう項目と、フォームの見た目を設定します。
					</p>
				</div>
				{tab === 'fields' && !loading && !loadError && (
					<div className="smb-page__actions">
						<Button variant="primary" onClick={() => openAdd('text')} icon="＋">
							フィールドを追加
						</Button>
					</div>
				)}
			</div>

			<div className="smb-tabs" role="tablist">
				<button
					role="tab"
					type="button"
					aria-selected={tab === 'fields'}
					className={`smb-tab ${tab === 'fields' ? 'is-active' : ''}`}
					onClick={() => setTab('fields')}
				>
					フィールド設定
					<span className="smb-tab__count" aria-hidden="true">
						{fields.length}
					</span>
				</button>
				<button
					role="tab"
					type="button"
					aria-selected={tab === 'theme'}
					className={`smb-tab ${tab === 'theme' ? 'is-active' : ''}`}
					onClick={() => setTab('theme')}
				>
					テーマ設定
				</button>
			</div>

			<div className="smb-page__content">
				{loading && (
					<div className="smb-loading">
						<Spinner label="読み込み中" />
						<span>読み込み中…</span>
					</div>
				)}
				{loadError && !loading && (
					<ErrorMessage
						message={loadError}
						onRetry={loadFields}
						onDismiss={() => setLoadError(null)}
					/>
				)}
				{!loading && !loadError && (tab === 'fields' ? renderFieldsTab() : renderThemeTab())}
			</div>

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
