/**
 * 選択月のスケジュール一覧（テーブル形式）。
 *
 * WordPress 管理画面標準の wp-list-table 風レイアウト。
 * 列: 日付 / 時間 / 店舗 / 担当者 / 定員 / 予約 / 状態 / 操作
 * 並び順: 日付昇順 → 開始時刻昇順
 *
 * 操作カラムは「店舗×担当者×日付」のグループ単位で 編集 / コピー / 削除 を呼ぶ
 * （既存の親ハンドラ openEdit/openCopy/askDelete のシグネチャに合わせる）。
 */
import { formatFullDate, fromYmd } from './dateUtils';

function statusOf(slot) {
	const remaining = Number(slot.capacity) - Number(slot.booked_count);
	if (!slot.is_active) return { label: '停止中', tone: 'inactive' };
	if (remaining <= 0) return { label: '満席', tone: 'full' };
	if (remaining <= Math.ceil(slot.capacity * 0.2))
		return { label: '残りわずか', tone: 'warn' };
	return { label: '受付中', tone: 'ok' };
}

export default function ScheduleList({
	schedules,
	storesById,
	staffById,
	onEdit,
	onCopy,
	onDelete,
}) {
	if (!schedules || schedules.length === 0) {
		return (
			<div className="smb-schedule-list smb-schedule-list--empty">
				<p>
					この月にはまだスケジュールがありません。カレンダーから日付を選んで追加してください。
				</p>
			</div>
		);
	}

	// ソート: 日付昇順 → 開始時刻昇順.
	const sorted = [...schedules].sort((a, b) => {
		const da = a.schedule_date || '';
		const db = b.schedule_date || '';
		if (da !== db) return da < db ? -1 : 1;
		const ta = (a.start_time || '').localeCompare(b.start_time || '');
		return ta;
	});

	// グループ単位（店舗×担当者×日付）で操作ハンドラに渡せるよう、行ごとに group オブジェクトを作る.
	const groupsByKey = new Map();
	sorted.forEach((s) => {
		const key = `${s.schedule_date}:${s.store_id}:${s.staff_id}`;
		if (!groupsByKey.has(key)) {
			groupsByKey.set(key, {
				store_id: s.store_id,
				staff_id: s.staff_id,
				slots: [],
			});
		}
		groupsByKey.get(key).slots.push(s);
	});

	// 同一グループ内の最初の行にのみ「日付」を出す（rowSpan 風の視認性向上）。
	let lastDate = null;
	let lastGroupKey = null;

	return (
		<div className="smb-schedule-table-wrap smb-data-list">
			<table className="smb-schedule-table-flat widefat striped">
				<thead>
					<tr>
						<th scope="col" className="smb-col-date">日付</th>
						<th scope="col" className="smb-col-time">時間</th>
						<th scope="col" className="smb-col-store">店舗</th>
						<th scope="col" className="smb-col-staff">担当者</th>
						<th scope="col" className="smb-col-num">定員</th>
						<th scope="col" className="smb-col-num">予約</th>
						<th scope="col" className="smb-col-status">状態</th>
						<th scope="col" className="smb-col-actions">操作</th>
					</tr>
				</thead>
				<tbody>
					{sorted.map((s) => {
						const dateObj = fromYmd(s.schedule_date);
						const dateLabel = dateObj ? formatFullDate(dateObj) : s.schedule_date;
						const showDate = s.schedule_date !== lastDate;
						lastDate = s.schedule_date;

						const store = storesById.get(s.store_id);
						const staff = staffById.get(s.staff_id);
						const isSystemStore = !store;
						const isSystemStaff = !staff;
						const storeLabel = isSystemStore ? '—' : store.name;
						const storeColor = store?.calendar_color || '#2271b1';
						const staffLabel = isSystemStaff ? '—' : staff.name;

						const status = statusOf(s);
						const start = (s.start_time || '').slice(0, 5);
						const end = (s.end_time || '').slice(0, 5);

						const groupKey = `${s.schedule_date}:${s.store_id}:${s.staff_id}`;
						// 同一グループの「最初の行」にのみ操作ボタンを出す（行が分散して操作しやすいため）.
						const isFirstOfGroup = groupKey !== lastGroupKey;
						lastGroupKey = groupKey;
						const group = groupsByKey.get(groupKey);

						return (
							<tr key={s.id} className={`smb-schedule-row is-${status.tone}`}>
								<td className="smb-col-date">
									{showDate && (
										<span className="smb-schedule-row__date">{dateLabel}</span>
									)}
								</td>
								<td className="smb-col-time">
									<span className="smb-schedule-row__time">
										{start}
										<span aria-hidden="true"> – </span>
										{end}
									</span>
								</td>
								<td className="smb-col-store">
									<span
										className="smb-schedule-row__color"
										style={{ backgroundColor: storeColor }}
										aria-hidden="true"
									/>
									<span className="smb-schedule-row__store">{storeLabel}</span>
								</td>
								<td className="smb-col-staff">{staffLabel}</td>
								<td className="smb-col-num">{s.capacity}</td>
								<td className="smb-col-num">{s.booked_count}</td>
								<td className="smb-col-status">
									<span
										className={`smb-schedule-table__status is-${status.tone}`}
									>
										{status.label}
									</span>
								</td>
								<td className="smb-col-actions">
									{isFirstOfGroup && (
										<div className="smb-schedule-row__actions">
											<button
												type="button"
												className="smb-link-btn"
												onClick={() => onEdit(group, s.schedule_date)}
												aria-label={`${dateLabel} ${storeLabel} を編集`}
											>
												編集
											</button>
											<button
												type="button"
												className="smb-link-btn"
												onClick={() => onCopy(group, s.schedule_date)}
												aria-label={`${dateLabel} ${storeLabel} をコピー`}
											>
												コピー
											</button>
											<button
												type="button"
												className="smb-link-btn smb-link-btn--danger"
												onClick={() => onDelete(group, s.schedule_date)}
												aria-label={`${dateLabel} ${storeLabel} を削除`}
											>
												削除
											</button>
										</div>
									)}
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
