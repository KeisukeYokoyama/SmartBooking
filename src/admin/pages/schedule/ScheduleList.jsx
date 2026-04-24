/**
 * カレンダー下の「選択月のスケジュール一覧」。
 *
 * 日付ごとにグルーピングし、店舗×担当者ごとの時間枠テーブルを表示する。
 * 参考: docs/reference-ui/screenshot-2.png 下部のテーブル。
 */
import { formatFullDate, fromYmd } from './dateUtils';

export default function ScheduleList({ schedules, storesById, staffById, onEdit, onCopy, onDelete }) {
	if (!schedules || schedules.length === 0) {
		return (
			<div className="smb-schedule-list smb-schedule-list--empty">
				<p>この月にはまだスケジュールがありません。カレンダーから日付を選んで追加してください。</p>
			</div>
		);
	}

	// 日付 → 店舗×担当者 → slots でグルーピング.
	const byDate = new Map();
	schedules.forEach((s) => {
		if (!byDate.has(s.schedule_date)) byDate.set(s.schedule_date, new Map());
		const dateGroups = byDate.get(s.schedule_date);
		const key = `${s.store_id}:${s.staff_id}`;
		if (!dateGroups.has(key)) {
			dateGroups.set(key, { store_id: s.store_id, staff_id: s.staff_id, slots: [] });
		}
		dateGroups.get(key).slots.push(s);
	});

	const sortedDates = Array.from(byDate.keys()).sort();

	return (
		<section className="smb-schedule-list" aria-label="選択月のスケジュール一覧">
			{sortedDates.map((ymd) => {
				const dateObj = fromYmd(ymd);
				const label = dateObj ? formatFullDate(dateObj) : ymd;
				const groups = Array.from(byDate.get(ymd).values());
				return (
					<div key={ymd} className="smb-schedule-list__day">
						<h3 className="smb-schedule-list__date">{label}</h3>
						{groups.map((g) => {
							const store = storesById.get(g.store_id);
							const staff = staffById.get(g.staff_id);
							const slots = [...g.slots].sort((a, b) =>
								(a.start_time || '').localeCompare(b.start_time || '')
							);
							return (
								<div key={`${g.store_id}:${g.staff_id}`} className="smb-schedule-list__group">
									<div
										className="smb-schedule-list__color"
										style={{ backgroundColor: store?.calendar_color || '#2271b1' }}
										aria-hidden="true"
									/>
									<div className="smb-schedule-list__meta">
										<div>
											<strong>{store?.name || `店舗ID ${g.store_id}`}</strong>
											<span className="smb-schedule-list__staff">
												/ {staff?.name || `担当者ID ${g.staff_id}`}
											</span>
										</div>
										<div className="smb-schedule-list__actions">
											<button
												type="button"
												className="smb-link-btn"
												onClick={() => onEdit(g, ymd)}
											>
												編集
											</button>
											<button
												type="button"
												className="smb-link-btn"
												onClick={() => onCopy(g, ymd)}
											>
												コピー
											</button>
											<button
												type="button"
												className="smb-link-btn smb-link-btn--danger"
												onClick={() => onDelete(g, ymd)}
											>
												削除
											</button>
										</div>
									</div>
									<table className="smb-schedule-table">
										<thead>
											<tr>
												<th>開始</th>
												<th>終了</th>
												<th>定員</th>
												<th>予約</th>
												<th>残り</th>
												<th>状態</th>
											</tr>
										</thead>
										<tbody>
											{slots.map((s) => {
												const remaining = Number(s.capacity) - Number(s.booked_count);
												let status = '受付中';
												let tone = 'ok';
												if (!s.is_active) {
													status = '停止中';
													tone = 'inactive';
												} else if (remaining <= 0) {
													status = '満席';
													tone = 'full';
												} else if (remaining <= Math.ceil(s.capacity * 0.2)) {
													status = '残りわずか';
													tone = 'warn';
												}
												return (
													<tr key={s.id} className={`is-${tone}`}>
														<td>{(s.start_time || '').slice(0, 5)}</td>
														<td>{(s.end_time || '').slice(0, 5)}</td>
														<td>{s.capacity}</td>
														<td>{s.booked_count}</td>
														<td>{remaining}</td>
														<td>
															<span className={`smb-schedule-table__status is-${tone}`}>
																{status}
															</span>
														</td>
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
							);
						})}
					</div>
				);
			})}
		</section>
	);
}
