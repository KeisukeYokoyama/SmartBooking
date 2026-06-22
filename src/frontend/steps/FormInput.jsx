/**
 * フォーム入力ステップ (Gen-C).
 *
 * 仕様:
 *   - smabo_custom_fields から取得した全フィールドをフィールド種別に応じて描画。
 *     初期3フィールド (customer_name / customer_email / customer_phone) も同テーブルに格納されている。
 *   - 各フィールドのバリデーション:
 *       * is_required のフィールドが空 → 「この項目は必須です」
 *       * email 形式不正 → 「メールアドレスの形式が正しくありません」
 *       * 電話番号 → 数字・ハイフン・括弧・+ のみ許容（緩め）
 *   - ハニーポット: 視覚非表示のダミーフィールド。bot が埋めてきたら確認画面ではなく直接弾く。
 *   - 「確認画面へ」ボタンで state.step を 'confirm' に遷移。値は state.formValues に保持。
 *   - 「戻る」ボタンで前ステップへ。
 */
import { useEffect, useMemo, useState } from 'react';
import StepHeader from '../components/StepHeader';
import { pushBookingEvent } from '../utils/analytics';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 数字・ハイフン・プラス・括弧・スペースのみ許容（国際形式まで緩めに）。
const PHONE_RE = /^[0-9+()\-\s]+$/;

function inputTypeForField(type) {
	if (type === 'email') return 'email';
	if (type === 'tel') return 'tel';
	return 'text';
}

function normalizeValue(field, raw) {
	if (field.field_type === 'checkbox') {
		if (Array.isArray(raw)) return raw;
		return [];
	}
	return raw === undefined || raw === null ? '' : String(raw);
}

function validateField(field, value) {
	const required = !!field.is_required;
	if (field.field_type === 'checkbox') {
		const arr = Array.isArray(value) ? value : [];
		if (required && arr.length === 0) return 'この項目は必須です。';
		return null;
	}
	const str = typeof value === 'string' ? value.trim() : '';
	if (required && str === '') return 'この項目は必須です。';
	if (str === '') return null; // 任意項目は空でもOK

	if (field.field_key === 'customer_email' || field.field_type === 'email') {
		if (!EMAIL_RE.test(str)) return 'メールアドレスの形式が正しくありません。';
	}
	if (field.field_key === 'customer_phone' || field.field_type === 'tel') {
		if (!PHONE_RE.test(str)) {
			return '電話番号は数字・ハイフン・括弧・+ のみで入力してください。';
		}
		// 数字部分だけ抽出して桁数を検証（日本固定 10 桁・携帯 11 桁、E.164 最大 15 桁）。
		const digits = str.replace(/\D/g, '');
		if (digits.length < 9 || digits.length > 15) {
			return '電話番号の桁数が正しくありません。';
		}
	}
	return null;
}

/**
 * FormInput: フォーム入力画面。
 *
 * @param {object}   props
 * @param {object}   props.state            グローバルフォーム状態
 * @param {Function} props.dispatch         reducer dispatch
 * @param {Function} [props.onBack]         「戻る」ボタンハンドラ。未指定なら表示しない
 * @param {boolean}  [props.hideHeader=false] StepHeader を表示しない (MainInputPage 内に埋め込む時に使用)
 * @param {boolean}  [props.hideSubmit=false] 「確認画面へ進む」ボタンを表示しない (MainInputPage 内に埋め込む時に使用)
 */
