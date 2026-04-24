/**
 * カスタムフィールド追加/編集モーダル。
 *
 * - 新規追加時は field_label から field_key を自動生成（英数字+_）
 * - select/radio/checkbox のみ「選択肢」欄が表示される
 * - 保護フィールド（氏名/メール/電話）の編集時:
 *    - field_type の変更不可
 *    - is_required を 0 にできない（必須固定）
 *    - field_key は常に読み取り専用
 */
import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button';
import Input, { Field } from '../../components/Input';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import Switch from '../../components/Switch';
import Textarea from '../../components/Textarea';
import { FIELD_TYPES } from './FieldTypeCards';

const EMPTY = {
	field_label: '',
	field_key: '',
	field_type: 'text',
	field_options: [],
	placeholder: '',
	is_required: 0,
};

const TYPE_OPTIONS = FIELD_TYPES.map((t) => ({ value: t.type, label: t.label }));

const NEEDS_OPTIONS = ['select', 'radio', 'checkbox'];
const KEY_RE = /^[a-z][a-z0-9_]*$/;

/**
 * ラベルから field_key 候補を推測する。
 * - 日本語や記号は除去。英数字がなければ `field_` プレフィックスを付ける。
 */
function suggestKey(label) {
	const base = String(label || '')
		.toLowerCase()
		.replace(/[^a-z0-9_\s]/g, '')
		.trim()
		.replace(/\s+/g, '_')
		.slice(0, 40);
	if (!base || !/^[a-z]/.test(base)) {
		return base ? `field_${base}` : '';
	}
	return base;
}

export default function CustomFieldModal({
	open,
	field,
	defaultType = 'text',
	existingKeys = [],
	onClose,
	onSubmit,
	submitting = false,
}) {
	const isEdit = !!field;
	const isProtected = !!field?.is_protected;

	const [values, setValues] = useState(EMPTY);
	const [errors, setErrors] = useState({});
	const [keyTouched, setKeyTouched] = useState(false);
	const [optionsText, setOptionsText] = useState('');

	useEffect(() => {
		if (!open) return;
		setErrors({});
		if (field) {
			setValues({
				field_label: field.field_label || '',
				field_key: field.field_key || '',
				field_type: field.field_type || 'text',
				field_options: Array.isArray(field.field_options) ? field.field_options : [],
				placeholder: field.placeholder || '',
				is_required: field.is_required ? 1 : 0,
			});
			setOptionsText(
				(Array.isArray(field.field_options) ? field.field_options : []).join('\n')
			);
			setKeyTouched(true);
		} else {
			setValues({ ...EMPTY, field_type: defaultType });
			setOptionsText('');
			setKeyTouched(false);
		}
	}, [open, field, defaultType]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	// ラベル入力に連動してキーを自動生成（ユーザーがキーを編集するまで）
	const onLabelChange = (e) => {
		const label = e.target.value;
		update({ field_label: label });
		if (!isEdit && !keyTouched) {
			update({ field_key: suggestKey(label) });
		}
	};

	const onKeyChange = (e) => {
		setKeyTouched(true);
		const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
		update({ field_key: v });
	};

	const onTypeChange = (e) => {
		update({ field_type: e.target.value });
	};

	const onOptionsChange = (e) => {
		const text = e.target.value;
		setOptionsText(text);
		const items = text
			.split('\n')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
		update({ field_options: items });
	};

	const needsOptions = NEEDS_OPTIONS.includes(values.field_type);

	const validate = () => {
		const e = {};
		if (!values.field_label.trim()) {
			e.field_label = 'ラベルを入力してください。';
		}
		if (!isProtected) {
			if (!values.field_key.trim()) {
				e.field_key = 'フィールドキーを入力してください。';
			} else if (!KEY_RE.test(values.field_key)) {
				e.field_key =
					'英小文字で始まり、英数字とアンダースコアのみ使えます。例: company_name';
			} else {
				// 重複チェック（自分以外）
				const dup = existingKeys.some(
					(k) => k === values.field_key && (!field || field.field_key !== k)
				);
				if (dup) e.field_key = 'このフィールドキーは既に使われています。';
			}
		}
		if (needsOptions && values.field_options.length === 0) {
			e.field_options = '選択肢を1行に1つずつ入力してください。';
		}
		return e;
	};

	const handleSubmit = (evt) => {
		evt.preventDefault();
		const errs = validate();
		setErrors(errs);
		if (Object.keys(errs).length > 0) return;

		// 保護フィールドは is_required を 1 に固定
		const payload = {
			field_label: values.field_label.trim(),
			field_key: values.field_key,
			field_type: values.field_type,
			field_options: needsOptions ? values.field_options : [],
			placeholder: values.placeholder,
			is_required: isProtected ? 1 : values.is_required ? 1 : 0,
		};
		onSubmit(payload);
	};

	const title = useMemo(() => {
		if (!isEdit) return 'フィールドを追加';
		return isProtected ? 'フィールドを編集（初期フィールド）' : 'フィールドを編集';
	}, [isEdit, isProtected]);

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={title}
			size="md"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						{isEdit ? '変更を保存' : 'フィールドを追加'}
					</Button>
				</>
			}
		>
			<form className="smb-form" onSubmit={handleSubmit}>
				<Input
					label="ラベル"
					required
					value={values.field_label}
					onChange={onLabelChange}
					error={errors.field_label}
					placeholder="例：会社名"
					help="予約フォームで入力欄の見出しとして表示されます。"
				/>

				<Input
					label="フィールドキー"
					required={!isProtected}
					value={values.field_key}
					onChange={onKeyChange}
					error={errors.field_key}
					readOnly={isProtected}
					disabled={isProtected}
					placeholder="company_name"
					help={
						isProtected
							? '初期フィールドのキーは変更できません。'
							: '英数字とアンダースコアのみ。メール本文などで {キー名} として利用できます。'
					}
				/>

				<Select
					label="フィールドタイプ"
					required
					options={TYPE_OPTIONS}
					value={values.field_type}
					onChange={onTypeChange}
					disabled={isProtected}
					help={
						isProtected
							? '初期フィールドのタイプは変更できません。'
							: undefined
					}
				/>

				<Input
					label="プレースホルダー"
					value={values.placeholder}
					onChange={(e) => update({ placeholder: e.target.value })}
					placeholder="例：株式会社〇〇"
					help="入力欄が空のときに薄く表示される案内文です。"
				/>

				{needsOptions && (
					<Textarea
						label="選択肢"
						required
						value={optionsText}
						onChange={onOptionsChange}
						error={errors.field_options}
						rows={4}
						placeholder={'はい\nいいえ\nわからない'}
						help="1行に1つずつ入力してください。"
					/>
				)}

				<Field label="必須入力">
					<Switch
						checked={!!values.is_required || isProtected}
						onChange={(v) => update({ is_required: v ? 1 : 0 })}
						disabled={isProtected}
						label={
							isProtected
								? '必須（初期フィールドは常に必須）'
								: values.is_required
									? '必須にする'
									: '任意入力'
						}
					/>
				</Field>
			</form>
		</Modal>
	);
}
