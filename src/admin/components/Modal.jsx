/**
 * 汎用モーダル。
 *
 * - Escape キーで閉じる
 * - 背景クリックで閉じる
 * - 「×」ボタンで閉じる
 * - open ↔ close で fade+scale のトランジション
 * - 開いた直後にモーダル内の最初のフォーカス可能要素に自動フォーカス
 *
 * isDirty=true のときは Escape / 背景クリック / × クリックで window.confirm を
 * 出してから閉じる。誤操作で入力途中の内容を失わないためのガード。
 *
 * 外部ライブラリ不使用（YAGNI）。
 */
import { useEffect, useRef } from 'react';

export default function Modal({
	open,
	onClose,
	title,
	children,
	footer,
	size = 'md',
	closeOnBackdrop = true,
	isDirty = false,
	dirtyConfirmMessage = '入力内容が破棄されますが、よろしいですか？',
}) {
	const dialogRef = useRef(null);
	const previouslyFocusedRef = useRef(null);
	// 最新の isDirty / dirtyConfirmMessage を ref で保持する。
	// keydown ハンドラはマウント時にしか登録しないので、勢いで closure の値を使うと古い値で判断してしまう。
	const isDirtyRef = useRef(isDirty);
	const dirtyConfirmMessageRef = useRef(dirtyConfirmMessage);

	useEffect(() => {
		isDirtyRef.current = isDirty;
	}, [isDirty]);
	useEffect(() => {
		dirtyConfirmMessageRef.current = dirtyConfirmMessage;
	}, [dirtyConfirmMessage]);

	useEffect(() => {
		if (!open) return undefined;
		previouslyFocusedRef.current = document.activeElement;
		const handleKey = (e) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				if (!onClose) return;
				if (isDirtyRef.current) {
					if (typeof window !== 'undefined' && !window.confirm(dirtyConfirmMessageRef.current)) {
						return;
					}
				}
				onClose();
			}
		};
		document.addEventListener('keydown', handleKey, true);
		const previousOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';

		// 自動フォーカス.
		requestAnimationFrame(() => {
			if (!dialogRef.current) return;
			const focusable = dialogRef.current.querySelector(
				'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])'
			);
			if (focusable) focusable.focus();
		});

		return () => {
			document.removeEventListener('keydown', handleKey, true);
			document.body.style.overflow = previousOverflow;
			if (previouslyFocusedRef.current && previouslyFocusedRef.current.focus) {
				try {
					previouslyFocusedRef.current.focus();
				} catch {
					// noop.
				}
			}
		};
	}, [open, onClose]);

	if (!open) return null;

	const tryClose = () => {
		if (!onClose) return;
		if (isDirty) {
			if (typeof window !== 'undefined' && !window.confirm(dirtyConfirmMessage)) {
				return;
			}
		}
		onClose();
	};

	const handleBackdropClick = (e) => {
		if (!closeOnBackdrop) return;
		if (e.target === e.currentTarget) tryClose();
	};

	return (
		<div
			className="smb-modal-backdrop"
			onMouseDown={handleBackdropClick}
			role="presentation"
		>
			<div
				ref={dialogRef}
				className={`smb-modal smb-modal--${size}`}
				role="dialog"
				aria-modal="true"
				aria-label={typeof title === 'string' ? title : undefined}
				onMouseDown={(e) => e.stopPropagation()}
			>
				<div className="smb-modal__header">
					<h2 className="smb-modal__title">{title}</h2>
					<button
						type="button"
						className="smb-modal__close"
						aria-label="閉じる"
						onClick={tryClose}
					>
						×
					</button>
				</div>
				<div className="smb-modal__body">{children}</div>
				{footer && <div className="smb-modal__footer">{footer}</div>}
			</div>
		</div>
	);
}
