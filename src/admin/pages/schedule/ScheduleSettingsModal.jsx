/**
 * 表示期間 + 予約締切設定モーダル。
 *
 * スケジュール管理画面からのショートカット。設定画面の「基本設定」タブと
 * 同じ内容を編集できる（キー: smb_display_days, smb_booking_deadline_days,
 * smb_booking_deadline_hours）。
 *
 * 参考: docs/reference-ui/admin-schedule-settings.png
 * 仕様: smart-booking-spec.md 3.8（予約締切） / 3.9（表示期間）
 */
import { useEffect, useState } from 'react';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import { Field } from '../../components/Input';

const DISPLAY_PRESETS = [
	{ value: 7, label: '1週間先（7日）' },
	{ value: 14, label: '2週間先（14日）' },
	{ value: 30, label: '1ヶ月先（30日）' },
	{ value: 60, label: '2ヶ月先（60日）' },
	{ value: 90, label: '3ヶ月先（90日）' },
];

export default function ScheduleSettingsModal({
	open,
	onClose,
	onSubmit,
	submitting,
	initialValues,
}) {
	const [displayDays, setDisplayDays] = useState(7);
	const [deadlineDays, setDeadlineDays] = useState(0);
	const [deadlineHours, setDeadlineHours] = useState(0);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!open) return;
		setDisplayDays(Number(initialValues?.smb_display_days) || 7);
		setDeadlineDays(Number(initialValues?.smb_booking_deadline_days) || 0);
		setDeadlineHours(Number(initialValues?.smb_booking_deadline_hours) || 0);
		setError(null);
	}, [open, initialValues]);

	const handleSubmit = (e) => {
		e.preventDefault();
		if (displayDays < 1 || displayDays > 365) {
			setError('表示期間は1日〜365日の範囲で入力してください。');
			return;
		}
		if (deadlineDays < 0 || deadlineHours < 0) {
			setError('予約締切は0以上の値を入力してください。');
			return;
		}
		setError(null);
		onSubmit({
			smb_display_days: displayDays,
			smb_booking_deadline_days: deadlineDays,
			smb_booking_deadline_hours: deadlineHours,
		});
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="表示期間 / 予約締切"
			size="md"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						保存
					</Button>
				</>
			}
		>
			<form className="smb-form smb-schedule-settings" onSubmit={handleSubmit} noValidate>
				<section>
					<h3 className="smb-settings-section__title">表示期間</h3>
					<p className="smb-settings-section__lead">
						フロントエンドの予約フォームで、今日から何日先まで予約可能な日付を表示するかを設定します。
					</p>
					<div className="smb-settings-preset">
						{DISPLAY_PRESETS.map((p) => (
							<button
								key={p.value}
								type="button"
								className={`smb-settings-preset__item ${displayDays === p.value ? 'is-active' : ''}`}
								onClick={() => setDisplayDays(p.value)}
							>
								{p.label}
							</button>
						))}
					</div>
					<Field label="カスタム（日数）" htmlFor="smb-display-days">
						<div className="smb-unit-input">
							<input
								id="smb-display-days"
								type="number"
								min="1"
								max="365"
								className="smb-input"
								value={displayDays}
								onChange={(e) => setDisplayDays(Number(e.target.value) || 0)}
							/>
							<span className="smb-unit-input__suffix">日先まで</span>
						</div>
					</Field>
				</section>

				<section>
					<h3 className="smb-settings-section__title">予約締切</h3>
					<p className="smb-settings-section__lead">
						受付を打ち切るタイミングを「何日前」と「何時間前」で指定できます。両方設定した場合は、より厳しい（早い）方が適用されます。
					</p>
					<div className="smb-field-group smb-field-group--contact">
						<Field
							label="何日前まで"
							htmlFor="smb-deadline-days"
							help="例: 1 を入れると当日の予約を受け付けません。0 なら当日もOK。"
						>
							<div className="smb-unit-input">
								<input
									id="smb-deadline-days"
									type="number"
									min="0"
									max="365"
									className="smb-input"
									value={deadlineDays}
									onChange={(e) => setDeadlineDays(Number(e.target.value) || 0)}
								/>
								<span className="smb-unit-input__suffix">日前まで</span>
							</div>
						</Field>
						<Field
							label="何時間前まで"
							htmlFor="smb-deadline-hours"
							help="例: 2 を入れると予約時間の2時間前まで受け付けます。0 なら直前まで可。"
						>
							<div className="smb-unit-input">
								<input
									id="smb-deadline-hours"
									type="number"
									min="0"
									max="168"
									className="smb-input"
									value={deadlineHours}
									onChange={(e) => setDeadlineHours(Number(e.target.value) || 0)}
								/>
								<span className="smb-unit-input__suffix">時間前まで</span>
							</div>
						</Field>
					</div>
				</section>

				{error && <p className="smb-field__error">{error}</p>}

				<button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>
					送信
				</button>
			</form>
		</Modal>
	);
}
