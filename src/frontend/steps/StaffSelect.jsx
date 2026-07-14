/**
 * 担当者選択ステップ。
 *
 * state.staff を storeId でフィルタしてカード形式で表示する。
 * クリックで `SET_STAFF` を dispatch し、次のステップへ進める。
 *
 * スキップルール:
 *   - 担当者が 1 名のみ / storeId に紐づく担当者が 0 の場合は App 側でハンドリング済み。
 *
 * UI 設計（card-unification）: StoreSelect と同方針。
 *   - プロフィール画像は円形（72px）、未設定時はイニシャル。
 *   - 紹介文は 2 行 ellipsis。
 *   - 「選ぶ→」CTA は廃止。カード全体クリッカブル + ホバー視覚変化。
 */
import { useEffect } from 'react';
import StepHeader from '../components/StepHeader';
import { pushBookingEvent } from '../utils/analytics';

export default function StaffSelect({ staff, storeId, staffLabel = '担当者', onSelect, onBack }) {
	useEffect(() => {
		pushBookingEvent('staff_select');
	}, []);

	const filtered = staff.filter((s) => s.store_id === storeId);

	return (
		<div className="smb-front-step">
			<StepHeader
				title={`${staffLabel}を選択`}
				subtitle={`ご希望の${staffLabel}をお選びください。`}
				onBack={onBack}
			/>
			{filtered.length === 0 ? (
				<p className="smb-front-empty">{`予約可能な${staffLabel}がいません。`}</p>
			) : (
				<ul className="smb-front-cards" role="list">
					{filtered.map((member) => (
						<li key={member.id} className="smb-front-cards__item">
							<button
								type="button"
								className="smb-front-card"
								onClick={() => onSelect(member.id)}
								aria-label={`${member.name} を選択`}
							>
								{member.image_url ? (
									<div className="smb-front-card__media smb-front-card__media--avatar">
										<img src={member.image_url} alt="" loading="lazy" />
									</div>
								) : (
									<div
										className="smb-front-card__media smb-front-card__media--avatar smb-front-card__media--placeholder"
										aria-hidden="true"
									>
										{member.name.charAt(0)}
									</div>
								)}
								<div className="smb-front-card__body">
									<div className="smb-front-card__name">{member.name}</div>
									{member.description && (
										<p className="smb-front-card__desc">{member.description}</p>
									)}
								</div>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
