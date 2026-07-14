/**
 * 確認画面 (Gen-C).
 *
 * 仕様 3.6:
 *   - 表示内容: 店舗名・担当者名・予約日時・全入力情報（custom_fields ラベル + 値）
 *   - 「予約を確定する」ボタン: POST /public/reservations を実行
 *   - 「修正する」ボタン: フォーム画面に戻る。入力内容は state.formValues に保持されているので自動復元
 *   - 遷移方式は仕様上「別ページ」だが、SPA 内で別ステップとして表示する（スクロール位置リセット等で別ページ感を演出）。
 */
import { useEffect, useMemo, useRef } from 'react';
import { publicAPI } from '../api';
import ErrorMessage from '../components/ErrorMessage';
import Spinner from '../components/Spinner';
import StepHeader from '../components/StepHeader';
import { formatMonthDay, fromYmd } from '../dateUtils';
import { isFieldVisible } from '../fieldConditions';
import { pushBookingEvent } from '../utils/analytics';

const CORE_KEYS = ['customer_name', 'customer_email', 'customer_phone'];

function formatDateLabel(ymd) {
	const d = fromYmd(ymd);
	if (!d) return ymd || '';
	return formatMonthDay(d);
}

function renderValue(field, rawVal) {
	if (field.field_type === 'checkbox') {
		const arr = Array.isArray(rawVal) ? rawVal : [];
		if (arr.length === 0) return '—';
		return arr.join(' / ');
	}
	const s = rawVal === undefined || rawVal === null ? '' : String(rawVal);
	if (s === '') return '—';
	return s;
}

