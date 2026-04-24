/**
 * 設定ページ（スタブ）。
 *
 * 次のサブタスクで5タブ（基本設定・メール通知・外部連携・デザイン・サポート）を実装する。
 */
export default function SettingsPage() {
	return (
		<div className="smb-page">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">設定</h1>
					<p className="smb-page__lead">プラグイン全体の動作設定を行います。</p>
				</div>
			</div>
			<div className="smb-page__content">
				<div className="smb-stub">
					<p>
						設定画面は次のサブタスクで実装予定です。
						5タブ（基本設定・メール通知・外部連携・デザイン・サポート）が入ります。
					</p>
				</div>
			</div>
		</div>
	);
}
