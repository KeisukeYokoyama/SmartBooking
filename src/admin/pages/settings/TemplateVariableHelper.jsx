/**
 * メールテンプレートの変数挿入ヘルパー。
 *
 * 旧UIは「使える変数の一覧を横に並べる」だけだったが、
 * ここでは **クリックで対象の textarea のカーソル位置に挿入** する改善を加える。
 * 旧UIを超える体験のポイント。
 */

export const MAIL_VARIABLES = [
	{ key: '{customer_name}', desc: '予約者氏名' },
	{ key: '{customer_email}', desc: 'メールアドレス' },
	{ key: '{customer_phone}', desc: '電話番号' },
	{ key: '{reservation_id}', desc: '予約番号' },
	{ key: '{schedule_date}', desc: '予約日（例: 2026年5月1日（金））' },
	{ key: '{schedule_time}', desc: '予約時間（例: 14:00〜）' },
	{ key: '{store_name}', desc: '店舗名' },
	{ key: '{staff_name}', desc: '担当者名' },
];

/**
 * textarea の現在のカーソル位置に文字列を挿入する。
 */
function insertAtCursor(textareaRef, text) {
	const ta = textareaRef?.current;
	if (!ta) return null;
	const start = ta.selectionStart ?? ta.value.length;
	const end = ta.selectionEnd ?? ta.value.length;
	const next = ta.value.slice(0, start) + text + ta.value.slice(end);
	// カーソル位置を挿入後の末尾に
	requestAnimationFrame(() => {
		ta.focus();
		const pos = start + text.length;
		ta.setSelectionRange(pos, pos);
	});
	return next;
}

export default function TemplateVariableHelper({ textareaRef, onInsert }) {
	const handleClick = (variable) => {
		const next = insertAtCursor(textareaRef, variable);
		if (next !== null && onInsert) onInsert(next);
	};

	return (
		<div className="smb-var-helper">
			<div className="smb-var-helper__head">
				<span className="smb-var-helper__title">使える変数</span>
				<span className="smb-var-helper__hint">
					クリックで本文のカーソル位置に挿入
				</span>
			</div>
			<div className="smb-var-helper__list">
				{MAIL_VARIABLES.map((v) => (
					<button
						key={v.key}
						type="button"
						className="smb-var-chip"
						onClick={() => handleClick(v.key)}
						title={v.desc}
					>
						<code>{v.key}</code>
						<span className="smb-var-chip__desc">{v.desc}</span>
					</button>
				))}
			</div>
		</div>
	);
}
