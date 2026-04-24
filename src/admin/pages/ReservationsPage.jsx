/**
 * 予約一覧ページ（スタブ）。
 *
 * 次のサブタスクでフィルタ・テーブル表示・ステータス変更・CSVエクスポート・手動予約作成を実装する。
 */
export default function ReservationsPage() {
	return (
		<div className="smb-page">
			<div className="smb-page__header">
				<div>
					<h1 className="smb-page__title">予約一覧</h1>
					<p className="smb-page__lead">受付済みの予約の確認・承認・キャンセルを行います。</p>
				</div>
			</div>
			<div className="smb-page__content">
				<div className="smb-stub">
					<p>
						予約一覧は次のサブタスクで実装予定です。
						フィルタ・ソート・ステータス変更・手動予約作成・CSV出力が入ります。
					</p>
				</div>
			</div>
		</div>
	);
}
