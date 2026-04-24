/**
 * シンプルなスピナー（CSS のみ）。
 */
export default function Spinner({ size = 'md', label = '読み込み中…' }) {
	return (
		<span className={`smb-spinner smb-spinner--${size}`} role="status" aria-live="polite">
			<span className="smb-spinner__dot" aria-hidden="true" />
			<span className="smb-spinner__sr">{label}</span>
		</span>
	);
}
