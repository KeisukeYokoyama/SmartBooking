/**
 * 予約フォームのミニチュアプレビュー。
 *
 * 旧UIにはない改善点。テーマ色を変更した瞬間に
 * どこがどう変わるか確認できるようにする。
 * 実際のフロントフォームと完全一致する必要はなく、
 * 「ボタン色」「日付選択色」「時間帯選択色」「必須マーク色」「フォーカス色」の
 * 5項目がどう反映されるかをイメージさせる簡素なサンプル。
 */

export default function FormPreview({ colors }) {
	const style = {
		'--smb-preview-button': colors.smb_color_button,
		'--smb-preview-date': colors.smb_color_date_selected,
		'--smb-preview-time': colors.smb_color_time_selected,
		'--smb-preview-required': colors.smb_color_required_mark,
		'--smb-preview-focus': colors.smb_color_focus,
	};

	return (
		<div className="smb-form-preview" style={style} aria-label="予約フォームのプレビュー">
			<div className="smb-form-preview__header">
				<span className="smb-form-preview__title">予約フォームのプレビュー</span>
				<span className="smb-form-preview__badge">LIVE</span>
			</div>

			<div className="smb-form-preview__section">
				<div className="smb-form-preview__section-title">日付を選択</div>
				<div className="smb-form-preview__dates">
					{['4/24', '4/25', '4/26', '4/27', '4/28'].map((d, i) => (
						<span
							key={d}
							className={`smb-form-preview__date ${i === 2 ? 'is-selected' : ''}`}
						>
							{d}
						</span>
					))}
				</div>
			</div>

			<div className="smb-form-preview__section">
				<div className="smb-form-preview__section-title">時間を選択</div>
				<div className="smb-form-preview__times">
					{['10:00', '11:00', '13:00', '14:00'].map((t, i) => (
						<span
							key={t}
							className={`smb-form-preview__time ${i === 1 ? 'is-selected' : ''}`}
						>
							{t}
						</span>
					))}
				</div>
			</div>

			<div className="smb-form-preview__section">
				<div className="smb-form-preview__section-title">お客様情報</div>
				<label className="smb-form-preview__label">
					お名前
					<span className="smb-form-preview__required">必須</span>
				</label>
				<input
					type="text"
					className="smb-form-preview__input"
					placeholder="山田 太郎"
					readOnly
				/>
			</div>

			<button type="button" className="smb-form-preview__submit" tabIndex={-1}>
				予約内容を確認する
			</button>
		</div>
	);
}
