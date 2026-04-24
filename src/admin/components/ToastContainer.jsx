/**
 * Toast 通知コンテナ。
 *
 * React Context で showToast(message, type) を公開し、
 * 画面右下に一時的な通知を積み重ねる。
 *
 * 外部ライブラリ不使用（YAGNI）。
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ToastContext = createContext({ showToast: () => {} });

let idCounter = 0;

export function ToastProvider({ children }) {
	const [toasts, setToasts] = useState([]);
	const timersRef = useRef(new Map());

	const removeToast = useCallback((id) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
		const timer = timersRef.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timersRef.current.delete(id);
		}
	}, []);

	const showToast = useCallback(
		(message, type = 'info', duration = 3500) => {
			idCounter += 1;
			const id = idCounter;
			setToasts((prev) => [...prev, { id, message, type }]);
			const t = setTimeout(() => removeToast(id), duration);
			timersRef.current.set(id, t);
			return id;
		},
		[removeToast]
	);

	useEffect(() => {
		return () => {
			timersRef.current.forEach((t) => clearTimeout(t));
			timersRef.current.clear();
		};
	}, []);

	return (
		<ToastContext.Provider value={{ showToast }}>
			{children}
			<div className="smb-toast-stack" role="status" aria-live="polite">
				{toasts.map((t) => (
					<div key={t.id} className={`smb-toast smb-toast--${t.type}`}>
						<span className="smb-toast__message">{t.message}</span>
						<button
							type="button"
							className="smb-toast__close"
							aria-label="通知を閉じる"
							onClick={() => removeToast(t.id)}
						>
							×
						</button>
					</div>
				))}
			</div>
		</ToastContext.Provider>
	);
}

export function useToast() {
	return useContext(ToastContext);
}
