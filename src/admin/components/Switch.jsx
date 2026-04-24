/**
 * アクセシブルなトグルスイッチ。
 *
 * role="switch" を持ち、Space/Enter キーで切替可能。
 */
export default function Switch({ checked, onChange, label, disabled = false, id }) {
	const handleChange = (e) => {
		if (onChange) onChange(e.target.checked);
	};
	return (
		<label className={`smb-switch ${disabled ? 'is-disabled' : ''}`}>
			<input
				id={id}
				type="checkbox"
				role="switch"
				aria-checked={checked}
				checked={!!checked}
				onChange={handleChange}
				disabled={disabled}
			/>
			<span className="smb-switch__track" aria-hidden="true">
				<span className="smb-switch__thumb" />
			</span>
			{label && <span className="smb-switch__label">{label}</span>}
		</label>
	);
}
