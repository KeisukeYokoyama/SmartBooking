/**
 * 汎用モーダル。
 *
 * - Escape キーで閉じる
 * - 背景クリックで閉じる
 * - open ↔ close で fade+scale のトランジション
 * - 開いた直後にモーダル内の最初のフォーカス可能要素に自動フォーカス
 *
 * 外部ライブラリ不使用（YAGNI）。
 */
import { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, title, children, footer, size = 'md', closeOnBackdrop = true }) {
	const dialogRef = useRef(null);
	const previouslyFocusedRef = useRef(null);

	useEffect(() => {
		if (!open) return undefined;
		previouslyFocusedRef.current = document.activeElement;
		const handleKey = (e) => {
			if (e.key === 'Escape') {
				e.stopPropagation();
				onClose && onClose();
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

	const handleBackdropClick = (e) => {
		if (!closeOnBackdrop) return;
		if (e.target === e.currentTarget) onClose && onClose();
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
						onClick={() => onClose && onClose()}
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
