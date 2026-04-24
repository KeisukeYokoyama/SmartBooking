/**
 * 予約一覧のテーブル表示（デスクトップ向け）。
 *
 * - ソート可能列: id / schedule_date / schedule_time / customer_name / status / created_at
 * - 行クリックで詳細モーダル
 * - 行の右端にクイックアクション（承認 / キャンセル / 削除）
 *
 * モバイル幅では親コンポーネントが ReservationCardList に切替える。
 */
import StatusBadge from './StatusBadge';

const SORTABLE_COLUMNS = new Set([
	'id',
	'schedule_date',
	'customer_name',
	'status',
	'created_at',
]);

function SortIndicator({ active, direction }) {
	if (!active) {
		return (
			<span className="smb-table__sort-icon" aria-hidden="true">
				⇅
			</span>
		);
	}
	return (
		<span className="smb-table__sort-icon is-active" aria-hidden="true">
			{direction === 'asc' ? '▲' : '▼'}
		</span>
	);
}

function formatDateTime(dateStr, timeStr) {
	if (!dateStr) return '—';
	// schedule_time は 'HH:MM:SS' で入ってくるため HH:MM に整える.
	const time = timeStr ? String(timeStr).slice(0, 5) : '';
	return (
		<span className="smb-table__datetime">
			<span className="smb-table__date">{dateStr}</span>
			{time && <span className="smb-table__time">{time}</span>}
		</span>
	);
}

function formatCreatedAt(s) {
	if (!s) return '—';
	// DATETIME 'YYYY-MM-DD HH:MM:SS' → そのまま返すが改行.
	return (
		<span className="smb-table__created">
			<span>{s.slice(0, 10)}</span>
			<span className="smb-table__created-time">{s.slice(11, 16)}</span>
		</span>
	);
}

export default function ReservationTable({
	items,
	storeMap,
	staffMap,
	sort,
	onSort,
	onOpenDetail,
	onApprove,
	onCancel,
	onDelete,
	pendingRowIds = new Set(),
}) {
	const sortableHeader = (key, label) => {
		const active = sort.orderby === key;
		return (
			<th scope="col" className="smb-table__th smb-table__th--sortable">
				<button
					type="button"
					className="smb-table__sort-btn"
					onClick={() => onSort(key)}
					aria-sort={
						active ? (sort.order === 'asc' ? 'ascending' : 'descending') : 'none'
					}
				>
					<span>{label}</span>
					<SortIndicator active={active} direction={sort.order} />
				</button>
			</th>
		);
	};

	return (
		<div className="smb-table-wrapper" role="region" aria-label="予約一覧">
			<table className="smb-table smb-table--reservations">
				<thead>
					<tr>
						{sortableHeader('id', '予約番号')}
						{sortableHeader('schedule_date', '予約日時')}
						{sortableHeader('customer_name', '予約者')}
						<th scope="col" className="smb-table__th">
							連絡先
						</th>
						<th scope="col" className="smb-table__th">
							店舗 / 担当者
						</th>
						{sortableHeader('status', 'ステータス')}
						{sortableHeader('created_at', '受付日時')}
						<th scope="col" className="smb-table__th smb-table__th--actions">
							<span className="smb-sr-only">操作</span>
						</th>
					</tr>
				</thead>
				<tbody>
					{items.map((r) => {
						const storeName = storeMap.get(r.store_id)?.name || '—';
						const staffName = staffMap.get(r.staff_id)?.name || '—';
						const pending = pendingRowIds.has(r.id);
						return (
							<tr
								key={r.id}
								className={`smb-table__row ${pending ? 'is-pending' : ''}`}
							>
								<td className="smb-table__td smb-table__td--id">
									<button
										type="button"
										className="smb-table__link"
										onClick={() => onOpenDetail(r)}
										aria-label={`予約番号 #${r.id} の詳細を開く`}
									>
										#{r.id}
									</button>
								</td>
								<td className="smb-table__td">
									{formatDateTime(r.schedule_date, r.schedule_time)}
								</td>
								<td className="smb-table__td">
									<button
										type="button"
										className="smb-table__link smb-table__link--name"
										onClick={() => onOpenDetail(r)}
									>
										{r.customer_name || '（名前なし）'}
									</button>
								</td>
								<td className="smb-table__td">
									<div className="smb-table__contact">
										<span>{r.customer_email || '—'}</span>
										{r.customer_phone && (
											<span className="smb-table__contact-sub">{r.customer_phone}</span>
										)}
									</div>
								</td>
								<td className="smb-table__td">
									<div className="smb-table__store">
										<span>{storeName}</span>
										<span className="smb-table__store-sub">{staffName}</span>
									</div>
								</td>
								<td className="smb-table__td">
									<StatusBadge status={r.status} />
								</td>
								<td className="smb-table__td">{formatCreatedAt(r.created_at)}</td>
								<td className="smb-table__td smb-table__td--actions">
									<div className="smb-table__actions">
										<button
											type="button"
											className="smb-row-btn smb-row-btn--primary"
											onClick={() => onOpenDetail(r)}
											title="詳細"
										>
											詳細
										</button>
										{r.status === 'pending' && (
											<button
												type="button"
												className="smb-row-btn smb-row-btn--success"
												onClick={() => onApprove(r)}
												disabled={pending}
												title="承認する"
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
												title="キャンセルにする"
											>
												キャンセル
											</button>
										)}
										<button
											type="button"
											className="smb-row-btn smb-row-btn--danger"
											onClick={() => onDelete(r)}
											disabled={pending}
											title="削除"
											aria-label={`予約 #${r.id} を削除`}
										>
											削除
										</button>
									</div>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

export { SORTABLE_COLUMNS };
