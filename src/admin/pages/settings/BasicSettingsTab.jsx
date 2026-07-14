/**
 * 設定ページ - 基本設定タブ。
 *
 * - 予約フローの順序（日付・時間 → フォーム / フォーム → 日付・時間）
 * - カレンダー表示モード（日表示のみ / 月表示のみ / 日月切替）
 * - 表示期間（14/30/60/90 日）
 * - 予約締切設定（○時間前 / ○日前）
 * - 店舗選択ステップ ON/OFF（手動トグル、デフォルト OFF）
 * - 担当者選択ステップ ON/OFF（手動トグル、デフォルト OFF）
 * - 完了メッセージ
 */
import { useEffect, useState } from 'react';
import Button from '../../components/Button';
import Input, { Field } from '../../components/Input';
import Select from '../../components/Select';
import Switch from '../../components/Switch';
import Textarea from '../../components/Textarea';

const FLOW_OPTIONS = [
	{ value: 'date-first', label: '日付・時間 → フォーム入力' },
	{ value: 'form-first', label: 'フォーム入力 → 日付・時間' },
];

const VIEW_OPTIONS = [
	{ value: 'day_only', label: '日表示のみ' },
	{ value: 'month_only', label: '月表示のみ' },
	{ value: 'both', label: '日表示＋月表示切替' },
];

const DAYS_OPTIONS = [
	{ value: '14', label: '14日先まで' },
	{ value: '30', label: '30日先まで（1ヶ月）' },
	{ value: '60', label: '60日先まで（2ヶ月）' },
	{ value: '90', label: '90日先まで（3ヶ月）' },
];

const DEFAULT_VALUES = {
	smart_booking_booking_flow_order: 'date-first',
	smart_booking_calendar_view_mode: 'day_only',
	smart_booking_display_days: '30',
	smb_booking_deadline_type: 'hours', // 'hours' | 'days'
	smart_booking_booking_deadline_hours: '2',
	smart_booking_booking_deadline_days: '1',
	smart_booking_show_store_front: false,
	smart_booking_show_staff_front: false,
	smart_booking_store_label: '',
	smart_booking_staff_label: '',
	smart_booking_completion_message: '',
};

// 呼び方の入力上限（UI が崩れない長さ）。仕様に明記が無いため実装判断。
const LABEL_MAX_LENGTH = 20;

// 旧スラッグから正準値への正規化（後方互換）。
const VIEW_MODE_ALIASES = {
	'day-horizontal': 'day_only',
	'month-grid': 'month_only',
	'day-and-month': 'both',
	toggle: 'both',
};

function normalizeViewMode(raw) {
	const v = String(raw || '').trim();
	if (Object.prototype.hasOwnProperty.call(VIEW_MODE_ALIASES, v)) {
		return VIEW_MODE_ALIASES[v];
	}
	if (v === 'day_only' || v === 'month_only' || v === 'both') {
		return v;
	}
	return DEFAULT_VALUES.smart_booking_calendar_view_mode;
}

/**
 * サーバから取得した settings を基本設定タブの state に変換する。
 * 締切は「hours または days のうち大きい方を有効値とし、type を推定」する。
 */
