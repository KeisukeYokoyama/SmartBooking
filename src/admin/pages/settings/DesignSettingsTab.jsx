/**
 * 設定ページ - デザインタブ。
 *
 * 予約フォームのカラーカスタマイズ（ボタン色・選択色・必須マーク色など）と LIVE プレビューを扱う。
 * カラー設定はこの画面に集約する（フォーム設定ページにはタブを置かない）。
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
