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

const CORE_KEYS = ['customer_name', 'customer_email', 'customer_phone'];
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateLabel(ymd) {
	const d = fromYmd(ymd);
	if (!d) return ymd || '';
	const w = WEEKDAY_JA[d.getDay()] || '';
	return `${formatMonthDay(d)}（${w}）`;
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
	// 設定で店舗・担当者の表示を OFF にしている場合、確認画面でも該当行を出さない。
	// 未設定（旧挙動）はデフォルト ON 扱い（!== false）。
	const showStore = settings ? settings.show_store_front !== false : true;
	const showStaff = settings ? settings.show_staff_front !== false : true;
	const topRef = useRef(null);

	useEffect(() => {
		// 別ページ感を出すため先頭にスクロール。
		if (topRef.current && typeof topRef.current.scrollIntoView === 'function') {
			topRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
		}
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

	return (
		<div className="smb-front-step" ref={topRef}>
			<StepHeader
				title="予約内容の確認"
				subtitle="以下の内容でご予約を確定します。"
			/>

			<section className="smb-front-confirm">
				<h3 className="smb-front-confirm__group-title">ご予約内容</h3>
				<dl className="smb-front-confirm__list">
					{showStore && store && (
						<>
							<dt>店舗</dt>
							<dd>{store.name}</dd>
						</>
					)}
					{showStaff && staffMember && (
						<>
							<dt>担当者</dt>
							<dd>{staffMember.name}</dd>
						</>
					)}
					{date && (
						<>
							<dt>日付</dt>
							<dd>{formatDateLabel(date)}</dd>
						</>
					)}
					{time && (
						<>
							<dt>時間</dt>
							<dd>
								{time}
								{endTime ? <> 〜 {endTime}</> : null}
							</dd>
						</>
					)}
				</dl>

				<h3 className="smb-front-confirm__group-title">お客様情報</h3>
				<dl className="smb-front-confirm__list">
					{orderedFields.map((f) => (
						<div key={f.id} className="smb-front-confirm__pair">
							<dt>{f.field_label}</dt>
							<dd>{renderValue(f, formValues[f.field_key])}</dd>
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
								className="smb-front-btn smb-front-btn--secondary"
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

			<div className="smb-front-form__actions smb-front-form__actions--confirm">
				<button
					type="button"
					className="smb-front-btn smb-front-btn--secondary"
					onClick={handleEdit}
					disabled={submitting}
				>
					入力内容を修正する
				</button>
				<button
					type="button"
					className="smb-front-btn smb-front-btn--primary"
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
			</div>
		</div>
	);
}
