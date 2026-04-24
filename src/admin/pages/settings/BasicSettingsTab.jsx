/**
 * 設定ページ - 基本設定タブ。
 *
 * - 予約フローの順序（日付・時間 → フォーム / フォーム → 日付・時間）
 * - カレンダー表示モード（日表示 / 月表示）
 * - 表示期間（14/30/60/90 日）
 * - 予約締切設定（○時間前 / ○日前）
 * - 完了メッセージ
 */
import { useEffect, useState } from 'react';
import Button from '../../components/Button';
import Input, { Field } from '../../components/Input';
import Select from '../../components/Select';
import Textarea from '../../components/Textarea';

const FLOW_OPTIONS = [
	{ value: 'date-first', label: '日付・時間 → フォーム入力' },
	{ value: 'form-first', label: 'フォーム入力 → 日付・時間' },
];

const VIEW_OPTIONS = [
	{ value: 'day-horizontal', label: '日表示（横スクロール）' },
	{ value: 'month-grid', label: '月表示（グリッド）' },
];

const DAYS_OPTIONS = [
	{ value: '14', label: '14日先まで' },
	{ value: '30', label: '30日先まで（1ヶ月）' },
	{ value: '60', label: '60日先まで（2ヶ月）' },
	{ value: '90', label: '90日先まで（3ヶ月）' },
];

const DEFAULT_VALUES = {
	smb_booking_flow_order: 'date-first',
	smb_calendar_view_mode: 'day-horizontal',
	smb_display_days: '30',
	smb_booking_deadline_type: 'hours', // 'hours' | 'days'
	smb_booking_deadline_hours: '2',
	smb_booking_deadline_days: '1',
	smb_completion_message: '',
};

/**
 * サーバから取得した settings を基本設定タブの state に変換する。
 * 締切は「hours または days のうち大きい方を有効値とし、type を推定」する。
 */
function hydrate(settings) {
	const hours = Number(settings.smb_booking_deadline_hours || 0);
	const days = Number(settings.smb_booking_deadline_days || 0);
	// どちらか一方のみ設定されていれば、それを type と見なす。両方あれば days を優先（より厳しい設定として日単位運用のケースを想定）。
	let type = 'hours';
	if (days > 0 && hours === 0) type = 'days';
	else if (days > 0 && hours > 0) type = 'days';
	else type = 'hours';

	return {
		smb_booking_flow_order: settings.smb_booking_flow_order || 'date-first',
		smb_calendar_view_mode: settings.smb_calendar_view_mode || 'day-horizontal',
		smb_display_days: String(settings.smb_display_days || '30'),
		smb_booking_deadline_type: type,
		smb_booking_deadline_hours: String(hours || 2),
		smb_booking_deadline_days: String(days || 1),
		smb_completion_message: settings.smb_completion_message || '',
	};
}

