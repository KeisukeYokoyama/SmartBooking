/**
 * 設定ページ - メール通知タブ。
 *
 * - 差出人設定
 * - 予約受付メール（ユーザー宛 / 管理者宛）の件名・本文
 * - 予約承認メール（ユーザー宛）の件名・本文
 * - 各本文 textarea の横にテンプレート変数を表示し、クリックで挿入できる
 */
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../api';
import Button from '../../components/Button';
import ConfirmDialog from '../../components/ConfirmDialog';
import Input from '../../components/Input';
import Switch from '../../components/Switch';
import { useToast } from '../../components/ToastContainer';
import { buildFormVariables } from '../../utils/mailVariables';
import BodyFieldWithHelper from './MailBodyField';

// フォーム設定「メール」タブへの遷移先（フルリロード。同ディレクトリの admin.php へ相対）。
const FORM_MAIL_TAB_URL =
	(typeof window !== 'undefined' ? window.location.pathname : '') +
	'?page=smart-booking-form-settings&smb_tab=mail';

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

// mail-error API の category → 非技術者向けの日本語メッセージ。
const MAIL_ERROR_CATEGORY_LABELS = {
	transport_failed:
		'直近のメール送信に失敗しました。サーバのメール送信設定（SMTP 等）をご確認ください。',
	skipped_empty_template:
		'メールの件名または本文が未設定のため送信されませんでした。テンプレートをご確認ください。',
	skipped_invalid_recipient:
		'宛先メールアドレスが正しくないため送信されませんでした。',
};

const MAIL_ERROR_TO_TYPE_LABELS = {
	user: 'お客様',
	admin: '管理者',
};

/**
 * unix秒 → 「2026/07/13 14:30」形式のローカル表記に整形する。
 *
 * @param {number} unixSeconds unix秒
 * @return {string} 整形済み日時。値が無ければ空文字。
 */
