/**
 * 店舗選択ステップ。
 *
 * state.stores（is_active=1 のみ）をカード形式で表示する。
 * クリックで `SET_STORE` を dispatch し、次のステップへ進める。
 *
 * スキップルール:
 *   - 店舗が 1 件のみ / fixedStoreId 指定時は App 側で既にスキップされるため、
 *     このコンポーネントは「2 件以上ある」前提で描画する。
 */
import StepHeader from '../components/StepHeader';

export default function StoreSelect({ stores, onSelect }) {
	return (
		<div className="smb-front-step">
			<StepHeader title="店舗を選択" subtitle="ご予約いただく店舗をお選びください。" />
			{stores.length === 0 ? (
				<p className="smb-front-empty">現在、予約可能な店舗がありません。</p>
			) : (
				<ul className="smb-front-cards" role="list">
					{stores.map((store) => (
						<li key={store.id}>
							<button
								type="button"
								className="smb-front-card"
								onClick={() => onSelect(store.id)}
								aria-label={`${store.name} を選択`}
							>
								{store.image_url ? (
									<div className="smb-front-card__media">
										<img src={store.image_url} alt="" loading="lazy" />
									</div>
								) : (
									<div
										className="smb-front-card__media smb-front-card__media--placeholder"
										aria-hidden="true"
										style={{
											background:
												store.calendar_color || 'var(--smb-front-muted-bg)',
										}}
									/>
								)}
								<div className="smb-front-card__body">
									<div className="smb-front-card__name">{store.name}</div>
									{store.description && (
										<p className="smb-front-card__desc">{store.description}</p>
									)}
									{(store.prefecture ||
										store.city ||
										store.address_line ||
										store.phone) && (
										<dl className="smb-front-card__meta">
											{(store.prefecture ||
												store.city ||
												store.address_line) && (
												<>
													<dt>住所</dt>
													<dd>
														{[
															store.prefecture,
															store.city,
															store.address_line,
														]
															.filter(Boolean)
															.join(' ')}
													</dd>
												</>
											)}
											{store.phone && (
												<>
													<dt>電話</dt>
													<dd>{store.phone}</dd>
												</>
											)}
										</dl>
									)}
								</div>
								<span
									className="smb-front-card__cta"
									aria-hidden="true"
								>
									選ぶ →
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
