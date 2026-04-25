/**
 * フロント用エラーバナー。
 */
export default function ErrorMessage({ message, onRetry }) {
	if (!message) return null;
	return (
		<div className="smb-front-alert" role="alert">
			<span className="smb-front-alert__icon" aria-hidden="true">
				!
			</span>
			<span className="smb-front-alert__message">{message}</span>
			{onRetry && (
				<button type="button" className="smb-front-alert__btn" onClick={onRetry}>
					再試行
				</button>
			)}
		</div>
	);
}