export default function FormInput({ state, dispatch, onBack, hideHeader = false, hideSubmit = false }) {
	const { customFields, formValues } = state;

	// GTM 連携: フォーム入力セクションがマウントされたタイミングで form_input を送信。
	useEffect(() => {
		pushBookingEvent('form_input');
	}, []);

	// sort_order で並べ替え。customFields は配列。
	const orderedFields = useMemo(() => {
		const list = Array.isArray(customFields) ? [...customFields] : [];
		list.sort((a, b) => {
			if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
			return a.id - b.id;
		});
		return list;
	}, [customFields]);

	const [errors, setErrors] = useState({});
	const [honeypot, setHoneypot] = useState('');

	const handleChange = (key, value) => {
		dispatch({ type: 'UPDATE_FORM_FIELD', payload: { key, value } });
		// 入力が変わったらそのフィールドのエラーはクリア。
		if (errors[key]) {
			setErrors((prev) => {
				const next = { ...prev };
				delete next[key];
				return next;
			});
		}
	};

	const handleCheckboxToggle = (key, option, currentArr) => {
		const arr = Array.isArray(currentArr) ? currentArr : [];
		const next = arr.includes(option) ? arr.filter((x) => x !== option) : [...arr, option];
		handleChange(key, next);
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		// ハニーポット: bot が埋めてきたらそのまま弾く（UI には出さない）。
		// ここでは状態変化せずに黙って何もしない実装 or エラー。
		// ボットに検知方法を教えない観点で「何もしない」方が安全だが、
		// ユーザの実機でも誤入力されうるため、念のため確認画面へは進めない。
		if (honeypot.trim() !== '') {
			return;
		}

		const nextErrors = {};
		orderedFields.forEach((f) => {
			const val = normalizeValue(f, formValues[f.field_key]);
			const msg = validateField(f, val);
			if (msg) nextErrors[f.field_key] = msg;
		});
		setErrors(nextErrors);
		if (Object.keys(nextErrors).length > 0) {
			// 最初のエラーフィールドへフォーカス。
			const firstKey = orderedFields.find((f) => nextErrors[f.field_key])?.field_key;
			if (firstKey) {
				const el = document.getElementById('smb-front-field-' + firstKey);
				if (el && typeof el.focus === 'function') el.focus();
			}
			return;
		}

		dispatch({ type: 'GO_TO_CONFIRM' });
	};

	return (
		<div className="smb-front-step">
			{!hideHeader && (
				<StepHeader
					title="お客様情報の入力"
					subtitle="ご予約に必要な情報をご入力ください。"
					onBack={onBack}
				/>
			)}

			<form className="smb-front-form" onSubmit={handleSubmit} noValidate>
				{orderedFields.map((f) => {
					const id = 'smb-front-field-' + f.field_key;
					const val = normalizeValue(f, formValues[f.field_key]);
					const errMsg = errors[f.field_key];
					const required = !!f.is_required;
					const labelEl = (
						<label htmlFor={id} className="smb-front-form__label smb-front-label">
							{f.field_label}
							{required && (
								<span
									className="smb-front-form__required smb-front-required-badge"
									aria-label="必須"
								>
									必須
								</span>
							)}
						</label>
					);

					// select
					if (f.field_type === 'select') {
						const opts = Array.isArray(f.field_options) ? f.field_options : [];
						return (
							<div key={f.id} className="smb-front-form__row smb-front-form-group">
								{labelEl}
								<select
									id={id}
									className={
										'smb-front-form__select smb-front-select' +
										(errMsg ? ' has-error is-error' : '')
									}
									value={val}
									onChange={(e) => handleChange(f.field_key, e.target.value)}
									aria-invalid={errMsg ? 'true' : 'false'}
									aria-describedby={errMsg ? id + '-err' : undefined}
									aria-required={required ? 'true' : undefined}
									required={required}
								>
									<option value="">選択してください</option>
									{opts.map((o) => (
										<option key={o} value={o}>
											{o}
										</option>
									))}
								</select>
								{errMsg && (
									<p
										id={id + '-err'}
										className="smb-front-form__error"
										role="alert"
									>
										{errMsg}
									</p>
								)}
							</div>
						);
					}

					// radio
					if (f.field_type === 'radio') {
						const opts = Array.isArray(f.field_options) ? f.field_options : [];
						return (
							<div key={f.id} className="smb-front-form__row smb-front-form-group">
								{labelEl}
								<div
									className={
										'smb-front-form__options smb-front-choice-list' +
										(errMsg ? ' has-error' : '')
									}
									role="radiogroup"
									aria-label={f.field_label}
									aria-invalid={errMsg ? 'true' : 'false'}
									aria-required={required ? 'true' : undefined}
								>
									{opts.map((o, i) => {
										const optId = id + '-opt-' + i;
										const isSelected = val === o;
										return (
											<label
												key={o}
												htmlFor={optId}
												className={
													'smb-front-form__option smb-front-choice-item' +
													(isSelected ? ' is-selected' : '')
												}
											>
												<input
													id={optId}
													type="radio"
													name={f.field_key}
													value={o}
													checked={isSelected}
													onChange={() =>
														handleChange(f.field_key, o)
													}
												/>
												<span>{o}</span>
											</label>
										);
									})}
								</div>
								{errMsg && (
									<p
										id={id + '-err'}
										className="smb-front-form__error"
										role="alert"
									>
										{errMsg}
									</p>
								)}
							</div>
						);
					}

					// checkbox
					if (f.field_type === 'checkbox') {
						const opts = Array.isArray(f.field_options) ? f.field_options : [];
						const arr = Array.isArray(val) ? val : [];
						return (
							<div key={f.id} className="smb-front-form__row smb-front-form-group">
								{labelEl}
								<div
									className={
										'smb-front-form__options smb-front-choice-list' +
										(errMsg ? ' has-error' : '')
									}
									role="group"
									aria-label={f.field_label}
									aria-invalid={errMsg ? 'true' : 'false'}
									aria-required={required ? 'true' : undefined}
								>
									{opts.map((o, i) => {
										const optId = id + '-opt-' + i;
										const isSelected = arr.includes(o);
										return (
											<label
												key={o}
												htmlFor={optId}
												className={
													'smb-front-form__option smb-front-choice-item' +
													(isSelected ? ' is-selected' : '')
												}
											>
												<input
													id={optId}
													type="checkbox"
													value={o}
													checked={isSelected}
													onChange={() =>
														handleCheckboxToggle(
															f.field_key,
															o,
															arr,
														)
													}
												/>
												<span>{o}</span>
											</label>
										);
									})}
								</div>
								{errMsg && (
									<p
										id={id + '-err'}
										className="smb-front-form__error"
										role="alert"
									>
										{errMsg}
									</p>
								)}
							</div>
						);
					}

					// textarea
					if (f.field_type === 'textarea') {
						return (
							<div key={f.id} className="smb-front-form__row smb-front-form-group">
								{labelEl}
								<textarea
									id={id}
									className={
										'smb-front-form__textarea smb-front-textarea' +
										(errMsg ? ' has-error is-error' : '')
									}
									rows={4}
									placeholder={f.placeholder || ''}
									value={val}
									onChange={(e) => handleChange(f.field_key, e.target.value)}
									aria-invalid={errMsg ? 'true' : 'false'}
									aria-describedby={errMsg ? id + '-err' : undefined}
									aria-required={required ? 'true' : undefined}
									required={required}
								/>
								{errMsg && (
									<p
										id={id + '-err'}
										className="smb-front-form__error"
										role="alert"
									>
										{errMsg}
									</p>
								)}
							</div>
						);
					}

					// text / email / tel
					// autocomplete を付与してブラウザの入力補助を活かす。
					const autoComplete =
						f.field_key === 'customer_name'
							? 'name'
							: f.field_key === 'customer_email'
								? 'email'
								: f.field_key === 'customer_phone'
									? 'tel'
									: 'on';
					return (
						<div key={f.id} className="smb-front-form__row smb-front-form-group">
							{labelEl}
							<input
								id={id}
								type={inputTypeForField(f.field_type)}
								className={
									'smb-front-form__input smb-front-input' +
									(errMsg ? ' has-error is-error' : '')
								}
								placeholder={f.placeholder || ''}
								value={val}
								onChange={(e) => handleChange(f.field_key, e.target.value)}
								autoComplete={autoComplete}
								aria-invalid={errMsg ? 'true' : 'false'}
								aria-describedby={errMsg ? id + '-err' : undefined}
								aria-required={required ? 'true' : undefined}
								required={required}
							/>
							{errMsg && (
								<p
									id={id + '-err'}
									className="smb-front-form__error"
									role="alert"
								>
									{errMsg}
								</p>
							)}
						</div>
					);
				})}

				{/*
				  ハニーポット: 視覚的に完全非表示。aria-hidden + tabIndex=-1 でスクリーンリーダー・キーボードからも到達不可。
				  仕様 5.10 スパム対策。
				*/}
				<div className="smb-front-honeypot" aria-hidden="true">
					<label>
						この欄は入力しないでください
						<input
							type="text"
							name="email_confirm"
							tabIndex={-1}
							autoComplete="off"
							value={honeypot}
							onChange={(e) => setHoneypot(e.target.value)}
						/>
					</label>
				</div>

				{!hideSubmit && (
					<div className="smb-front-form__actions">
						<button
							type="submit"
							className="smb-front-btn smb-front-btn--primary"
						>
							確認画面へ進む
						</button>
					</div>
				)}
			</form>
		</div>
	);
}
