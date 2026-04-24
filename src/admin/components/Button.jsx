/**
 * Smart Booking 共通ボタン。
 *
 * variant: 'primary' | 'secondary' | 'danger' | 'ghost'
 * size: 'sm' | 'md' | 'lg'
 *
 * disabled/loading/focusring/hover ステートを CSS で制御する。
 */
export default function Button({
	children,
	variant = 'primary',
	size = 'md',
	type = 'button',
	loading = false,
	disabled = false,
	icon = null,
	className = '',
	...rest
}) {
	const classes = [
		'smb-btn',
		'smb-btn--' + variant,
		'smb-btn--' + size,
		loading ? 'is-loading' : '',
		className,
	]
		.filter(Boolean)
		.join(' ');

	return (
		<button
			type={type}
			className={classes}
			disabled={disabled || loading}
			aria-busy={loading || undefined}
			{...rest}
		>
			{icon && !loading && <span className="smb-btn__icon">{icon}</span>}
			{loading && <span className="smb-btn__spinner" aria-hidden="true" />}
			<span className="smb-btn__label">{children}</span>
		</button>
	);
}
