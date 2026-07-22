/**
 * メール本文用の共通フィールド（変数挿入ヘルパー付き）。
 *
 * 設定 > メール通知（MailSettingsTab）とフォーム設定 > メール（FormMailTab）の
 * 双方で使う共有コンポーネント（v0.4.2 のヘルパーをそのまま再利用するための抽出）。
 */
import { useEffect, useRef } from 'react';
import Textarea from '../../components/Textarea';
import TemplateVariableHelper from './TemplateVariableHelper';

/**
 * Textarea コンポーネントは forwardRef していないため、
 * セクションの DOM から直接 textarea 要素を取得して
 * TemplateVariableHelper に渡す薄いラッパ。
 */
function TemplateHelperBinding({ helperId, onInsert, customGroups = [] }) {
	const hiddenRef = useRef(null);

	// マウント後、同じ親ブロックの textarea を取得して ref に保持。
	useEffect(() => {
		if (!hiddenRef.current) return;
		const parent = hiddenRef.current.closest('.smb-mail-body');
		if (!parent) return;
		const ta = parent.querySelector('textarea');
		if (ta) {
			// useRef.current の代わりに独自プロパティで保持
			hiddenRef.current.__ta = ta;
		}
	});

	// TemplateVariableHelper は textareaRef.current を参照するため
	// {current: ta} を疑似的に渡すラッパ ref を作る
	const taRefProxy = {
		get current() {
			return hiddenRef.current ? hiddenRef.current.__ta : null;
		},
	};

	return (
		<div ref={hiddenRef} id={helperId}>
			<TemplateVariableHelper
				textareaRef={taRefProxy}
				onInsert={onInsert}
				customGroups={customGroups}
			/>
		</div>
	);
}

export default function BodyFieldWithHelper({
	label,
	value,
	onChange,
	helperId,
	customGroups = [],
	disabled = false,
}) {
	return (
		<div className="smb-mail-body">
			<Textarea
				label={label}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={8}
				disabled={disabled}
			/>
			<TemplateHelperBinding
				helperId={helperId}
				onInsert={(next) => onChange(next)}
				customGroups={customGroups}
			/>
		</div>
	);
}
