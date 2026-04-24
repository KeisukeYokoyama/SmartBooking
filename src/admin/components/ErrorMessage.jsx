/**
 * エラー通知バナー。
 *
 * 再試行アクションと閉じるボタンをオプションで持つ。
 */
export default function ErrorMessage({ message, onRetry, onDismiss }) {
	if (!message) return null;
	return (
		<div className="smb-alert smb-alert--error" role="alert">
			<span className="smb-alert__icon" aria-hidden="true">
				!
			</span>
			<span className="smb-alert__message">{message}</span>
			<span className="smb-alert__actions">
				{onRetry && (
					<button type="button" className="smb-alert__btn" onClick={onRetry}>
						再試行
					</button>
				)}
				{onDismiss && (
					<button
						type="button"
						className="smb-alert__close"
						aria-label="閉じる"
						onClick={onDismiss}
					>
						×
					</button>
				)}
			</span>
		</div>
	);
}
