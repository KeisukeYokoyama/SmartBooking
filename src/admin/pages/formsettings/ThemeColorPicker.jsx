/**
 * テーマカラー設定 + リアルタイムプレビュー。
 *
 * 設定ページの「デザイン」タブから利用される（カラー設定はそちらに集約）。
 * ファイルパスは `pages/formsettings/` のままだが、これは旧構成の名残で機能上の意味はない。
 *
 * - 5つのカラー設定項目（ボタン / 日付 / 時間帯 / 必須マーク / フォーカス）
 * - `<input type="color">` + HEX テキストの併用（キーボード操作可能）
 * - 右側に `FormPreview` を配置し、色の変更を即時反映する
 */
import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button';
import { useToast } from '../../components/ToastContainer';
import FormPreview from './FormPreview';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * 設定キー → 表示情報。
 */
export const COLOR_ITEMS = [
	{
		key: 'smabo_color_button',
		label: 'ボタン色',
		help: '送信ボタン・確定ボタンなど、フォームのメインボタンの色。',
		defaultValue: '#f43f5e',
	},
	{
		key: 'smabo_color_date_selected',
		label: '日付選択色',
		help: 'カレンダーで選択中の日付を示す背景色。',
		defaultValue: '#374151',
	},
	{
		key: 'smabo_color_time_selected',
		label: '時間帯選択色',
		help: '時間枠ボタンを選択したときの背景色。',
		defaultValue: '#374151',
	},
	{
		key: 'smabo_color_required_mark',
		label: '必須マーク色',
		help: '「必須」バッジ・アスタリスクの色。',
		defaultValue: '#ef4444',
	},
	{
		key: 'smabo_color_focus',
		label: 'フォーカス色',
		help: '入力欄にフォーカスしたときの枠線の色。',
		defaultValue: '#3498db',
	},
];

export const DEFAULT_COLORS = COLOR_ITEMS.reduce((acc, item) => {
	acc[item.key] = item.defaultValue;
	return acc;
}, {});

/**
 * 初期値または設定値から表示用カラーを生成。
 */
export function pickColors(settings) {
	const out = {};
	for (const item of COLOR_ITEMS) {
		const v = settings && settings[item.key];
		out[item.key] = v && HEX_RE.test(v) ? v : item.defaultValue;
	}
	return out;
}

export default function ThemeColorPicker({ settings, onSave, saving }) {
	const initial = useMemo(() => pickColors(settings), [settings]);
	const [values, setValues] = useState(initial);
	const [errors, setErrors] = useState({});
	const { showToast } = useToast();

	useEffect(() => {
		setValues(pickColors(settings));
		setErrors({});
	}, [settings]);

	const update = (key, v) => {
		setValues((prev) => ({ ...prev, [key]: v }));
		setErrors((prev) => ({ ...prev, [key]: undefined }));
	};

	const validate = () => {
		const e = {};
		for (const item of COLOR_ITEMS) {
			const v = values[item.key];
			if (!HEX_RE.test(v)) {
				e[item.key] = 'カラーコードは #RRGGBB 形式で入力してください。';
			}
		}
		return e;
	};

	const handleSave = () => {
		const errs = validate();
		setErrors(errs);
		if (Object.keys(errs).length > 0) {
			showToast('カラーコードの形式を確認してください。', 'error');
			return;
		}
		const patch = {};
		for (const item of COLOR_ITEMS) {
			patch[item.key] = values[item.key];
		}
		onSave(patch);
	};

	const handleReset = () => {
		setValues({ ...DEFAULT_COLORS });
		setErrors({});
	};

	const isDirty = COLOR_ITEMS.some((item) => values[item.key] !== initial[item.key]);

	return (
		<div className="smb-theme-settings">
			<div className="smb-theme-settings__columns">
				<div className="smb-theme-settings__fields">
					{COLOR_ITEMS.map((item) => {
						const value = values[item.key] || '';
						const error = errors[item.key];
						return (
							<div
								key={item.key}
								className={`smb-theme-color-row ${error ? 'has-error' : ''}`}
							>
								<div className="smb-theme-color-row__label">
									<label htmlFor={`color-${item.key}`}>{item.label}</label>
								</div>
								<div className="smb-theme-color-row__control">
									<div className="smb-color-picker">
										<input
											id={`color-${item.key}`}
											type="color"
											aria-label={`${item.label} カラーピッカー`}
											value={HEX_RE.test(value) ? value : item.defaultValue}
											onChange={(e) => update(item.key, e.target.value)}
											className="smb-color-picker__swatch"
										/>
										<input
											type="text"
											aria-label={`${item.label} カラーコード`}
											value={value}
											onChange={(e) => update(item.key, e.target.value)}
											className="smb-input smb-color-picker__hex"
											placeholder={item.defaultValue}
											maxLength={7}
										/>
									</div>
									{error ? (
										<p className="smb-field__error">{error}</p>
									) : (
										<p className="smb-field__help">{item.help}</p>
									)}
								</div>
							</div>
						);
					})}

					<div className="smb-theme-settings__actions">
						<Button variant="ghost" onClick={handleReset} disabled={saving}>
							デフォルトに戻す
						</Button>
						<Button
							variant="primary"
							onClick={handleSave}
							loading={saving}
							disabled={!isDirty && !saving}
						>
							テーマ設定を保存
						</Button>
					</div>
				</div>
				<aside className="smb-theme-settings__preview">
					<FormPreview colors={values} />
					<p className="smb-theme-settings__preview-note">
						↑ 色を変更すると、このプレビューに即座に反映されます。
					</p>
				</aside>
			</div>
		</div>
	);
}
