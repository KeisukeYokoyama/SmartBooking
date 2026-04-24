/**
 * シンプルなページネーション。
 *
 * - 現在ページ中心に最大 5 つの番号を表示
 * - 先頭 / 末尾ボタン
 * - 総件数が 0 のときは null を返す
 */

function buildPages(current, last) {
	const pages = [];
	const window = 2;
	const start = Math.max(1, current - window);
	const end = Math.min(last, current + window);

	if (start > 1) {
		pages.push(1);
		if (start > 2) pages.push('…');
	}
	for (let p = start; p <= end; p += 1) pages.push(p);
	if (end < last) {
		if (end < last - 1) pages.push('…');
		pages.push(last);
	}
	return pages;
}

export default function Pagination({ page, perPage, total, onChange }) {
	const last = Math.max(1, Math.ceil(total / perPage));
	if (total === 0) return null;

	const pages = buildPages(page, last);

	const go = (target) => {
		if (typeof target !== 'number') return;
		const next = Math.min(Math.max(1, target), last);
		if (next !== page) onChange(next);
	};

	const from = (page - 1) * perPage + 1;
	const to = Math.min(page * perPage, total);

	return (
		<nav className="smb-pagination" aria-label="ページ送り">
			<span className="smb-pagination__summary">
				{total.toLocaleString()} 件中 {from.toLocaleString()}–{to.toLocaleString()} 件
			</span>
			<div className="smb-pagination__nav" role="group">
				<button
					type="button"
					className="smb-pagination__btn"
					onClick={() => go(page - 1)}
					disabled={page <= 1}
					aria-label="前のページ"
				>
					‹
				</button>
				{pages.map((p, i) =>
					typeof p === 'number' ? (
						<button
							type="button"
							key={`p-${p}`}
							className={`smb-pagination__btn ${p === page ? 'is-current' : ''}`}
							onClick={() => go(p)}
							aria-current={p === page ? 'page' : undefined}
							aria-label={`${p} ページ目`}
						>
							{p}
						</button>
					) : (
						<span key={`e-${i}`} className="smb-pagination__ellipsis" aria-hidden="true">
							…
						</span>
					)
				)}
				<button
					type="button"
					className="smb-pagination__btn"
					onClick={() => go(page + 1)}
					disabled={page >= last}
					aria-label="次のページ"
				>
					›
				</button>
			</div>
		</nav>
	);
}
