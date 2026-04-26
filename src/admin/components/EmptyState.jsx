/**
 * 空状態の表示コンポーネント。
 *
 * 「データなし」「検索結果なし」「初回利用時」を分かりやすく伝え、
 * 次の行動を促す CTA ボタンを配置できる。
 *
 * 表示は全体中央揃え。アイコンは扱わない（旧 icon プロップは廃止）。
 */
export default function EmptyState({ title, description, action }) {
	return (
		<div className="smb-empty" role="status">
			<h3 className="smb-empty__title">{title}</h3>
			{description && <p className="smb-empty__description">{description}</p>}
			{action && <div className="smb-empty__action">{action}</div>}
		</div>
	);
}