function hydrate(settings) {
	const hours = Number(settings.smart_booking_booking_deadline_hours || 0);
	const days = Number(settings.smart_booking_booking_deadline_days || 0);
	let type = 'hours';
	if (days > 0 && hours === 0) type = 'days';
	else if (days > 0 && hours > 0) type = 'days';
	else type = 'hours';

	// 表示制御フラグ: 旧データ（未定義）はデフォルト OFF として扱う。
	const showStore =
		settings.smart_booking_show_store_front === undefined
			? false
			: !!Number(settings.smart_booking_show_store_front);
	const showStaff =
		settings.smart_booking_show_staff_front === undefined
			? false
			: !!Number(settings.smart_booking_show_staff_front);

	return {
		smart_booking_booking_flow_order: settings.smart_booking_booking_flow_order || 'date-first',
		smart_booking_calendar_view_mode: normalizeViewMode(settings.smart_booking_calendar_view_mode),
		smart_booking_display_days: String(settings.smart_booking_display_days || '30'),
		smb_booking_deadline_type: type,
		smart_booking_booking_deadline_hours: String(hours || 2),
		smart_booking_booking_deadline_days: String(days || 1),
		smart_booking_show_store_front: showStore,
		smart_booking_show_staff_front: showStaff,
		smart_booking_store_label: settings.smart_booking_store_label || '',
		smart_booking_staff_label: settings.smart_booking_staff_label || '',
		smart_booking_completion_message: settings.smart_booking_completion_message || '',
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

	useEffect(() => {
		const dirty = Object.keys(values).some((k) => values[k] !== initial[k]);
		onDirtyChange && onDirtyChange(dirty);
	}, [values, initial, onDirtyChange]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const handleSave = () => {
		const patch = {
			smart_booking_booking_flow_order: values.smart_booking_booking_flow_order,
			smart_booking_calendar_view_mode: values.smart_booking_calendar_view_mode,
			smart_booking_display_days: Number(values.smart_booking_display_days) || 30,
			smart_booking_completion_message: values.smart_booking_completion_message,
			smart_booking_show_store_front: values.smart_booking_show_store_front ? 1 : 0,
			smart_booking_show_staff_front: values.smart_booking_show_staff_front ? 1 : 0,
			smart_booking_store_label: values.smart_booking_store_label.trim(),
			smart_booking_staff_label: values.smart_booking_staff_label.trim(),
		};
		if (values.smb_booking_deadline_type === 'hours') {
			patch.smart_booking_booking_deadline_hours = Number(values.smart_booking_booking_deadline_hours) || 0;
			patch.smart_booking_booking_deadline_days = 0;
		} else {
			patch.smart_booking_booking_deadline_days = Number(values.smart_booking_booking_deadline_days) || 0;
			patch.smart_booking_booking_deadline_hours = 0;
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
									name="smart_booking_booking_flow_order"
									value={opt.value}
									checked={values.smart_booking_booking_flow_order === opt.value}
									onChange={() => update({ smart_booking_booking_flow_order: opt.value })}
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
									name="smart_booking_calendar_view_mode"
									value={opt.value}
									checked={values.smart_booking_calendar_view_mode === opt.value}
									onChange={() => update({ smart_booking_calendar_view_mode: opt.value })}
								/>
								<span>{opt.label}</span>
							</label>
						))}
					</div>
				</Field>

				<Select
					label="表示期間"
					options={DAYS_OPTIONS}
					value={values.smart_booking_display_days}
					onChange={(e) => update({ smart_booking_display_days: e.target.value })}
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
						value={values.smart_booking_booking_deadline_hours}
						onChange={(e) =>
							update({ smart_booking_booking_deadline_hours: e.target.value })
						}
						help="例: 2 と設定すると、14:00 の予約は 12:00 まで受付。"
					/>
				) : (
					<Input
						label="何日前まで受け付けるか"
						type="number"
						min="0"
						value={values.smart_booking_booking_deadline_days}
						onChange={(e) =>
							update({ smart_booking_booking_deadline_days: e.target.value })
						}
						help="例: 3 と設定すると、4/27 の予約は 4/24 まで受付。"
					/>
				)}
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">フロント表示</h3>
					<p className="smb-settings-section__lead">
						予約フォームに「店舗選択」「担当者選択」のステップを表示するかどうかを切り替えます。
						OFF にすると、フロントではステップを表示せず、デフォルトの店舗・担当者が自動的に選択されます。
					</p>
				</div>

				<div className="smb-settings-row">
					<div className="smb-settings-row__label">店舗選択ステップ</div>
					<div className="smb-settings-row__control">
						<Switch
							checked={values.smart_booking_show_store_front}
							onChange={(v) => update({ smart_booking_show_store_front: v })}
							label={
								values.smart_booking_show_store_front
									? '表示する（フロントに店舗選択ステップを出す）'
									: '表示しない（デフォルト店舗を自動で割り当てる）'
							}
						/>
						<p className="smb-field-help">
							ON にすると、店舗が1つしかない場合でも店舗選択ステップが表示されます。<br />
							OFF にしても、管理画面ではスケジュールに店舗を紐づけて管理できます。
						</p>
					</div>
				</div>

				<div className="smb-settings-row">
					<div className="smb-settings-row__label">担当者選択ステップ</div>
					<div className="smb-settings-row__control">
						<Switch
							checked={values.smart_booking_show_staff_front}
							onChange={(v) => update({ smart_booking_show_staff_front: v })}
							label={
								values.smart_booking_show_staff_front
									? '表示する（フロントに担当者選択ステップを出す）'
									: '表示しない（空いている担当者を自動で割り当てる）'
							}
						/>
						<p className="smb-field-help">
							ON にすると、担当者が1人しかいない場合でも担当者選択ステップが表示されます。<br />
							OFF にしても、管理画面ではスケジュールに担当者を紐づけて管理できます。
						</p>
					</div>
				</div>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">店舗・担当者の呼び方</h3>
					<p className="smb-settings-section__lead">
						予約フォーム（お客様の画面）で「店舗」「担当者」の代わりに表示する言葉を変更できます。
						業種に合わせて「サロン」「校舎」「スタッフ」「先生」などに変更できます。
						空欄のままにすると「店舗」「担当者」と表示されます。<br />
						※この設定は予約フォームの見出し・ラベルのみに反映されます。管理画面の表記は変わりません。
					</p>
				</div>

				<Input
					label="店舗の呼び方"
					value={values.smart_booking_store_label}
					onChange={(e) => update({ smart_booking_store_label: e.target.value })}
					maxLength={LABEL_MAX_LENGTH}
					placeholder="店舗"
					help="例: サロン / 校舎 / 店舗（空欄なら「店舗」）"
				/>

				<Input
					label="担当者の呼び方"
					value={values.smart_booking_staff_label}
					onChange={(e) => update({ smart_booking_staff_label: e.target.value })}
					maxLength={LABEL_MAX_LENGTH}
					placeholder="担当者"
					help="例: スタッフ / 先生 / 担当者（空欄なら「担当者」）"
				/>
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
					value={values.smart_booking_completion_message}
					onChange={(e) => update({ smart_booking_completion_message: e.target.value })}
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
