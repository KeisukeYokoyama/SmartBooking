/**
 * メイン入力画面 (Gen-A).
 *
 * 仕様 spec-amendment-frontend-redesign.md「画面構成の変更」:
 *   - 旧版: date / time / form がそれぞれ別ステップだった。
 *   - 新版: 1 画面に「日付＋時間」と「フォーム」を統合し、`flow_order` で順序を切替。
 *       パターン A (default): [DateSelect (TimeSelect ネスト)] → [FormInput]
 *       パターン B          : [FormInput] → [DateSelect (TimeSelect ネスト)]
 *
 * 「予約内容の確認」ボタンは画面最下部に 1 つだけ配置し、
 * 必要項目が揃うまで disabled。
 *
 * 注意:
 *   - 見た目（色・余白・タイポグラフィ・角丸など）はここでは変更しない (Gen-B/C/D 担当)。
 *   - StoreSelect / StaffSelect は別画面のまま、本コンポーネントの対象外。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import SelectionBar from '../components/SelectionBar';
import DateSelect from './DateSelect';
import FormInput from './FormInput';
import TimeSelect from './TimeSelect';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]+$/;

function normalizeValue(field, raw) {
	if (field.field_type === 'checkbox') {
		return Array.isArray(raw) ? raw : [];
	}
	return raw === undefined || raw === null ? '' : String(raw);
}

function isFieldValid(field, value) {
	const required = !!field.is_required;
	if (field.field_type === 'checkbox') {
		const arr = Array.isArray(value) ? value : [];
		if (required && arr.length === 0) return false;
		return true;
	}
	const str = typeof value === 'string' ? value.trim() : '';
	if (required && str === '') return false;
	if (str === '') return true;

	if (field.field_key === 'customer_email' || field.field_type === 'email') {
		if (!EMAIL_RE.test(str)) return false;
	}
	if (field.field_key === 'customer_phone' || field.field_type === 'tel') {
		if (!PHONE_RE.test(str)) return false;
		const digits = str.replace(/\D/g, '');
		if (digits.length < 9 || digits.length > 15) return false;
	}
	return true;
}

/**
 * MainInputPage: 日付・時間・フォーム入力を 1 画面に統合する。
 */
export default function MainInputPage({ state, dispatch, onBack }) {
	const { settings, customFields, formValues, date, time } = state;
	const flowOrder = settings && settings.flow_order === 'B' ? 'B' : 'A';

	// FormInput 側に「確認画面へ進む」ボタンを置かないよう、本画面のボタンに集約する。
	// フォームのバリデーションは MainInputPage 側でも行うため、FormInput からは触らない設計。
	// 実装上は FormInput をそのまま使い、submit ボタンの代わりに本画面の専用ボタンを使う。

	const orderedFields = useMemo(() => {
		const list = Array.isArray(customFields) ? [...customFields] : [];
		list.sort((a, b) => {
			if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
			return a.id - b.id;
		});
		return list;
	}, [customFields]);

	// 必須項目および形式バリデーションの状態を監視し、ボタン活性を判定する。
	const allFieldsValid = useMemo(() => {
		return orderedFields.every((f) =>
			isFieldValid(f, normalizeValue(f, formValues[f.field_key])),
		);
	}, [orderedFields, formValues]);

	const canConfirm = !!date && !!time && allFieldsValid;

	// バリデーション通過判定でユーザーに不足を伝えるための簡易エラー表示。
	// 「日付・時間を選んでください」「必須項目を入力してください」のいずれか。
	const [attemptedSubmit, setAttemptedSubmit] = useState(false);

	const dateSectionRef = useRef(null);
	const formSectionRef = useRef(null);

	useEffect(() => {
		if (!attemptedSubmit) return;
		if (canConfirm) setAttemptedSubmit(false);
	}, [attemptedSubmit, canConfirm]);

	const handleConfirmClick = () => {
		if (!canConfirm) {
			setAttemptedSubmit(true);
			// 不足箇所までスクロール。日時 → フォームの順で優先。
			if (!date || !time) {
				if (dateSectionRef.current && typeof dateSectionRef.current.scrollIntoView === 'function') {
					dateSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			} else if (!allFieldsValid) {
				if (formSectionRef.current && typeof formSectionRef.current.scrollIntoView === 'function') {
					formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}
			}
			return;
		}
		dispatch({ type: 'GO_TO_CONFIRM' });
	};

	// FormInput はそのまま再利用。内部の「確認画面へ進む」ボタンは hideSubmit で抑制し、
	// 画面最下部の集約ボタン (MainInputPage の confirm-btn) から GO_TO_CONFIRM を発火する。
	// DateSelect も既存のまま使い、TimeSelect をネストして 1 セクションに統合表示する。

	const dateSection = (
		<section className="smb-front-main-page__section" ref={dateSectionRef}>
			<DateSelect state={state} dispatch={dispatch}>
				<TimeSelect state={state} dispatch={dispatch} />
			</DateSelect>
		</section>
	);

	const formSection = (
		<section
			className="smb-front-main-page__section smb-front-main-page__section--form"
			ref={formSectionRef}
		>
			<FormInput state={state} dispatch={dispatch} hideHeader hideSubmit />
		</section>
	);

	return (
		<div className="smb-front-step smb-front-main-page">
			{onBack && (
				<div className="smb-front-main-page__back-row">
					<button
						type="button"
						className="smb-front-step-header__back"
						onClick={onBack}
						aria-label="前のステップに戻る"
					>
						<span aria-hidden="true">←</span>
						<span>戻る</span>
					</button>
				</div>
			)}

			<SelectionBar state={state} />

			{flowOrder === 'B' ? (
				<>
					{formSection}
					{dateSection}
				</>
			) : (
				<>
					{dateSection}
					{formSection}
				</>
			)}

			{attemptedSubmit && !canConfirm && (
				<p
					className="smb-front-main-page__hint"
					role="status"
					aria-live="polite"
				>
					{!date || !time
						? '日付と時間を選択してください。'
						: '必須項目をすべて入力してください。'}
				</p>
			)}

			<div className="smb-front-main-page__actions">
				<button
					type="button"
					className="smb-front-btn smb-front-btn--primary smb-front-btn-primary smb-front-main-page__confirm-btn"
					onClick={handleConfirmClick}
					disabled={!canConfirm}
					aria-disabled={!canConfirm}
				>
					予約内容の確認
				</button>
			</div>
		</div>
	);
}