export default function BasicSettingsTab({ settings, onSave, saving, onDirtyChange }) {
	const [values, setValues] = useState(() => hydrate(settings || {}));
	const [initial, setInitial] = useState(() => hydrate(settings || {}));

	useEffect(() => {
		const next = hydrate(settings || {});
		setValues(next);
		setInitial(next);
	}, [settings]);

	// dirty 伝搬
	useEffect(() => {
		const dirty = Object.keys(values).some((k) => values[k] !== initial[k]);
		onDirtyChange && onDirtyChange(dirty);
	}, [values, initial, onDirtyChange]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const handleSave = () => {
		const patch = {
			smb_booking_flow_order: values.smb_booking_flow_order,
			smb_calendar_view_mode: values.smb_calendar_view_mode,
			smb_display_days: Number(values.smb_display_days) || 30,
			smb_completion_message: values.smb_completion_message,
		};
		// 締切: 選択された type のみ値を送り、他方は 0（無効）にする
		if (values.smb_booking_deadline_type === 'hours') {
			patch.smb_booking_deadline_hours = Number(values.smb_booking_deadline_hours) || 0;
			patch.smb_booking_deadline_days = 0;
		} else {
			patch.smb_booking_deadline_days = Number(values.smb_booking_deadline_days) || 0;
			patch.smb_booking_deadline_hours = 0;
		}
		onSave(patch);
	};

	const isDirty = Object.keys(values).some((k) => values[k] !== initial[k]);

	return (
		<div className="smb-settings-form">
			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約フロー</h3>
					<p className="smb-settings-section__lead">
						ユーザーが予約する順序と、日付カレンダーの表示方法を選びます。
					</p>
				</div>

				<Field label="入力順序">
					<div className="smb-radio-group" role="radiogroup" aria-label="入力順序">
						{FLOW_OPTIONS.map((opt) => (
							<label key={opt.value} className="smb-radio-option">
								<input
									type="radio"
									name="smb_booking_flow_order"
									value={opt.value}
									checked={values.smb_booking_flow_order === opt.value}
									onChange={() => update({ smb_booking_flow_order: opt.value })}
								/>
								<span>{opt.label}</span>
							</label>
						))}
					</div>
				</Field>

				<Field label="カレンダー表示モード">
					<div className="smb-radio-group" role="radiogroup" aria-label="カレンダー表示モード">
						{VIEW_OPTIONS.map((opt) => (
							<label key={opt.value} className="smb-radio-option">
								<input
									type="radio"
									name="smb_calendar_view_mode"
									value={opt.value}
									checked={values.smb_calendar_view_mode === opt.value}
									onChange={() => update({ smb_calendar_view_mode: opt.value })}
								/>
								<span>{opt.label}</span>
							</label>
						))}
					</div>
				</Field>

				<Select
					label="表示期間"
					options={DAYS_OPTIONS}
					value={values.smb_display_days}
					onChange={(e) => update({ smb_display_days: e.target.value })}
					help="予約フォームで何日先まで選べるかを決めます。"
				/>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約締切</h3>
					<p className="smb-settings-section__lead">
						予約をいつまで受け付けるかを設定します。
					</p>
				</div>

				<Field label="締切単位">
					<div className="smb-radio-group" role="radiogroup" aria-label="締切単位">
						<label className="smb-radio-option">
							<input
								type="radio"
								name="smb_booking_deadline_type"
								value="hours"
								checked={values.smb_booking_deadline_type === 'hours'}
								onChange={() =>
									update({ smb_booking_deadline_type: 'hours' })
								}
							/>
							<span>○時間前まで</span>
						</label>
						<label className="smb-radio-option">
							<input
								type="radio"
								name="smb_booking_deadline_type"
								value="days"
								checked={values.smb_booking_deadline_type === 'days'}
								onChange={() =>
									update({ smb_booking_deadline_type: 'days' })
								}
							/>
							<span>○日前まで</span>
						</label>
					</div>
				</Field>

				{values.smb_booking_deadline_type === 'hours' ? (
					<Input
						label="何時間前まで受け付けるか"
						type="number"
						min="0"
						value={values.smb_booking_deadline_hours}
						onChange={(e) =>
							update({ smb_booking_deadline_hours: e.target.value })
						}
						help="例: 2 と設定すると、14:00 の予約は 12:00 まで受付。"
					/>
				) : (
					<Input
						label="何日前まで受け付けるか"
						type="number"
						min="0"
						value={values.smb_booking_deadline_days}
						onChange={(e) =>
							update({ smb_booking_deadline_days: e.target.value })
						}
						help="例: 3 と設定すると、4/27 の予約は 4/24 まで受付。"
					/>
				)}
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">完了メッセージ</h3>
					<p className="smb-settings-section__lead">
						予約完了画面に表示するメッセージをカスタマイズできます。
					</p>
				</div>
				<Textarea
					label="完了画面メッセージ"
					value={values.smb_completion_message}
					onChange={(e) => update({ smb_completion_message: e.target.value })}
					rows={4}
					placeholder="ご予約ありがとうございます。確認のメールをお送りしました。"
					help="HTML タグも一部使用できます（a, br, strong など）。"
				/>
			</div>

			<div className="smb-settings-actions">
				<Button
					variant="primary"
					onClick={handleSave}
					loading={saving}
					disabled={!isDirty && !saving}
				>
					基本設定を保存
				</Button>
			</div>
		</div>
	);
}
