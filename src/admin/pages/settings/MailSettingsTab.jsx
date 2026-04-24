/**
 * 設定ページ - メール通知タブ。
 *
 * - 差出人設定
 * - 予約受付メール（ユーザー宛 / 管理者宛）の件名・本文
 * - 予約承認メール（ユーザー宛）の件名・本文
 * - 各本文 textarea の横にテンプレート変数を表示し、クリックで挿入できる
 */
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Textarea from '../../components/Textarea';
import TemplateVariableHelper from './TemplateVariableHelper';

const MAIL_KEYS = [
	'smb_mail_from_name',
	'smb_mail_from_email',
	'smb_mail_receipt_user_subject',
	'smb_mail_receipt_user_body',
	'smb_mail_receipt_admin_subject',
	'smb_mail_receipt_admin_body',
	'smb_mail_approval_user_subject',
	'smb_mail_approval_user_body',
];

function hydrate(settings) {
	const out = {};
	for (const k of MAIL_KEYS) {
		out[k] = settings[k] || '';
	}
	return out;
}

function BodyFieldWithHelper({ label, value, onChange, helperId }) {
	return (
		<div className="smb-mail-body">
			<Textarea
				label={label}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				rows={8}
			/>
			<TemplateHelperBinding
				helperId={helperId}
				onInsert={(next) => onChange(next)}
			/>
		</div>
	);
}

/**
 * Textarea コンポーネントは forwardRef していないため、
 * セクションの DOM から直接 textarea 要素を取得して
 * TemplateVariableHelper に渡す薄いラッパ。
 */
function TemplateHelperBinding({ helperId, onInsert }) {
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
			<TemplateVariableHelper textareaRef={taRefProxy} onInsert={onInsert} />
		</div>
	);
}

export default function MailSettingsTab({ settings, onSave, saving, onDirtyChange }) {
	const [values, setValues] = useState(() => hydrate(settings || {}));
	const [initial, setInitial] = useState(() => hydrate(settings || {}));

	useEffect(() => {
		const next = hydrate(settings || {});
		setValues(next);
		setInitial(next);
	}, [settings]);

	useEffect(() => {
		const dirty = MAIL_KEYS.some((k) => values[k] !== initial[k]);
		onDirtyChange && onDirtyChange(dirty);
	}, [values, initial, onDirtyChange]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const handleSave = () => onSave({ ...values });

	const isDirty = MAIL_KEYS.some((k) => values[k] !== initial[k]);

	return (
		<div className="smb-settings-form">
			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">差出人設定</h3>
					<p className="smb-settings-section__lead">
						予約者・管理者に届くメールの From 情報を設定します。
					</p>
				</div>
				<div className="smb-field-group smb-field-group--contact">
					<Input
						label="差出人名"
						value={values.smb_mail_from_name}
						onChange={(e) => update({ smb_mail_from_name: e.target.value })}
						placeholder="例：〇〇予約受付"
					/>
					<Input
						label="差出人メールアドレス"
						type="email"
						value={values.smb_mail_from_email}
						onChange={(e) => update({ smb_mail_from_email: e.target.value })}
						placeholder="noreply@example.com"
					/>
				</div>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約受付メール（ユーザー宛）</h3>
					<p className="smb-settings-section__lead">
						予約を送信した直後にユーザーに届くメール。
					</p>
				</div>
				<Input
					label="件名"
					value={values.smb_mail_receipt_user_subject}
					onChange={(e) =>
						update({ smb_mail_receipt_user_subject: e.target.value })
					}
					placeholder="ご予約を受け付けました（{store_name}）"
				/>
				<BodyFieldWithHelper
					label="本文"
					value={values.smb_mail_receipt_user_body}
					onChange={(v) => update({ smb_mail_receipt_user_body: v })}
					helperId="helper-receipt-user"
				/>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約受付メール（管理者宛）</h3>
					<p className="smb-settings-section__lead">
						予約が入ったときに店舗メールへ届くメール。担当者メールが設定されていればCCに入ります。
					</p>
				</div>
				<Input
					label="件名"
					value={values.smb_mail_receipt_admin_subject}
					onChange={(e) =>
						update({ smb_mail_receipt_admin_subject: e.target.value })
					}
					placeholder="新しい予約が入りました（{customer_name}様）"
				/>
				<BodyFieldWithHelper
					label="本文"
					value={values.smb_mail_receipt_admin_body}
					onChange={(v) => update({ smb_mail_receipt_admin_body: v })}
					helperId="helper-receipt-admin"
				/>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約承認メール（ユーザー宛）</h3>
					<p className="smb-settings-section__lead">
						管理者が予約を「承認」に変更したときにユーザーに届くメール。
					</p>
				</div>
				<Input
					label="件名"
					value={values.smb_mail_approval_user_subject}
					onChange={(e) =>
						update({ smb_mail_approval_user_subject: e.target.value })
					}
					placeholder="ご予約が確定しました（{store_name}）"
				/>
				<BodyFieldWithHelper
					label="本文"
					value={values.smb_mail_approval_user_body}
					onChange={(v) => update({ smb_mail_approval_user_body: v })}
					helperId="helper-approval-user"
				/>
			</div>

			<div className="smb-settings-actions">
				<Button
					variant="primary"
					onClick={handleSave}
					loading={saving}
					disabled={!isDirty && !saving}
				>
					メール設定を保存
				</Button>
			</div>
		</div>
	);
}
