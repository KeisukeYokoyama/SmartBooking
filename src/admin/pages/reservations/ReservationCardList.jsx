/**
 * 予約一覧のモバイル用カードリスト表示。
 *
 * テーブル横スクロールよりもタップしやすいカード型。
 * 各カードの要素: 予約番号 + ステータス / 予約者 / 日時 / 店舗・担当者 / 操作メニュー
 */
import StatusBadge from './StatusBadge';

export default function ReservationCardList({
	items,
	storeMap,
	staffMap,
	onOpenDetail,
	onApprove,
	onCancel,
	onDelete,
	pendingRowIds = new Set(),
}) {
	return (
		<ul className="smb-reservation-cards" role="list">
			{items.map((r) => {
				// システムエンティティ（is_system=1）はユーザーに非表示。「—」表記。
				const storeName = r.store_is_system
					? '—'
					: storeMap.get(r.store_id)?.name || '—';
				const staffName = r.staff_is_system
					? '—'
					: staffMap.get(r.staff_id)?.name || '—';
				const pending = pendingRowIds.has(r.id);
				return (
					<li
						key={r.id}
						className={`smb-reservation-card ${pending ? 'is-pending' : ''}`}
					>
						<button
							type="button"
							className="smb-reservation-card__body"
							onClick={() => onOpenDetail(r)}
							aria-label={`予約 #${r.id} ${r.customer_name || ''} の詳細を開く`}
						>
							<div className="smb-reservation-card__top">
								<span className="smb-reservation-card__id">#{r.id}</span>
								<StatusBadge status={r.status} />
							</div>
							<div className="smb-reservation-card__name">{r.customer_name || '（名前なし）'}</div>
							<div className="smb-reservation-card__meta">
								<span className="smb-reservation-card__date">
									{r.schedule_date}
									{r.schedule_time && ' ' + String(r.schedule_time).slice(0, 5)}
								</span>
								<span className="smb-reservation-card__store">
									{storeName} / {staffName}
								</span>
							</div>
						</button>
						<div className="smb-reservation-card__actions">
							{r.status === 'pending' && (
								<button
									type="button"
									className="smb-row-btn smb-row-btn--success"
									onClick={() => onApprove(r)}
									disabled={pending}
								>
									承認
								</button>
							)}
							{r.status !== 'cancelled' && (
								<button
									type="button"
									className="smb-row-btn"
									onClick={() => onCancel(r)}
									disabled={pending}
								>
									キャンセル
								</button>
							)}
							<button
								type="button"
								className="smb-row-btn smb-row-btn--danger"
								onClick={() => onDelete(r)}
								disabled={pending}
								aria-label={`予約 #${r.id} を削除`}
							>
								削除
							</button>
						</div>
					</li>
				);
			})}
		</ul>
	);
}
