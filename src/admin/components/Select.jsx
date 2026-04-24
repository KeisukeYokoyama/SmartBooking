/**
 * ラベル付き Select。
 */
import { useId } from 'react';
import { Field } from './Input';

export default function Select({
	label,
	required,
	error,
	help,
	id,
	options = [],
	placeholder,
	className = '',
	...rest
}) {
	const autoId = useId();
	const fieldId = id || autoId;
	return (
		<Field label={label} required={required} error={error} help={help} htmlFor={fieldId}>
			<select id={fieldId} className={`smb-select ${className}`} {...rest}>
				{placeholder && (
					<option value="" disabled>
						{placeholder}
					</option>
				)}
				{options.map((opt) => (
					<option key={opt.value} value={opt.value}>
						{opt.label}
					</option>
				))}
			</select>
		</Field>
	);
}
