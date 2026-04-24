/**
 * 空状態の表示コンポーネント。
 *
 * 「データなし」「検索結果なし」「初回利用時」を分かりやすく伝え、
 * 次の行動を促す CTA ボタンを配置できる。
 */
export default function EmptyState({ icon, title, description, action }) {
	return (
		<div className="smb-empty" role="status">
			{icon && (
				<div className="smb-empty__icon" aria-hidden="true">
					{icon}
				</div>
			)}
			<h3 className="smb-empty__title">{title}</h3>
			{description && <p className="smb-empty__description">{description}</p>}
			{action && <div className="smb-empty__action">{action}</div>}
		</div>
	);
}
