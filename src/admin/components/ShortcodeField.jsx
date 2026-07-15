/**
 * ショートコード表示＋コピー UI（管理画面共通）。
 *
 * コードを等幅で表示し、コピーボタンでクリップボードへコピーする。成功時は
 * 「コピーしました」を一時表示する（WordPress 管理画面の控えめな慣習）。
 * ToastContext には依存せず自己完結（店舗カードなど Toast の無い文脈でも使える）。
 *
 * クリップボードは navigator.clipboard.writeText を基本とし、使えない/失敗した環境では
 * コード要素を選択して document.execCommand('copy') にフォールバックする。両方失敗しても
 * テキストは選択状態のまま残し、ユーザーが手動でコピーできるようにする。
 */
import { useEffect, useRef, useState } from 'react';

const FEEDBACK_MS = 1600;

async function copyText(text, codeEl) {
	// 1. 標準の Clipboard API（セキュアコンテキスト = https / localhost で有効）。
	try {
		if (navigator.clipboard && navigator.clipboard.writeText) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// フォールバックへ。
	}
	// 2. フォールバック: コード要素を選択して execCommand('copy')。
	try {
		if (codeEl && typeof document !== 'undefined') {
			const range = document.createRange();
			range.selectNodeContents(codeEl);
			const sel = window.getSelection();
			sel.removeAllRanges();
			sel.addRange(range);
			const ok = document.execCommand && document.execCommand('copy');
			return !!ok;
		}
	} catch {
		// 何もしない（テキストは選択状態のまま残る）。
	}
	return false;
}

export default function ShortcodeField({
	code,
	label = 'ショートコード',
	help = '',
	compact = false,
}) {
	const [copied, setCopied] = useState(false);
	const codeRef = useRef(null);
	const timerRef = useRef(null);

	// アンマウント時にタイマーを掃除する。
	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, []);

	// code が変わったら（フォーム切替など）フィードバックをリセットする。
	useEffect(() => {
		setCopied(false);
		if (timerRef.current) clearTimeout(timerRef.current);
	}, [code]);

	if (!code) return null;

	const handleCopy = async () => {
		const ok = await copyText(code, codeRef.current);
		if (!ok) return;
		setCopied(true);
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
	};

	const cls = `smb-shortcode-field${compact ? ' smb-shortcode-field--compact' : ''}`;

	return (
		<div className={cls}>
			{label && <span className="smb-shortcode-field__label">{label}</span>}
			<code className="smb-shortcode-field__code" ref={codeRef}>
				{code}
			</code>
			<button
				type="button"
				className="smb-shortcode-field__copy"
				onClick={handleCopy}
				aria-label={`ショートコード ${code} をコピー`}
			>
				コピー
			</button>
			{copied && (
				<span className="smb-shortcode-field__status" role="status">
					コピーしました
				</span>
			)}
			{help && !compact && <p className="smb-shortcode-field__help">{help}</p>}
		</div>
	);
}