export default function ConfirmPage({ state, dispatch }) {
	const {
		formValues,
		customFields,
		stores,
		staff,
		storeId,
		staffId,
		scheduleId,
		schedules,
		date,
		time,
		settings,
		submitting,
		submitError,
		submitErrorStatus,
	} = state;
	// 設定で店舗・担当者の表示を OFF にしている場合、確認画面でも該当行は表示しない
	// （フロントの選択ステップを出さない以上、サマリにも出さないのが自然）。
	const showStore = !!(settings && settings.show_store_front === true);
	const showStaff = !!(settings && settings.show_staff_front === true);
	const topRef = useRef(null);

	useEffect(() => {
		// 別ページ感を出すため先頭にスクロール。
		if (topRef.current && typeof topRef.current.scrollIntoView === 'function') {
			topRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
		}
	}, []);

	// GTM 連携: 確認画面マウント時に confirm ステップを送信。
	useEffect(() => {
		pushBookingEvent('confirm');
	}, []);

	// 送信エラー発生時はエラーバナーへスクロール + フォーカスを移す（a11y）。
	const errorRef = useRef(null);
	useEffect(() => {
		if (submitError && errorRef.current) {
			if (typeof errorRef.current.scrollIntoView === 'function') {
				errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}
			if (typeof errorRef.current.focus === 'function') {
				errorRef.current.focus();
			}
		}
	}, [submitError]);

	// 並び順を sort_order に揃える。
	const orderedFields = useMemo(() => {
		const list = Array.isArray(customFields) ? [...customFields] : [];
		list.sort((a, b) => {
			if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
			return a.id - b.id;
		});
		return list;
	}, [customFields]);

	// 条件フィールド: 親の選択値によって表示対象外のフィールドは確認画面にも出さない。
	const visibleOrderedFields = useMemo(
		() => orderedFields.filter((f) => isFieldVisible(f, formValues)),
		[orderedFields, formValues],
	);

	const store = useMemo(
		() => (Array.isArray(stores) ? stores.find((s) => s.id === storeId) : null),
		[stores, storeId],
	);
	const staffMember = useMemo(
		() => (Array.isArray(staff) ? staff.find((s) => s.id === staffId) : null),
		[staff, staffId],
	);
	const schedule = useMemo(
		() => (Array.isArray(schedules) ? schedules.find((s) => s.id === scheduleId) : null),
		[schedules, scheduleId],
	);

	const endTime = schedule ? schedule.end_time : '';

	const handleConfirm = async () => {
		if (submitting) return;
		dispatch({ type: 'SUBMIT_START' });

		const customFieldPayload = {};
		orderedFields.forEach((f) => {
			if (CORE_KEYS.includes(f.field_key)) return;
			// 条件フィールドで非表示のものは送信時に破棄する（古い入力値を残さない）。
			if (!isFieldVisible(f, formValues)) return;
			const v = formValues[f.field_key];
			if (v === undefined) return;
			customFieldPayload[f.field_key] = v;
		});

		const payload = {
			schedule_id: scheduleId,
			customer_name: String(formValues.customer_name || ''),
			customer_email: String(formValues.customer_email || ''),
			customer_phone: String(formValues.customer_phone || ''),
			honeypot: '',
			custom_fields: customFieldPayload,
		};

		try {
			const res = await publicAPI.createReservation(payload);
			dispatch({ type: 'SUBMIT_SUCCESS', payload: res });
		} catch (err) {
			let msg = err && err.message ? err.message : '予約の送信に失敗しました。';
			if (err && err.status === 409) {
				msg = err.message || 'この時間枠は満席になりました。お手数ですが別の時間枠をお選びください。';
			}
			dispatch({
				type: 'SUBMIT_FAIL',
				payload: {
					message: msg,
					status: err && err.status ? err.status : null,
				},
			});
		}
	};

	const handleEdit = () => {
		if (submitting) return;
		dispatch({ type: 'GO_BACK_FROM_CONFIRM' });
	};

	// Gen-D: ヘッダー直下に「予約日時カード」を集約表示する。
	// 店舗・担当者は日時カードのサブテキストとしても繋ぎ、空き状況の冗長表示を避ける。
	const dateLabel = date ? formatDateLabel(date) : '';
	const timeLabel = time ? (endTime ? `${time} 〜 ${endTime}` : time) : '';
	const subtitleParts = [];
	if (showStore && store && store.name) subtitleParts.push(store.name);
	if (showStaff && staffMember && staffMember.name) subtitleParts.push(staffMember.name);
	const summarySubtitle = subtitleParts.join(' / ');

	return (
		<div
			className="smb-front-step smb-front-confirm-page smb-front-section-fadein"
			ref={topRef}
		>
			<StepHeader
				title="予約内容の確認"
				subtitle="以下の内容でご予約を確定します。"
			/>

			{(dateLabel || timeLabel || summarySubtitle) && (
				<div className="smb-front-confirm-summary">
					{(dateLabel || timeLabel) && (
						<div className="smb-front-confirm-summary__datetime">
							{dateLabel}
							{dateLabel && timeLabel ? ' ' : ''}
							{timeLabel}
						</div>
					)}
					{summarySubtitle && (
						<div className="smb-front-confirm-summary__sub">
							{summarySubtitle}
						</div>
					)}
				</div>
			)}

			<section className="smb-front-confirm smb-front-confirm-list">
				<dl
					className="smb-front-confirm__list smb-front-confirm-list__dl"
				>
					{visibleOrderedFields.map((f) => (
						<div
							key={f.id}
							className="smb-front-confirm__pair smb-front-confirm-row"
						>
							<dt className="smb-front-confirm-label">{f.field_label}</dt>
							<dd className="smb-front-confirm-value">
								{renderValue(f, formValues[f.field_key])}
							</dd>
						</div>
					))}
				</dl>
			</section>

			{submitError && (
				<div
					className="smb-front-confirm__alert"
					ref={errorRef}
					tabIndex={-1}
				>
					<ErrorMessage message={submitError} />
					{submitErrorStatus === 409 && (
						<div className="smb-front-confirm__alert-actions">
							<button
								type="button"
								className="smb-front-btn smb-front-btn--secondary smb-front-btn-outline"
								onClick={() =>
									dispatch({ type: 'GO_TO_STEP', payload: 'date' })
								}
							>
								日付を選び直す
							</button>
						</div>
					)}
				</div>
			)}

			<div className="smb-front-form__actions smb-front-form__actions--confirm smb-front-confirm-actions">
				<button
					type="button"
					className="smb-front-btn smb-front-btn--primary smb-front-btn-primary smb-front-confirm-actions__primary"
					onClick={handleConfirm}
					disabled={submitting}
					aria-busy={submitting ? 'true' : 'false'}
				>
					{submitting ? (
						<>
							<Spinner size="sm" label="送信中" />
							<span className="smb-front-btn__label">送信中…</span>
						</>
					) : (
						<span className="smb-front-btn__label">予約を確定する</span>
					)}
				</button>
				<button
					type="button"
					className="smb-front-btn smb-front-btn--secondary smb-front-btn-outline smb-front-confirm-actions__secondary"
					onClick={handleEdit}
					disabled={submitting}
				>
					入力内容を修正する
				</button>
			</div>
		</div>
	);
}