function formatMailErrorTime(unixSeconds) {
	if (!unixSeconds) return '';
	const d = new Date(unixSeconds * 1000);
	const pad = (n) => String(n).padStart(2, '0');
	return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
		d.getHours()
	)}:${pad(d.getMinutes())}`;
}

/**
 * 直近のメール送信失敗/スキップを知らせる注意バナー。
 *
 * 記録が無い（error === null）場合は何も描画しない。
 */
function MailErrorBanner({ error, onDismiss, dismissing }) {
	if (!error) return null;

	const message =
		MAIL_ERROR_CATEGORY_LABELS[error.category] ||
		'直近のメール送信で問題が発生しました。設定内容をご確認ください。';
	const toTypeLabel = MAIL_ERROR_TO_TYPE_LABELS[error.to_type] || '';
	const timeLabel = formatMailErrorTime(error.time);

	return (
		<div className="smb-alert smb-alert--warning" role="alert">
			<span className="smb-alert__icon" aria-hidden="true">
				!
			</span>
			<span className="smb-alert__message">
				<strong className="smb-alert__title">{message}</strong>
				{(timeLabel || toTypeLabel) && (
					<span className="smb-alert__meta">
						{timeLabel && `発生日時：${timeLabel}`}
						{timeLabel && toTypeLabel && '　'}
						{toTypeLabel && `宛先：${toTypeLabel}`}
					</span>
				)}
			</span>
			<span className="smb-alert__actions">
				<button
					type="button"
					className="smb-alert__close"
					aria-label="閉じる"
					onClick={onDismiss}
					disabled={dismissing}
				>
					×
				</button>
			</span>
		</div>
	);
}

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

/**
 * 専用文面（フォーム設定 > メール）を使用中のフォームがあれば注記する。
 * 対象フォームが無ければ何も描画しない＝現行と完全に同じ見た目を保つ。
 */
function OverrideNote({ formNames }) {
	if (!formNames || formNames.length === 0) return null;
	return (
		<div className="smb-settings-section__override-note">
			<p>
				※ {formNames.join('、')}{' '}
				は専用文面を使用中（このテンプレートの変更は反映されません）
			</p>
			<a
				href={FORM_MAIL_TAB_URL}
				className="smb-settings-section__override-link"
			>
				フォーム設定のメールタブを開く
			</a>
		</div>
	);
}

export default function MailSettingsTab({ settings, onSave, saving, onDirtyChange }) {
	const [values, setValues] = useState(() => hydrate(settings || {}));
	const [initial, setInitial] = useState(() => hydrate(settings || {}));
	const [adminToggleConfirmOpen, setAdminToggleConfirmOpen] = useState(false);
	const [mailError, setMailError] = useState(null);
	const [mailErrorDismissing, setMailErrorDismissing] = useState(false);
	const [customGroups, setCustomGroups] = useState([]);
	const [formsForOverride, setFormsForOverride] = useState([]);
	const { showToast } = useToast();

	useEffect(() => {
		const next = hydrate(settings || {});
		setValues(next);
		setInitial(next);
	}, [settings]);

	// タブ表示時に直近のメール送信失敗/スキップ記録を取得する。
	// 取得失敗時はタブ本体の機能に影響させず、注意表示を出さないだけにする。
	useEffect(() => {
		let cancelled = false;
		API.mailError
			.get()
			.then((res) => {
				if (!cancelled) {
					setMailError(res && res.error ? res.error : null);
				}
			})
			.catch(() => {
				// noop: 注意表示は補助情報のため、失敗時は無表示にとどめる。
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// 各フォームのカスタムフィールドを取得し、メール本文に挿入できる変数一覧を組み立てる。
	// 複数フォーム（v0.4.0）では同じ field_key が別フォームに存在し得るため、フォーム別に分ける。
	// 併せて各フォームの mail_overrides（v0.5.0）を保持し、専用文面使用中フォームの注記に使う。
	// 取得失敗時は固定変数のみの表示にとどめ、タブ本体の機能には影響させない。
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const forms = await API.forms.list();
				const list = Array.isArray(forms) ? forms : [];
				const fieldsPerForm = await Promise.all(
					list.map((f) => API.customFields.list(f.id).catch(() => []))
				);
				const groups = [];
				list.forEach((form, idx) => {
					const fields = Array.isArray(fieldsPerForm[idx]) ? fieldsPerForm[idx] : [];
					const variables = buildFormVariables(fields);
					if (variables.length > 0) {
						groups.push({ formId: form.id, formName: form.name, variables });
					}
				});
				if (!cancelled) {
					setCustomGroups(groups);
					setFormsForOverride(list);
				}
			} catch {
				// noop: 変数一覧・注記は補助情報のため、失敗時は固定変数のみ表示にとどめる。
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleDismissMailError = async () => {
		const prev = mailError;
		setMailErrorDismissing(true);
		setMailError(null); // 楽観的更新
		try {
			await API.mailError.clear();
		} catch (err) {
			setMailError(prev);
			showToast(err.message || '注意表示の削除に失敗しました。', 'error');
		} finally {
			setMailErrorDismissing(false);
		}
	};

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

	// 種別ごとに「このフォームの専用文面が有効」なフォーム名を集計する（共通側の注記に使う）。
	const overrideFormNamesByType = useMemo(() => {
		const result = { reception_user: [], reception_admin: [], approval_user: [] };
		formsForOverride.forEach((form) => {
			const overrides = form.mail_overrides || {};
			Object.keys(result).forEach((type) => {
				if (overrides[type] && overrides[type].enabled) {
					result[type].push(form.name);
				}
			});
		});
		return result;
	}, [formsForOverride]);

	return (
		<div className="smb-settings-form">
			<MailErrorBanner
				error={mailError}
				onDismiss={handleDismissMailError}
				dismissing={mailErrorDismissing}
			/>

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
					<OverrideNote formNames={overrideFormNamesByType.reception_user} />
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
					customGroups={customGroups}
				/>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約受付メール（管理者宛）</h3>
					<p className="smb-settings-section__lead">
						予約が入ったときに店舗メール（To）と担当者メール（CC）へ届きます。「管理者へのメール」がオンのときは、加えて WordPress の管理者メールにも同時に通知が送られます。
					</p>
					<OverrideNote formNames={overrideFormNamesByType.reception_admin} />
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
					customGroups={customGroups}
				/>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">予約承認メール（ユーザー宛）</h3>
					<p className="smb-settings-section__lead">
						管理者が予約を「承認」に変更したときにユーザーに届くメール。
					</p>
					<OverrideNote formNames={overrideFormNamesByType.approval_user} />
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
					customGroups={customGroups}
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
