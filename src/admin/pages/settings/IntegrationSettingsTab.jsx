/**
 * 設定ページ - 外部連携タブ。
 *
 * - Googleカレンダー連携（OFF/ON、カレンダーID、JSONキーは後続フェーズ）
 * - ChatWork 通知（OFF/ON、APIトークン、ルームID）
 *
 * デフォルトは常に OFF。ユーザーが明示的に ON にしない限り通信は発生しない旨を画面に明記する。
 */
import { useEffect, useState } from 'react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Switch from '../../components/Switch';

const KEYS = [
	'smb_google_calendar_enabled',
	'smb_google_calendar_id',
	'smb_chatwork_enabled',
	'smb_chatwork_api_token',
	'smb_chatwork_room_id',
];

function hydrate(settings) {
	return {
		smb_google_calendar_enabled: !!Number(settings.smb_google_calendar_enabled || 0),
		smb_google_calendar_id: settings.smb_google_calendar_id || '',
		smb_chatwork_enabled: !!Number(settings.smb_chatwork_enabled || 0),
		smb_chatwork_api_token: settings.smb_chatwork_api_token || '',
		smb_chatwork_room_id: settings.smb_chatwork_room_id || '',
	};
}

export default function IntegrationSettingsTab({ settings, onSave, saving, onDirtyChange }) {
	const [values, setValues] = useState(() => hydrate(settings || {}));
	const [initial, setInitial] = useState(() => hydrate(settings || {}));

	useEffect(() => {
		const next = hydrate(settings || {});
		setValues(next);
		setInitial(next);
	}, [settings]);

	useEffect(() => {
		const dirty = KEYS.some((k) => values[k] !== initial[k]);
		onDirtyChange && onDirtyChange(dirty);
	}, [values, initial, onDirtyChange]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const handleSave = () => {
		onSave({
			smb_google_calendar_enabled: values.smb_google_calendar_enabled ? 1 : 0,
			smb_google_calendar_id: values.smb_google_calendar_id,
			smb_chatwork_enabled: values.smb_chatwork_enabled ? 1 : 0,
			smb_chatwork_api_token: values.smb_chatwork_api_token,
			smb_chatwork_room_id: values.smb_chatwork_room_id,
		});
	};

	const isDirty = KEYS.some((k) => values[k] !== initial[k]);

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
							checked={values.smb_google_calendar_enabled}
							onChange={(v) =>
								update({ smb_google_calendar_enabled: v })
							}
							label={
								values.smb_google_calendar_enabled
									? '有効（予約確定時に連携）'
									: '無効（連携しない）'
							}
						/>
					</div>
				</div>

				<Input
					label="カレンダーID"
					value={values.smb_google_calendar_id}
					onChange={(e) => update({ smb_google_calendar_id: e.target.value })}
					placeholder="xxxxxxxxxxxxxxxxxxxx@group.calendar.google.com"
					help="イベントを登録する Google カレンダーの ID を入力してください。"
					disabled={!values.smb_google_calendar_enabled}
				/>

				<div className="smb-notice smb-notice--info">
					<strong>サービスアカウントJSONキー</strong>
					<p>
						JSONキーファイルのアップロードUIは次のフェーズで実装予定です。現時点では
						カレンダーIDのみ入力可能です。
					</p>
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
							checked={values.smb_chatwork_enabled}
							onChange={(v) => update({ smb_chatwork_enabled: v })}
							label={
								values.smb_chatwork_enabled
									? '有効（予約受付時に通知）'
									: '無効（通知しない）'
							}
						/>
					</div>
				</div>

				<Input
					label="APIトークン"
					type="password"
					value={values.smb_chatwork_api_token}
					onChange={(e) => update({ smb_chatwork_api_token: e.target.value })}
					placeholder="ChatWork の APIトークン"
					disabled={!values.smb_chatwork_enabled}
					help="画面の下部に表示されないようパスワード形式で入力します。"
				/>
				<Input
					label="ルームID"
					value={values.smb_chatwork_room_id}
					onChange={(e) => update({ smb_chatwork_room_id: e.target.value })}
					placeholder="例：123456789"
					disabled={!values.smb_chatwork_enabled}
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
