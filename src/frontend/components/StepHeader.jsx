/**
 * ステップヘッダ（タイトル + 任意の戻るボタン）。
 *
 * 参考 UI（docs/reference-ui/screenshot-1.png）に合わせ、中央寄せのシンプルな見出しにする。
 */
export default function StepHeader({ title, subtitle, onBack }) {
	return (
		<div className="smb-front-step-header">
			{onBack && (
				<button
					type="button"
					className="smb-front-step-header__back"
					onClick={onBack}
					aria-label="前のステップに戻る"
				>
					<span aria-hidden="true">←</span>
					<span>戻る</span>
				</button>
			)}
			<h2 className="smb-front-step-header__title">{title}</h2>
			{subtitle && <p className="smb-front-step-header__subtitle">{subtitle}</p>}
		</div>
	);
}
