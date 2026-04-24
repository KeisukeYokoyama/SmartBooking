/**
 * スケジュール管理ページ（スタブ）。
 *
 * 次のサブタスクで月カレンダー + 追加モーダル + コピー機能を実装する。
 */
export default function SchedulePage() {
	return (
		<div className="smb-page">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">スケジュール</h1>
					<p className="smb-page__lead">予約枠の追加・編集・コピーを行います。</p>
				</div>
			</div>
			<div className="smb-page__content">
				<div className="smb-stub">
					<p>
						スケジュール管理画面は次のサブタスクで実装予定です。
						月カレンダー表示・スケジュール追加モーダル・コピー機能（日付個別／曜日パターン）が入ります。
					</p>
				</div>
			</div>
		</div>
	);
}
