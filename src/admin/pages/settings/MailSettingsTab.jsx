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
import ConfirmDialog from '../../components/ConfirmDialog';
import Input from '../../components/Input';
import Switch from '../../components/Switch';
import Textarea from '../../components/Textarea';
import TemplateVariableHelper from './TemplateVariableHelper';

const MAIL_KEYS = [
	'smart_booking_mail_from_name',
	'smart_booking_mail_from_email',
	'smart_booking_mail_admin_notify_enabled',
	'smart_booking_mail_receipt_user_subject',
	'smart_booking_mail_receipt_user_body',
	'smart_booking_mail_receipt_admin_subject',
	'smart_booking_mail_receipt_admin_body',
	'smart_booking_mail_approval_user_subject',
	'smart_booking_mail_approval_user_body',
];

const BOOL_KEYS = new Set(['smart_booking_mail_admin_notify_enabled']);

function hydrate(settings) {
	const out = {};
	for (const k of MAIL_KEYS) {
		if (BOOL_KEYS.has(k)) {
			// 未保存環境では undefined を許容しデフォルト ON とする。
			const raw = settings[k];
			out[k] = raw === undefined || raw === '' ? 1 : Number(raw) ? 1 : 0;
		} else {
			out[k] = settings[k] || '';
		}
	}
	return out;
}

function BodyFieldWithHelper({ label, value, onChange, helperId, disabled = false }) {
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
	const [adminToggleConfirmOpen, setAdminToggleConfirmOpen] = useState(false);

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

	const handleAdminNotifyChange = (next) => {
		if (next) {
			update({ smart_booking_mail_admin_notify_enabled: 1 });
		} else {
			// OFF にする際は確認ダイアログ。確定するまで値は変えない。
			setAdminToggleConfirmOpen(true);
		}
	};

	const confirmAdminNotifyOff = () => {
		update({ smart_booking_mail_admin_notify_enabled: 0 });
		setAdminToggleConfirmOpen(false);
	};

	const cancelAdminNotifyOff = () => {
		setAdminToggleConfirmOpen(false);
	};

	const handleSave = () => onSave({ ...values });

	const isDirty = MAIL_KEYS.some((k) => values[k] !== initial[k]);
	const adminNotifyOn = 1 === Number(values.smart_booking_mail_admin_notify_enabled);

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
						value={values.smart_booking_mail_from_name}
						onChange={(e) => update({ smart_booking_mail_from_name: e.target.value })}
						placeholder="例：〇〇予約受付"
					/>
					<Input
						label="差出人メールアドレス"
						type="email"
						value={values.smart_booking_mail_from_email}
						onChange={(e) => update({ smart_booking_mail_from_email: e.target.value })}
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
					value={values.smart_booking_mail_receipt_user_subject}
					onChange={(e) =>
						update({ smart_booking_mail_receipt_user_subject: e.target.value })
					}
					placeholder="ご予約を受け付けました（{store_name}）"
				/>
				<BodyFieldWithHelper
					label="本文"
					value={values.smart_booking_mail_receipt_user_body}
					onChange={(v) => update({ smart_booking_mail_receipt_user_body: v })}
					helperId="helper-receipt-user"
				/>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約受付メール（管理者宛）</h3>
					<p className="smb-settings-section__lead">
						予約が入ったときに店舗メール（To）と担当者メール（CC）へ届きます。「管理者へのメール」がオンのときは、加えて WordPress の管理者メールにも同時に通知が送られます。
					</p>
				</div>
				<div className="smb-settings-toggle-row">
					<Switch
						id="smb-admin-notify-toggle"
						checked={adminNotifyOn}
						onChange={handleAdminNotifyChange}
						label="管理者へのメール"
					/>
					<p className="smb-settings-toggle-row__hint">
						オフにすると、WordPress の管理者メールへの通知は送られません。店舗・担当者宛の通知は引き続き送信されます。
					</p>
				</div>
				<Input
					label="件名"
					value={values.smart_booking_mail_receipt_admin_subject}
					onChange={(e) =>
						update({ smart_booking_mail_receipt_admin_subject: e.target.value })
					}
					placeholder="新しい予約が入りました（{customer_name}様）"
				/>
				<BodyFieldWithHelper
					label="本文"
					value={values.smart_booking_mail_receipt_admin_body}
					onChange={(v) => update({ smart_booking_mail_receipt_admin_body: v })}
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
					value={values.smart_booking_mail_approval_user_subject}
					onChange={(e) =>
						update({ smart_booking_mail_approval_user_subject: e.target.value })
					}
					placeholder="ご予約が確定しました（{store_name}）"
				/>
				<BodyFieldWithHelper
					label="本文"
					value={values.smart_booking_mail_approval_user_body}
					onChange={(v) => update({ smart_booking_mail_approval_user_body: v })}
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

			<ConfirmDialog
				open={adminToggleConfirmOpen}
				title="管理者へのメールをオフにしますか？"
				message="店舗や担当者のメールアドレスが登録されていない場合、予約完了メールは届きません。"
				confirmLabel="オフにする"
				cancelLabel="キャンセル"
				variant="danger"
				onConfirm={confirmAdminNotifyOff}
				onCancel={cancelAdminNotifyOff}
			/>
		</div>
	);
}
