/**
 * ラベル + 入力フィールドの一体化ユーティリティ。
 *
 * エラーメッセージ・ヘルプテキスト・必須マークを統一的に扱う。
 */
import { useId } from 'react';

export function Field({ label, required, error, help, children, htmlFor }) {
	return (
		<div className={`smb-field ${error ? 'has-error' : ''}`}>
			{label && (
				<label className="smb-field__label" htmlFor={htmlFor}>
					<span>{label}</span>
					{required && (
						<span className="smb-field__required" aria-label="必須">
							*
						</span>
					)}
				</label>
			)}
			<div className="smb-field__control">{children}</div>
			{help && !error && <p className="smb-field__help">{help}</p>}
			{error && <p className="smb-field__error">{error}</p>}
		</div>
	);
}

export default function Input({
	label,
	required,
	error,
	help,
	id,
	type = 'text',
	className = '',
	...rest
}) {
	const autoId = useId();
	const fieldId = id || autoId;
	return (
		<Field label={label} required={required} error={error} help={help} htmlFor={fieldId}>
			<input
				id={fieldId}
				type={type}
				className={`smb-input ${className}`}
				{...rest}
			/>
		</Field>
	);
}
