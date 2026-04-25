/**
 * 予約完了画面 (Gen-C).
 *
 * 仕様 3.7:
 *   - 表示内容: 完了メッセージ、予約番号、予約日時（日付 + 時間 [start 〜 end]）
 *   - 完了メッセージは `settings.completion_message` に格納されている（HTML 許可。サーバ側で wp_kses_post 済み）。
 *   - 予約番号は state.completedReservation.id。
 *   - 日時表示は ConfirmPage と揃え、「日付」と「時間（start 〜 end）」を別 dt/dd で表示。
 */
import { useEffect, useRef } from 'react';
import { formatMonthDay, fromYmd } from '../dateUtils';

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function formatDateLabel(ymd) {
	const d = fromYmd(ymd);
	if (!d) return ymd || '';
	const w = WEEKDAY_JA[d.getDay()] || '';
	return `${formatMonthDay(d)}（${w}）`;
}

export default function DonePage({ state }) {
	const { completedReservation, settings } = state;
	const topRef = useRef(null);

	useEffect(() => {
		if (topRef.current && typeof topRef.current.scrollIntoView === 'function') {
			topRef.current.scrollIntoView({ behavior: 'auto', block: 'start' });
		}
	}, []);

	if (!completedReservation) {
		// 直接アクセスされた場合のフォールバック（本来は起き得ない）。
		return (
			<div className="smb-front-step" ref={topRef}>
				<div className="smb-front-done">
					<div className="smb-front-done__check" aria-hidden="true">
						✓
					</div>
					<h2 className="smb-front-done__title">ご予約ありがとうございました</h2>
					<p className="smb-front-done__message">予約が完了しました。</p>
				</div>
			</div>
		);
	}

	const message =
		(settings && typeof settings.completion_message === 'string' && settings.completion_message.trim() !== '')
			? settings.completion_message
			: '';

	return (
		<div className="smb-front-step" ref={topRef}>
			<div className="smb-front-done">
				<div className="smb-front-done__check" aria-hidden="true">
					✓
				</div>
				<h2 className="smb-front-done__title">ご予約ありがとうございました</h2>
				<p className="smb-front-done__lead">
					予約を承りました。担当者が確認次第、ご登録のメールアドレスへご連絡いたします。
				</p>

				<div className="smb-front-done__number">
					<span className="smb-front-done__number-label">予約番号</span>
					<span className="smb-front-done__number-value">
						#{completedReservation.id}
					</span>
				</div>

				<dl className="smb-front-done__summary">
					{completedReservation.store_name && (
						<>
							<dt>店舗</dt>
							<dd>{completedReservation.store_name}</dd>
						</>
					)}
					{completedReservation.staff_name && (
						<>
							<dt>担当者</dt>
							<dd>{completedReservation.staff_name}</dd>
						</>
					)}
					{completedReservation.schedule_date && (
						<>
							<dt>日付</dt>
							<dd>{formatDateLabel(completedReservation.schedule_date)}</dd>
						</>
					)}
					{completedReservation.schedule_time && (
						<>
							<dt>時間</dt>
							<dd>
								{completedReservation.schedule_time}
								{completedReservation.schedule_end_time
									? <> 〜 {completedReservation.schedule_end_time}</>
									: null}
							</dd>
						</>
					)}
				</dl>

				{message && (
					<div
						className="smb-front-done__message"
						// settings.completion_message は REST 側で wp_kses_post 済み（HTML 許可項目）。
						// eslint-disable-next-line react/no-danger
						dangerouslySetInnerHTML={{ __html: message }}
					/>
				)}
			</div>
		</div>
	);
}
