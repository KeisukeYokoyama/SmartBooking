/**
 * 設定ページ - 外部連携タブ。
 *
 * - Googleカレンダー連携（OFF/ON、カレンダーID、サービスアカウントJSONキー）
 * - ChatWork 通知（OFF/ON、APIトークン、ルームID）
 *
 * デフォルトは常に OFF。ユーザーが明示的に ON にしない限り通信は発生しない旨を画面に明記する。
 *
 * 認証情報の取り扱い:
 *   - GET /settings は credentials_json をマスク文字列 '***configured***' で返す。
 *   - 何も操作されていない場合、保存リクエストにキーを含めず no-op にする。
 *   - 新規アップロード時は JSON 文字列を送信、削除時は空文字を送信する。
 */
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Switch from '../../components/Switch';

const SENTINEL = '***configured***';

const KEYS = [
	'smart_booking_google_calendar_enabled',
	'smart_booking_google_calendar_id',
	'smart_booking_chatwork_enabled',
	'smart_booking_chatwork_api_token',
	'smart_booking_chatwork_room_id',
];

function hydrate(settings) {
	return {
		smart_booking_google_calendar_enabled: !!Number(settings.smart_booking_google_calendar_enabled || 0),
		smart_booking_google_calendar_id: settings.smart_booking_google_calendar_id || '',
		smart_booking_chatwork_enabled: !!Number(settings.smart_booking_chatwork_enabled || 0),
		smart_booking_chatwork_api_token: settings.smart_booking_chatwork_api_token || '',
		smart_booking_chatwork_room_id: settings.smart_booking_chatwork_room_id || '',
	};
}

