/**
 * 設定ページ共通のタブナビ。
 *
 * 未保存バッジ（tab ごと）を表示できるのが特徴。旧UIにはない改善点で、
 * 「どのタブに編集中の変更があるか」をユーザーに視覚的に伝える。
 */
export default function TabNav({ tabs, activeKey, onChange, dirtyKeys = [] }) {
	return (
		<div className="smb-tabs" role="tablist">
			{tabs.map((t) => {
				const active = t.key === activeKey;
				const dirty = dirtyKeys.includes(t.key);
				return (
					<button
						key={t.key}
						type="button"
						role="tab"
						aria-selected={active}
						className={`smb-tab ${active ? 'is-active' : ''}`}
						onClick={() => onChange(t.key)}
					>
						<span>{t.label}</span>
						{dirty && (
							<span
								className="smb-tab__dirty"
								aria-label="未保存の変更あり"
								title="未保存の変更があります"
							/>
						)}
					</button>
				);
			})}
		</div>
	);
}
