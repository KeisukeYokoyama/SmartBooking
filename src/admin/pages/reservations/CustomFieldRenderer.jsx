/**
 * カスタムフィールド動的レンダラ。
 *
 * smart_booking_custom_fields の 1 レコードを受け取り、適切な入力要素を描画する。
 *
 * 対応種別: text / email / tel / textarea / select / radio / checkbox
 *
 * `customer_name` / `customer_email` / `customer_phone` は保護フィールドだが、
 * モーダル側で専用フィールドとして扱うため、このレンダラには渡さない前提。
 */
import Input from '../../components/Input';
import { Field } from '../../components/Input';
import Select from '../../components/Select';
import Textarea from '../../components/Textarea';

export default function CustomFieldRenderer({ field, value, onChange, error }) {
	const { field_key: key, field_label: label, field_type: type, field_options: options, placeholder, is_required: required } = field;

	// select.
	if (type === 'select') {
		const opts = Array.isArray(options) ? options : [];
		return (
			<Select
				label={label}
				required={!!required}
				error={error}
				value={value || ''}
				onChange={(e) => onChange(key, e.target.value)}
				options={[{ value: '', label: '選択してください' }, ...opts.map((o) => ({ value: o, label: o }))]}
			/>
		);
	}

	// radio.
	if (type === 'radio') {
		const opts = Array.isArray(options) ? options : [];
		return (
			<Field label={label} required={!!required} error={error}>
				<div className="smb-radio-group" role="radiogroup" aria-label={label}>
					{opts.map((o) => (
						<label key={o} className="smb-radio-option">
							<input
								type="radio"
								name={`cf-${key}`}
								value={o}
								checked={value === o}
								onChange={() => onChange(key, o)}
							/>
							<span>{o}</span>
						</label>
					))}
				</div>
			</Field>
		);
	}

	// checkbox (複数選択).
	if (type === 'checkbox') {
		const opts = Array.isArray(options) ? options : [];
		const arr = Array.isArray(value) ? value : value ? safeParseArray(value) : [];
		const toggle = (o) => {
			const next = arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o];
			onChange(key, next);
		};
		return (
			<Field label={label} required={!!required} error={error}>
				<div className="smb-checkbox-group">
					{opts.map((o) => (
						<label key={o} className="smb-checkbox-option">
							<input
								type="checkbox"
								value={o}
								checked={arr.includes(o)}
								onChange={() => toggle(o)}
							/>
							<span>{o}</span>
						</label>
					))}
				</div>
			</Field>
		);
	}

	// address (v0.3.0 機能④): 郵便番号 + 住所の2入力。管理画面からの手動登録では自動補完しない。
	if (type === 'address') {
		const obj = value && typeof value === 'object' ? value : {};
		const zip = obj.zip || '';
		const address = obj.address || '';
		return (
			<Field label={label} required={!!required} error={error}>
				<div className="smb-field-group smb-field-group--contact">
					<input
						type="text"
						className="smb-input"
						placeholder="1234567"
						value={zip}
						onChange={(e) => onChange(key, { zip: e.target.value, address })}
						aria-label={`${label}（郵便番号）`}
					/>
					<input
						type="text"
						className="smb-input"
						placeholder="東京都渋谷区渋谷1-2-3"
						value={address}
						onChange={(e) => onChange(key, { zip, address: e.target.value })}
						aria-label={`${label}（住所）`}
					/>
				</div>
			</Field>
		);
	}

	// textarea.
	if (type === 'textarea') {
		return (
			<Textarea
				label={label}
				required={!!required}
				error={error}
				placeholder={placeholder || ''}
				value={value || ''}
				onChange={(e) => onChange(key, e.target.value)}
				rows={3}
			/>
		);
	}

	// text / email / tel.
	const inputType = type === 'email' ? 'email' : type === 'tel' ? 'tel' : 'text';
	return (
		<Input
			label={label}
			type={inputType}
			required={!!required}
			error={error}
			placeholder={placeholder || ''}
			value={value || ''}
			onChange={(e) => onChange(key, e.target.value)}
		/>
	);
}

/**
 * DB から ["A","B"] のような JSON 文字列で来た場合に備えてフォールバック。
 * 失敗したら空配列。
 */
function safeParseArray(str) {
	if (Array.isArray(str)) return str;
	try {
		const v = JSON.parse(str);
		return Array.isArray(v) ? v : [];
	} catch {
		return [];
	}
}
