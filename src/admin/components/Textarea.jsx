/**
 * ラベル付き Textarea。
 */
import { useId } from 'react';
import { Field } from './Input';

export default function Textarea({
	label,
	required,
	error,
	help,
	id,
	rows = 3,
	className = '',
	...rest
}) {
	const autoId = useId();
	const fieldId = id || autoId;
	return (
		<Field label={label} required={required} error={error} help={help} htmlFor={fieldId}>
			<textarea id={fieldId} className={`smb-textarea ${className}`} rows={rows} {...rest} />
		</Field>
	);
}
