/**
 * カスタムフィールド追加/編集モーダル。
 *
 * - 新規追加時は field_label から field_key を自動生成（英数字+_）
 * - select/radio/checkbox のみ「選択肢」欄が表示される
 * - 保護フィールド（氏名/メール/電話）の編集時:
 *    - field_type の変更不可
 *    - is_required を 0 にできない（必須固定）
 *    - field_key は常に読み取り専用
 * - 表示条件 (v0.3.0 機能③): radio/select の親フィールドの選択値に応じて表示/非表示。
 *    - 条件は1つのみ・親は radio/select のみ・ネスト禁止（条件付きフィールドは親候補から除外）
 *    - 保護フィールドは条件の子になれないためセクション自体を出さない
 */
import { useEffect, useMemo, useRef, useState } from 'react';
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
	condition_field_key: '',
	condition_value: '',
	address_autofill: true,
};

const TYPE_OPTIONS = FIELD_TYPES.map((t) => ({ value: t.type, label: t.label }));

const NEEDS_OPTIONS = ['select', 'radio', 'checkbox'];
const KEY_RE = /^[a-z][a-z0-9_]*$/;

// メール変数の固定8変数と衝突するキーは使用不可（サーバの RESERVED_TEMPLATE_KEYS と一致させる）。
const RESERVED_KEYS = [
	'customer_name',
	'customer_email',
	'customer_phone',
	'reservation_id',
	'schedule_date',
	'schedule_time',
	'store_name',
	'staff_name',
];

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
	fields = [],
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
	const initialRef = useRef({ values: EMPTY, optionsText: '' });

	useEffect(() => {
		if (!open) return;
		setErrors({});
		if (field) {
			const init = {
				field_label: field.field_label || '',
				field_key: field.field_key || '',
				field_type: field.field_type || 'text',
				field_options: Array.isArray(field.field_options) ? field.field_options : [],
				placeholder: field.placeholder || '',
				is_required: field.is_required ? 1 : 0,
				condition_field_key: field.condition_field_key || '',
				condition_value: field.condition_value || '',
				address_autofill: field.autofill !== false,
			};
			setValues(init);
			const optsText = (Array.isArray(field.field_options) ? field.field_options : []).join('\n');
			setOptionsText(optsText);
			setKeyTouched(true);
			initialRef.current = { values: init, optionsText: optsText };
		} else {
			const init = { ...EMPTY, field_type: defaultType };
			setValues(init);
			setOptionsText('');
			setKeyTouched(false);
			initialRef.current = { values: init, optionsText: '' };
		}
	}, [open, field, defaultType]);

	const computedIsDirty =
		JSON.stringify(values) !== JSON.stringify(initialRef.current.values) ||
		optionsText !== initialRef.current.optionsText;
	const isDirty = !submitting && computedIsDirty;

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

	// --- 表示条件 (v0.3.0 機能③) ---
	// 親候補: radio/select のみ・自分自身は除外・既に条件付き（子）のフィールドは除外（ネスト禁止）。
	const parentCandidates = useMemo(() => {
		const list = Array.isArray(fields) ? fields : [];
		return list.filter(
			(f) =>
				(f.field_type === 'radio' || f.field_type === 'select') &&
				f.field_key !== values.field_key &&
				!f.condition_field_key
		);
	}, [fields, values.field_key]);

	const parentOptions = useMemo(
		() => parentCandidates.map((f) => ({ value: f.field_key, label: f.field_label })),
		[parentCandidates]
	);

	const selectedParentField = useMemo(
		() => parentCandidates.find((f) => f.field_key === values.condition_field_key) || null,
		[parentCandidates, values.condition_field_key]
	);

	const conditionValueOptions = useMemo(() => {
		const opts = Array.isArray(selectedParentField?.field_options)
			? selectedParentField.field_options
			: [];
		return opts.map((o) => ({ value: o, label: o }));
	}, [selectedParentField]);

	// ON = condition_field_key に親が入っている状態。
	const conditionOn = !!values.condition_field_key;

	// ネスト禁止（逆方向）: 自身が既に他フィールドの表示条件の親になっている場合、
	// 自身に条件を設定すると 2 段ネストになるため、表示条件セクションを出さない。
	const isAlreadyParent = useMemo(
		() =>
			isEdit &&
			!!field &&
			(Array.isArray(fields) ? fields : []).some(
				(f) => f.condition_field_key && f.condition_field_key === field.field_key
			),
		[isEdit, fields, field]
	);

	const onConditionToggle = (checked) => {
		if (checked) {
			const first = parentCandidates[0];
			update({ condition_field_key: first ? first.field_key : '', condition_value: '' });
		} else {
			update({ condition_field_key: '', condition_value: '' });
		}
	};

	const onConditionParentChange = (e) => {
		update({ condition_field_key: e.target.value, condition_value: '' });
	};

	const onConditionValueChange = (e) => {
		update({ condition_value: e.target.value });
	};

	const validate = () => {
		const e = {};
		if (!values.field_label.trim()) {
			e.field_label = 'ラベルを入力してください。';
		}
		if (!isProtected) {
			const key = values.field_key.trim();
			// 空欄は許容（サーバが field_N を自動採番するため、英字キーを考えなくても作成できる）。
			if (key) {
				if (!KEY_RE.test(key)) {
					e.field_key =
						'英小文字で始まり、英数字とアンダースコアのみ使えます。例: company_name';
				} else if (RESERVED_KEYS.includes(key)) {
					e.field_key =
						'このキーはメール変数の予約語のため使用できません。別のキー名にしてください。';
				} else {
					// 重複チェック（自分以外）
					const dup = existingKeys.some(
						(k) => k === values.field_key && (!field || field.field_key !== k)
					);
					if (dup) e.field_key = 'このフィールドキーは既に使われています。';
				}
			}
		}
		if (needsOptions && values.field_options.length === 0) {
			e.field_options = '選択肢を1行に1つずつ入力してください。';
		}
		if (!isProtected && values.condition_field_key && !values.condition_value) {
			e.condition_value = '表示条件の値を選択してください。';
		}
		return e;
	};

	const handleSubmit = (evt) => {
		evt.preventDefault();
		const errs = validate();
		setErrors(errs);
		if (Object.keys(errs).length > 0) return;

		// 保護フィールドは is_required を 1 に固定。表示条件も同様に保護フィールドは常に空。
		const payload = {
			field_label: values.field_label.trim(),
			field_key: values.field_key,
			field_type: values.field_type,
			field_options: needsOptions ? values.field_options : [],
			placeholder: values.placeholder,
			is_required: isProtected ? 1 : values.is_required ? 1 : 0,
			condition_field_key: isProtected ? '' : values.condition_field_key,
			condition_value: isProtected ? '' : values.condition_value,
		};
		if (values.field_type === 'address') {
			payload.address_autofill = !!values.address_autofill;
		}
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
			isDirty={isDirty}
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
					value={values.field_key}
					onChange={onKeyChange}
					error={errors.field_key}
					readOnly={isProtected}
					disabled={isProtected}
					placeholder="company_name（空欄なら自動で割り当て）"
					help={
						isProtected
							? '初期フィールドのキーは変更できません。'
							: values.field_type === 'address'
								? '任意。空欄なら自動で割り当てます。メール本文に {キー名} と書くと「〒郵便番号 住所」が差し込まれます（{キー名}_zip＝郵便番号、{キー名}_address＝住所 に分けても差し込めます）。'
								: '任意。空欄なら自動で割り当てます。メール本文に {キー名} と書くと、この項目の回答がそのまま差し込まれます。'
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

				{values.field_type === 'address' && (
					<Field label="住所の自動入力">
						<Switch
							checked={!!values.address_autofill}
							onChange={(v) => update({ address_autofill: v })}
							label={
								values.address_autofill
									? '郵便番号から住所を自動入力する'
									: '自動入力しない（手入力のみ）'
							}
						/>
					</Field>
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

				{/*
				  表示条件 (v0.3.0 機能③): radio/select の親フィールドの選択値に応じて
				  このフィールドを表示/非表示にする。初期フィールドは条件の子になれないため
				  isProtected のときはセクション自体を表示しない。
				*/}
				{!isProtected && isAlreadyParent && (
					<div className="smb-field-group">
						<Field label="表示条件">
							<p className="smb-field__help">
								このフィールドは他フィールドの表示条件の親になっているため、表示条件を設定できません（表示条件はネストできません）。
							</p>
						</Field>
					</div>
				)}

				{!isProtected && !isAlreadyParent && (
					<div className="smb-field-group">
						<Field label="表示条件">
							{parentCandidates.length === 0 ? (
								<p className="smb-field__help">
									選択式（ラジオ/セレクト）のフィールドを先に作成すると、表示条件を設定できます。
								</p>
							) : (
								<Switch
									checked={conditionOn}
									onChange={onConditionToggle}
									label={
										conditionOn
											? '表示条件を設定する'
											: '常に表示する（表示条件なし）'
									}
								/>
							)}
						</Field>

						{conditionOn && parentCandidates.length > 0 && (
							<div className="smb-field-group smb-field-group--contact">
								<Select
									label="親フィールド"
									required
									options={parentOptions}
									value={values.condition_field_key}
									onChange={onConditionParentChange}
									help="この項目の選択式フィールドの値に応じて表示/非表示を切り替えます。"
								/>
								<Select
									label="表示する値"
									required
									options={conditionValueOptions}
									value={values.condition_value}
									onChange={onConditionValueChange}
									error={errors.condition_value}
									disabled={!values.condition_field_key}
									placeholder="選択してください"
									help="親フィールドがこの値のとき、このフィールドを表示します。"
								/>
							</div>
						)}
					</div>
				)}
			</form>
		</Modal>
	);
}
