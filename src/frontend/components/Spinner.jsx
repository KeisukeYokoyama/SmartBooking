/**
 * 軽量スピナー（フロント用）。管理画面版と独立させている。
 */
export default function Spinner({ size = 'md', label = '読み込み中…' }) {
	return (
		<span
			className={`smb-front-spinner smb-front-spinner--${size}`}
			role="status"
			aria-live="polite"
		>
			<span className="smb-front-spinner__dot" aria-hidden="true" />
			<span className="smb-front-spinner__sr">{label}</span>
		</span>
	);
}
