/**
 * 設定ページ。5タブ構成。
 *
 * - 基本設定 / メール通知 / 外部連携 / デザイン / サポート
 * - 保存はタブ単位（全体一括ではなく、各タブが担当する設定キーのみ送る）
 * - タブに未保存バッジを表示（旧UIにない改善点）
 * - タブ切替時、未保存の変更があれば警告ダイアログを表示
 */
import { useCallback, useEffect, useState } from 'react';
import { API } from '../api';
import ConfirmDialog from '../components/ConfirmDialog';
import ErrorMessage from '../components/ErrorMessage';
import Spinner from '../components/Spinner';
import { useToast } from '../components/ToastContainer';
import BasicSettingsTab from './settings/BasicSettingsTab';
import DesignSettingsTab from './settings/DesignSettingsTab';
import IntegrationSettingsTab from './settings/IntegrationSettingsTab';
import MailSettingsTab from './settings/MailSettingsTab';
import SupportTab from './settings/SupportTab';
import TabNav from './settings/TabNav';

const TABS = [
	{ key: 'basic', label: '基本設定' },
	{ key: 'mail', label: 'メール通知' },
	{ key: 'integration', label: '外部連携' },
	{ key: 'design', label: 'デザイン' },
	{ key: 'support', label: 'サポート' },
];

export default function SettingsPage() {
	const [tab, setTab] = useState('basic');
	const [pendingTab, setPendingTab] = useState(null); // 未保存警告で保留中のタブ

	const [settings, setSettings] = useState({});
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState(null);
	const [saving, setSaving] = useState(false);

	// タブごとの dirty 状態
	const [dirty, setDirty] = useState({
		basic: false,
		mail: false,
		integration: false,
		design: false,
	});

	const { showToast } = useToast();

	const load = useCallback(async () => {
		setLoading(true);
		setLoadError(null);
		try {
			const res = await API.settings.get();
			setSettings(res && res.settings ? res.settings : {});
		} catch (err) {
			setLoadError(err.message || '読み込みに失敗しました。');
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load();
	}, [load]);

	const setDirtyFor = useCallback((key) => (v) => {
		setDirty((prev) => (prev[key] === v ? prev : { ...prev, [key]: v }));
	}, []);

	const savePatch = async (patch, label) => {
		setSaving(true);
		try {
			const res = await API.settings.update(patch);
			setSettings((prev) => ({ ...prev, ...(res?.settings || patch) }));
			showToast(`${label || '設定'}を保存しました`, 'success');
		} catch (err) {
			showToast(err.message || '保存に失敗しました。', 'error', 6000);
		} finally {
			setSaving(false);
		}
	};

	const handleTabChange = (next) => {
		if (next === tab) return;
		// 現在のタブに未保存の変更があれば警告
		if (dirty[tab]) {
			setPendingTab(next);
			return;
		}
		setTab(next);
	};

	const confirmDiscardAndSwitch = () => {
		// 現タブの dirty をクリア（サーバ値で再 hydrate される）
		setDirty((prev) => ({ ...prev, [tab]: false }));
		setTab(pendingTab);
		setPendingTab(null);
		// サーバから再読み込み（捨てた編集内容で UI が残らないように）
		load();
	};

	const dirtyKeys = Object.keys(dirty).filter((k) => dirty[k]);

	const renderActiveTab = () => {
		if (loading) {
			return (
				<div className="smb-loading">
					<Spinner label="読み込み中" />
					<span>読み込み中…</span>
				</div>
			);
		}
		if (loadError) {
			return (
				<ErrorMessage
					message={loadError}
					onRetry={load}
					onDismiss={() => setLoadError(null)}
				/>
			);
		}

		switch (tab) {
			case 'basic':
				return (
					<BasicSettingsTab
						settings={settings}
						saving={saving}
						onSave={(patch) => savePatch(patch, '基本設定')}
						onDirtyChange={setDirtyFor('basic')}
					/>
				);
			case 'mail':
				return (
					<MailSettingsTab
						settings={settings}
						saving={saving}
						onSave={(patch) => savePatch(patch, 'メール設定')}
						onDirtyChange={setDirtyFor('mail')}
					/>
				);
			case 'integration':
				return (
					<IntegrationSettingsTab
						settings={settings}
						saving={saving}
						onSave={(patch) => savePatch(patch, '外部連携の設定')}
						onDirtyChange={setDirtyFor('integration')}
					/>
				);
			case 'design':
				return (
					<DesignSettingsTab
						settings={settings}
						saving={saving}
						onSave={(patch) => savePatch(patch, 'デザイン設定')}
					/>
				);
			case 'support':
				return <SupportTab />;
			default:
				return null;
		}
	};

	return (
		<div className="smb-page smb-page--settings">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">設定</h1>
					<p className="smb-page__lead">
						プラグイン全体の動作と、予約フォームのメール通知・外部連携・デザインを設定します。
					</p>
				</div>
			</div>

			<TabNav
				tabs={TABS}
				activeKey={tab}
				onChange={handleTabChange}
				dirtyKeys={dirtyKeys}
			/>

			<div className="smb-section-card">{renderActiveTab()}</div>

			<ConfirmDialog
				open={!!pendingTab}
				title="未保存の変更があります"
				message="保存していない変更はタブを切り替えると失われます。続行しますか？"
				confirmLabel="変更を破棄して移動"
				cancelLabel="このタブに留まる"
				variant="danger"
				onConfirm={confirmDiscardAndSwitch}
				onCancel={() => setPendingTab(null)}
			/>
		</div>
	);
}