export default function IntegrationSettingsTab({ settings, onSave, saving, onDirtyChange }) {
	const [values, setValues] = useState(() => hydrate(settings || {}));
	const [initial, setInitial] = useState(() => hydrate(settings || {}));

	// 認証情報 JSON。
	//   credentialsAction: 'none' | 'upload' | 'clear'
	//   credentialsJson:   アップロード時のみ JSON 文字列を保持。
	//   isConfigured:      バックエンドから ***configured*** が来ているか。
	const [credentialsAction, setCredentialsAction] = useState('none');
	const [credentialsJson, setCredentialsJson] = useState('');
	const [credentialsFileName, setCredentialsFileName] = useState('');
	const [credentialsError, setCredentialsError] = useState('');
	const fileInputRef = useRef(null);

	const rawCredentials = (settings && settings.smart_booking_google_calendar_credentials_json) || '';
	const isConfigured = rawCredentials === SENTINEL;
	const clientEmail = (settings && settings.smart_booking_google_calendar_client_email) || '';

	useEffect(() => {
		const next = hydrate(settings || {});
		setValues(next);
		setInitial(next);
		// 設定再読込時はローカルアップロード状態をリセット。
		setCredentialsAction('none');
		setCredentialsJson('');
		setCredentialsFileName('');
		setCredentialsError('');
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	}, [settings]);

	const isDirtyBase = KEYS.some((k) => values[k] !== initial[k]);
	const isDirty = isDirtyBase || credentialsAction !== 'none';

	useEffect(() => {
		onDirtyChange && onDirtyChange(isDirty);
	}, [isDirty, onDirtyChange]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const handleFileChange = (e) => {
		setCredentialsError('');
		const file = e.target.files && e.target.files[0];
		if (!file) {
			return;
		}
		const reader = new FileReader();
		reader.onload = (ev) => {
			const text = String(ev.target.result || '');
			try {
				const parsed = JSON.parse(text);
				if (!parsed.client_email || !parsed.private_key) {
					setCredentialsError(
						'JSON に client_email / private_key が含まれていません。'
					);
					return;
				}
			} catch (err) {
				setCredentialsError('JSON の形式が正しくありません。');
				return;
			}
			setCredentialsJson(text);
			setCredentialsFileName(file.name);
			setCredentialsAction('upload');
		};
		reader.onerror = () => {
			setCredentialsError('ファイルの読み込みに失敗しました。');
		};
		reader.readAsText(file);
	};

	const handleClearCredentials = () => {
		setCredentialsAction('clear');
		setCredentialsJson('');
		setCredentialsFileName('');
		setCredentialsError('');
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleCancelUpload = () => {
		setCredentialsAction('none');
		setCredentialsJson('');
		setCredentialsFileName('');
		setCredentialsError('');
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleSave = () => {
		const patch = {
			smart_booking_google_calendar_enabled: values.smart_booking_google_calendar_enabled ? 1 : 0,
			smart_booking_google_calendar_id: values.smart_booking_google_calendar_id,
			smart_booking_chatwork_enabled: values.smart_booking_chatwork_enabled ? 1 : 0,
			smart_booking_chatwork_api_token: values.smart_booking_chatwork_api_token,
			smart_booking_chatwork_room_id: values.smart_booking_chatwork_room_id,
		};
		if (credentialsAction === 'upload') {
			patch.smart_booking_google_calendar_credentials_json = credentialsJson;
		} else if (credentialsAction === 'clear') {
			patch.smart_booking_google_calendar_credentials_json = '';
		}
		// credentialsAction === 'none' の場合はキーを送らない（バックエンド側でも no-op だが念のため）。
		onSave(patch);
	};

	const credentialsDisabled = !values.smart_booking_google_calendar_enabled;
	const showUploadedBadge = isConfigured && credentialsAction !== 'clear';
	const showStagedUpload = credentialsAction === 'upload';
	const showClearedNotice = credentialsAction === 'clear';

	return (
		<div className="smb-settings-form">
			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">Googleカレンダー連携</h3>
					<p className="smb-settings-section__lead">
						予約確定時に Google カレンダーへイベントを自動登録します。デフォルトは OFF で、
						有効化した場合のみ Google Calendar API への通信が発生します。
					</p>
				</div>

				<div className="smb-settings-row">
					<div className="smb-settings-row__label">有効/無効</div>
					<div className="smb-settings-row__control">
						<Switch
							checked={values.smart_booking_google_calendar_enabled}
							onChange={(v) =>
								update({ smart_booking_google_calendar_enabled: v })
							}
							label={
								values.smart_booking_google_calendar_enabled
									? '有効（予約確定時に連携）'
									: '無効（連携しない）'
							}
						/>
					</div>
				</div>

				<Input
					label="カレンダーID"
					value={values.smart_booking_google_calendar_id}
					onChange={(e) => update({ smart_booking_google_calendar_id: e.target.value })}
					placeholder="xxxxxxxxxxxxxxxxxxxx@group.calendar.google.com"
					help="イベントを登録する Google カレンダーの ID を入力してください。"
					disabled={credentialsDisabled}
				/>

				<div className="smb-settings-row smb-settings-row--stack">
					<div className="smb-settings-row__label">サービスアカウントJSONキー</div>
					<div className="smb-settings-row__control">
						{showUploadedBadge && (
							<div className="smb-credentials-status">
								<span className="smb-badge smb-badge--success">
									アップロード済み
								</span>
								{clientEmail && (
									<code className="smb-credentials-email">
										{clientEmail}
									</code>
								)}
								<Button
									variant="secondary"
									onClick={handleClearCredentials}
									disabled={credentialsDisabled}
								>
									削除
								</Button>
							</div>
						)}

						{showStagedUpload && (
							<div className="smb-credentials-status">
								<span className="smb-badge smb-badge--info">
									保存待ち: {credentialsFileName || 'JSONファイル'}
								</span>
								<Button variant="link" onClick={handleCancelUpload}>
									取り消し
								</Button>
							</div>
						)}

						{showClearedNotice && (
							<div className="smb-credentials-status">
								<span className="smb-badge smb-badge--warning">
									保存時に削除されます
								</span>
								<Button variant="link" onClick={handleCancelUpload}>
									取り消し
								</Button>
							</div>
						)}

						<div className="smb-credentials-uploader">
							<label className="smb-credentials-uploader__label">
								<input
									ref={fileInputRef}
									type="file"
									accept="application/json,.json"
									onChange={handleFileChange}
									disabled={credentialsDisabled}
								/>
							</label>
							<p className="smb-field-help">
								Google Cloud で発行したサービスアカウントの JSON キーファイルをアップロードしてください。
								アップロードしたファイル本体はサーバ側でのみ保持され、画面には再表示されません。
							</p>
							{credentialsError && (
								<p className="smb-field-error">{credentialsError}</p>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">ChatWork通知</h3>
					<p className="smb-settings-section__lead">
						予約受付時に ChatWork のルームへ通知メッセージを投稿します。
						デフォルトは OFF で、有効化した場合のみ ChatWork API への通信が発生します。
					</p>
				</div>

				<div className="smb-settings-row">
					<div className="smb-settings-row__label">有効/無効</div>
					<div className="smb-settings-row__control">
						<Switch
							checked={values.smart_booking_chatwork_enabled}
							onChange={(v) => update({ smart_booking_chatwork_enabled: v })}
							label={
								values.smart_booking_chatwork_enabled
									? '有効（予約受付時に通知）'
									: '無効（通知しない）'
							}
						/>
					</div>
				</div>

				<Input
					label="APIトークン"
					type="password"
					value={values.smart_booking_chatwork_api_token}
					onChange={(e) => update({ smart_booking_chatwork_api_token: e.target.value })}
					placeholder="ChatWork の APIトークン"
					disabled={!values.smart_booking_chatwork_enabled}
					help="画面の下部に表示されないようパスワード形式で入力します。"
				/>
				<Input
					label="ルームID"
					value={values.smart_booking_chatwork_room_id}
					onChange={(e) => update({ smart_booking_chatwork_room_id: e.target.value })}
					placeholder="例：123456789"
					disabled={!values.smart_booking_chatwork_enabled}
				/>
				<div className="smb-notice smb-notice--warning">
					<p>
						通知が届かない場合は、通知専用の ChatWork アカウントを作成し、そのAPIトークンを
						設定してください。自分のルームに対して自分のトークンで投稿すると届かないことがあります。
					</p>
				</div>
			</div>

			<div className="smb-settings-actions">
				<Button
					variant="primary"
					onClick={handleSave}
					loading={saving}
					disabled={!isDirty && !saving}
				>
					外部連携の設定を保存
				</Button>
			</div>
		</div>
	);
}
