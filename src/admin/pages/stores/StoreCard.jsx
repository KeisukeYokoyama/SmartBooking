/**
 * 店舗カード。アバター（画像）+ 基本情報 + 有効/無効スイッチ + 並び替えハンドル + 操作ボタン。
 */
import Switch from '../../components/Switch';

export default function StoreCard({
	store,
	index,
	total,
	onEdit,
	onDelete,
	onToggleActive,
	onMoveUp,
	onMoveDown,
}) {
	const address = [store.prefecture, store.city, store.address_line].filter(Boolean).join(' ');
	return (
		<article
			className={`smb-card ${store.is_active ? '' : 'is-inactive'}`}
			aria-label={`店舗 ${store.name}`}
		>
			<div
				className="smb-card__swatch"
				style={{ backgroundColor: store.calendar_color || '#94a3b8' }}
				aria-hidden="true"
			/>
			<div className="smb-card__media">
				{store.image_url ? (
					<img src={store.image_url} alt="" />
				) : (
					<div className="smb-card__placeholder" aria-hidden="true">
						<span>{(store.name || '?').slice(0, 1)}</span>
					</div>
				)}
			</div>
			<div className="smb-card__body">
				<h3 className="smb-card__title">{store.name}</h3>
				<dl className="smb-card__meta">
					{address && (
						<>
							<dt className="smb-sr-only">住所</dt>
							<dd>{address}</dd>
						</>
					)}
					{store.phone && (
						<>
							<dt className="smb-sr-only">電話</dt>
							<dd>{store.phone}</dd>
						</>
					)}
					{store.email && (
						<>
							<dt className="smb-sr-only">メール</dt>
							<dd>{store.email}</dd>
						</>
					)}
				</dl>
			</div>
			<div className="smb-card__side">
				<Switch
					checked={!!store.is_active}
					onChange={(v) => onToggleActive(store, v)}
					label={store.is_active ? '有効' : '無効'}
				/>
				<div className="smb-card__reorder" role="group" aria-label="表示順の移動">
					<button
						type="button"
						className="smb-icon-btn"
						aria-label="上に移動"
						disabled={index === 0}
						onClick={() => onMoveUp(store, index)}
					>
						<span aria-hidden="true">↑</span>
					</button>
					<button
						type="button"
						className="smb-icon-btn"
						aria-label="下に移動"
						disabled={index >= total - 1}
						onClick={() => onMoveDown(store, index)}
					>
						<span aria-hidden="true">↓</span>
					</button>
				</div>
				<div className="smb-card__actions">
					<button type="button" className="smb-link-btn" onClick={() => onEdit(store)}>
						編集
					</button>
					<button
						type="button"
						className="smb-link-btn smb-link-btn--danger"
						onClick={() => onDelete(store)}
					>
						削除
					</button>
				</div>
			</div>
		</article>
	);
}
