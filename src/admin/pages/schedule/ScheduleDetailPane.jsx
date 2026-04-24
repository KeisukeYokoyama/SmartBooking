/**
 * 選択中の日付のスケジュール詳細パネル。
 *
 * カレンダーの右側（モバイルでは下）に表示する。
 * - 選択中の日付（大きく表示）
 * - その日の店舗ごとスケジュールグループ
 *   - 店舗名 + 担当者 + カラーバッジ
 *   - 時間枠ごとの行（開始時間、定員、予約数、利用可能/停止）
 *   - グループごとに「編集」「コピー」ボタン
 * - 日付全体に「この日に追加」ボタン
 */
import Button from '../../components/Button';
import { formatFullDate, fromYmd } from './dateUtils';

export default function ScheduleDetailPane({
	selectedYmd,
	daySchedules,
	storesById,
	staffById,
	onAdd,
	onEdit,
	onCopy,
	onDelete,
}) {
	if (!selectedYmd) {
		return (
			<aside className="smb-schedule-pane smb-schedule-pane--empty" aria-live="polite">
				<div className="smb-schedule-pane__placeholder">
					<span className="smb-schedule-pane__placeholder-icon" aria-hidden="true">
						📅
					</span>
					<p className="smb-schedule-pane__placeholder-title">日付を選択してください</p>
					<p className="smb-schedule-pane__placeholder-text">
						カレンダーから日付をクリックすると、その日のスケジュールを表示・編集できます。
					</p>
				</div>
			</aside>
		);
	}

	const dateObj = fromYmd(selectedYmd);
	const dateLabel = dateObj ? formatFullDate(dateObj) : selectedYmd;

	// 店舗×担当者でグループ化.
	const groupsMap = new Map();
	(daySchedules || []).forEach((s) => {
		const key = `${s.store_id}:${s.staff_id}`;
		if (!groupsMap.has(key)) {
			groupsMap.set(key, {
				store_id: s.store_id,
				staff_id: s.staff_id,
				slots: [],
			});
		}
		groupsMap.get(key).slots.push(s);
	});
	const groups = Array.from(groupsMap.values());

	return (
		<aside className="smb-schedule-pane" aria-label="選択日のスケジュール">
			<header className="smb-schedule-pane__header">
				<div>
					<p className="smb-schedule-pane__eyebrow">選択中の日付</p>
					<h2 className="smb-schedule-pane__date">{dateLabel}</h2>
				</div>
				<Button variant="primary" size="sm" icon="＋" onClick={() => onAdd(selectedYmd)}>
					この日に追加
				</Button>
			</header>

			{groups.length === 0 ? (
				<div className="smb-schedule-pane__empty">
					<p>この日のスケジュールはまだ登録されていません。</p>
					<Button variant="secondary" size="sm" onClick={() => onAdd(selectedYmd)}>
						スケジュールを追加
					</Button>
				</div>
			) : (
				<ul className="smb-schedule-pane__groups" role="list">
					{groups.map((g) => {
						const store = storesById.get(g.store_id);
						const staff = staffById.get(g.staff_id);
						const slots = [...g.slots].sort((a, b) =>
							(a.start_time || '').localeCompare(b.start_time || '')
						);
						const totalCap = slots.reduce((sum, s) => sum + Number(s.capacity || 0), 0);
						const totalBooked = slots.reduce(
							(sum, s) => sum + Number(s.booked_count || 0),
							0
						);
						return (
							<li key={`${g.store_id}:${g.staff_id}`} className="smb-schedule-group">
								<div
									className="smb-schedule-group__bar"
									style={{ backgroundColor: store?.calendar_color || '#2271b1' }}
									aria-hidden="true"
								/>
								<div className="smb-schedule-group__body">
									<div className="smb-schedule-group__head">
										<div>
											<h3 className="smb-schedule-group__store">
												{store?.name || `店舗ID ${g.store_id}`}
											</h3>
											<p className="smb-schedule-group__staff">
												担当: {staff?.name || `担当者ID ${g.staff_id}`}
											</p>
										</div>
										<div className="smb-schedule-group__actions">
											<button
												type="button"
												className="smb-link-btn"
												onClick={() => onEdit(g)}
											>
												編集
											</button>
											<button
												type="button"
												className="smb-link-btn"
												onClick={() => onCopy(g)}
											>
												コピー
											</button>
											<button
												type="button"
												className="smb-link-btn smb-link-btn--danger"
												onClick={() => onDelete(g)}
											>
												削除
											</button>
										</div>
									</div>

									<ul className="smb-slot-list" role="list">
										{slots.map((slot) => {
											const remaining =
												Number(slot.capacity) - Number(slot.booked_count);
											let tone = 'ok';
											if (!slot.is_active) tone = 'inactive';
											else if (remaining <= 0) tone = 'full';
											else if (remaining <= Math.ceil(slot.capacity * 0.2)) tone = 'warn';
											return (
												<li key={slot.id} className={`smb-slot smb-slot--${tone}`}>
													<span className="smb-slot__time">
														{(slot.start_time || '').slice(0, 5)}
														<span className="smb-slot__time-range">
															〜{(slot.end_time || '').slice(0, 5)}
														</span>
													</span>
													<span className="smb-slot__capacity">
														{slot.booked_count} / {slot.capacity}
													</span>
													<span className="smb-slot__status">
														{tone === 'inactive' && '停止中'}
														{tone === 'full' && '満席'}
														{tone === 'warn' && `残り${remaining}`}
														{tone === 'ok' && `残り${remaining}`}
													</span>
												</li>
											);
										})}
									</ul>

									<p className="smb-schedule-group__totals">
										合計: {slots.length}枠 / 予約 {totalBooked} / 定員 {totalCap}
									</p>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</aside>
	);
}
