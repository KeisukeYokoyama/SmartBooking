/**
 * 店舗選択ステップ。
 *
 * state.stores（is_active=1 のみ）をカード形式で表示する。
 * クリックで `SET_STORE` を dispatch し、次のステップへ進める。
 *
 * スキップルール:
 *   - 店舗が 1 件のみ / fixedStoreId 指定時は App 側で既にスキップされるため、
 *     このコンポーネントは「2 件以上ある」前提で描画する。
 *
 * UI 設計（card-unification）:
 *   - 高さ揃えのため、外側 `<li>` を flex item とし、card は width/height 100%。
 *   - 画像は左側に正方形サムネイル（72px）。未設定時はプレースホルダ。
 *   - 説明・住所・電話番号は 2 行 ellipsis。情報量差で高さがガタつかない。
 *   - 「選ぶ→」CTA テキストは廃止。カード全体がクリッカブルで、ホバー時に視覚変化。
 */
import { useEffect } from 'react';
import StepHeader from '../components/StepHeader';
import { pushBookingEvent } from '../utils/analytics';

function formatAddress(store) {
	return [store.prefecture, store.city, store.address_line]
		.filter(Boolean)
		.join(' ');
}

export default function StoreSelect({ stores, onSelect }) {
	useEffect(() => {
		pushBookingEvent('store_select');
	}, []);

	return (
		<div className="smb-front-step">
			<StepHeader title="店舗を選択" subtitle="ご予約いただく店舗をお選びください。" />
			{stores.length === 0 ? (
				<p className="smb-front-empty">現在、予約可能な店舗がありません。</p>
			) : (
				<ul className="smb-front-cards" role="list">
					{stores.map((store) => {
						const address = formatAddress(store);
						return (
							<li key={store.id} className="smb-front-cards__item">
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
										{(address || store.phone) && (
											<dl className="smb-front-card__meta">
												{address && (
													<>
														<dt>住所</dt>
														<dd>{address}</dd>
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
								</button>
							</li>
						);
					})}
				</ul>
			)}
		</div>
	);
}
