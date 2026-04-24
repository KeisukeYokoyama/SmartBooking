/**
 * 担当者カード。
 */
import Switch from '../../components/Switch';

export default function StaffCard({
	staff,
	storeName,
	index,
	total,
	onEdit,
	onDelete,
	onToggleActive,
	onMoveUp,
	onMoveDown,
}) {
	return (
		<article
			className={`smb-card ${staff.is_active ? '' : 'is-inactive'}`}
			aria-label={`担当者 ${staff.name}`}
		>
			<div className="smb-card__media">
				{staff.image_url ? (
					<img src={staff.image_url} alt="" />
				) : (
					<div className="smb-card__placeholder smb-card__placeholder--round" aria-hidden="true">
						<span>{(staff.name || '?').slice(0, 1)}</span>
					</div>
				)}
			</div>
			<div className="smb-card__body">
				<h3 className="smb-card__title">{staff.name}</h3>
				<dl className="smb-card__meta">
					{storeName && (
						<>
							<dt className="smb-sr-only">所属</dt>
							<dd className="smb-chip">{storeName}</dd>
						</>
					)}
					{staff.email && (
						<>
							<dt className="smb-sr-only">メール</dt>
							<dd>{staff.email}</dd>
						</>
					)}
					{staff.phone && (
						<>
							<dt className="smb-sr-only">電話</dt>
							<dd>{staff.phone}</dd>
						</>
					)}
				</dl>
			</div>
			<div className="smb-card__side">
				<Switch
					checked={!!staff.is_active}
					onChange={(v) => onToggleActive(staff, v)}
					label={staff.is_active ? '有効' : '無効'}
				/>
				<div className="smb-card__reorder" role="group" aria-label="表示順の移動">
					<button
						type="button"
						className="smb-icon-btn"
						aria-label="上に移動"
						disabled={index === 0}
						onClick={() => onMoveUp(staff, index)}
					>
						<span aria-hidden="true">↑</span>
					</button>
					<button
						type="button"
						className="smb-icon-btn"
						aria-label="下に移動"
						disabled={index >= total - 1}
						onClick={() => onMoveDown(staff, index)}
					>
						<span aria-hidden="true">↓</span>
					</button>
				</div>
				<div className="smb-card__actions">
					<button type="button" className="smb-link-btn" onClick={() => onEdit(staff)}>
						編集
					</button>
					<button
						type="button"
						className="smb-link-btn smb-link-btn--danger"
						onClick={() => onDelete(staff)}
					>
						削除
					</button>
				</div>
			</div>
		</article>
	);
}
