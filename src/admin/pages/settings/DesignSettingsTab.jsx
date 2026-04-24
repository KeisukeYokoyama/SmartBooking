/**
 * 設定ページ - デザインタブ。
 *
 * フォーム設定ページの「テーマ設定」と同じ内容を扱う。
 * ユーザーがどちらのページからでもアクセスできるよう、共通コンポーネントを再利用する。
 */
import ThemeColorPicker from '../formsettings/ThemeColorPicker';

export default function DesignSettingsTab({ settings, onSave, saving }) {
	return (
		<div className="smb-settings-form">
			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">カラーカスタマイズ</h3>
					<p className="smb-settings-section__lead">
						予約フォームのボタン・選択色などをサイトのブランドカラーに合わせてカスタマイズできます。
						変更は右側のプレビューに即時反映されます。
					</p>
				</div>
				<ThemeColorPicker settings={settings} onSave={onSave} saving={saving} />
			</div>
		</div>
	);
}
