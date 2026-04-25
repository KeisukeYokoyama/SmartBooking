/**
 * 担当者選択ステップ。
 *
 * state.staff を storeId でフィルタしてカード形式で表示する。
 * クリックで `SET_STAFF` を dispatch し、次のステップへ進める。
 *
 * スキップルール:
 *   - 担当者が 1 名のみ / storeId に紐づく担当者が 0 の場合は App 側でハンドリング済み。
 */
import StepHeader from '../components/StepHeader';

export default function StaffSelect({ staff, storeId, onSelect, onBack }) {
	const filtered = staff.filter((s) => s.store_id === storeId);

	return (
		<div className="smb-front-step">
			<StepHeader
				title="担当者を選択"
				subtitle="ご希望の担当者をお選びください。"
				onBack={onBack}
			/>
			{filtered.length === 0 ? (
				<p className="smb-front-empty">予約可能な担当者がいません。</p>
			) : (
				<ul className="smb-front-cards" role="list">
					{filtered.map((member) => (
						<li key={member.id}>
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
