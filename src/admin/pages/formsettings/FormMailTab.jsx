/**
 * フォーム設定 - メールタブ（v0.5.0 フォーム別メール文面）。
 *
 * 予約受付（ユーザー宛 / 管理者宛）・予約承認（ユーザー宛）の3種別ごとに
 * 「このフォーム専用の文面を使う」を独立にトグルできる。
 *
 * - OFF（既定）: 「設定 > メール通知」の共通テンプレートが使われる。ここでは共通文面を
 *   薄色・読み取り専用でプレビューするだけ。
 * - ON: その時点の共通テンプレートをプリセットした上で、件名・本文を編集できる。
 *   変数ヘルパーは選択中フォームのカスタムフィールドのみを表示する（v0.4.2 のヘルパー再利用）。
 * - OFF にしても入力済みの文面は破棄しない（再 ON で復活する）。
 *
 * 保存は PUT /forms/{id} に mail_overrides（3種別すべて）を送る。
 */
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../api';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Switch from '../../components/Switch';
import Textarea from '../../components/Textarea';
import { useToast } from '../../components/ToastContainer';
import { buildFormVariables } from '../../utils/mailVariables';
import BodyFieldWithHelper from '../settings/MailBodyField';

// サーバ側 Smart_Booking_REST_Forms::MAIL_OVERRIDE_TYPES と同じ3種・同じ並び順。
const MAIL_TYPES = ['reception_user', 'reception_admin', 'approval_user'];

// 種別ごとの見出し・説明・対応する共通設定（プリセット元 / OFF時プレビュー元）のキー。
// 見出しは「設定 > メール通知」タブと同一表記にする。
const MAIL_TYPE_META = {
	reception_user: {
		label: '予約受付メール（ユーザー宛）',
		lead: '予約を送信した直後にユーザーに届くメール。',
		subjectKey: 'smart_booking_mail_receipt_user_subject',
		bodyKey: 'smart_booking_mail_receipt_user_body',
	},
	reception_admin: {
		label: '予約受付メール（管理者宛）',
		lead: '予約が入ったときに店舗・担当者・管理者へ届くメール。',
		subjectKey: 'smart_booking_mail_receipt_admin_subject',
		bodyKey: 'smart_booking_mail_receipt_admin_body',
	},
	approval_user: {
		label: '予約承認メール（ユーザー宛）',
		lead: '管理者が予約を「承認」に変更したときにユーザーに届くメール。',
		subjectKey: 'smart_booking_mail_approval_user_subject',
		bodyKey: 'smart_booking_mail_approval_user_body',
	},
};

/**
 * フォームの mail_overrides（サーバ正規化済み、常に3種別）→ ローカル編集用 state に変換する。
 * 欠落種別・欠落キーは enabled=false / subject='' / body='' として扱う。
 *
 * @param {Object|null|undefined} mailOverrides selectedForm.mail_overrides
 * @return {Object} 3種別ぶんの { enabled, subject, body }
 */
function hydrateOverrides(mailOverrides) {
	const src = mailOverrides || {};
	const out = {};
	MAIL_TYPES.forEach((type) => {
		const entry = src[type] || {};
		out[type] = {
			enabled: !!entry.enabled,
			subject: entry.subject || '',
			body: entry.body || '',
		};
	});
	return out;
}

export default function FormMailTab({ selectedForm, fields, onSaved, onDirtyChange }) {
	// 共通テンプレート（プリセット元 & OFF時プレビュー元）。取得失敗は致命にせず空扱い。
	const [commonTemplates, setCommonTemplates] = useState({});
	const [overrides, setOverrides] = useState(() =>
		hydrateOverrides(selectedForm && selectedForm.mail_overrides)
	);
	const [initial, setInitial] = useState(() =>
		hydrateOverrides(selectedForm && selectedForm.mail_overrides)
	);
	const [saving, setSaving] = useState(false);
	const { showToast } = useToast();

	// 共通テンプレートは1回だけ取得する（プリセット/プレビューの補助情報）。
	useEffect(() => {
		let cancelled = false;
		API.settings
			.get()
			.then((res) => {
				if (!cancelled) {
					setCommonTemplates(res && res.settings ? res.settings : {});
				}
			})
			.catch(() => {
				// noop: プリセット/プレビューは補助情報のため、失敗してもタブ本体は動かす。
			});
		return () => {
			cancelled = true;
		};
	}, []);

	// 選択中フォームが変わったら（別フォームに切り替えた）再 hydrate する。
	// 依存を selectedForm.id にとどめ、同一フォームのオブジェクト参照が保存後の再読込等で
	// 差し替わっただけの場合（改名・loadForms の再取得）は未保存の編集を巻き込んで破棄しない。
	// eslint-disable-next-line react-hooks/exhaustive-deps
	useEffect(() => {
		if (!selectedForm) return;
		const next = hydrateOverrides(selectedForm.mail_overrides);
		setOverrides(next);
		setInitial(next);
	}, [selectedForm?.id]);

	// 変数ヘルパーは選択中フォームの変数のみ（v0.4.2 のフォーム別ヘルパーを再利用）。
	const customGroups = useMemo(() => {
		if (!selectedForm) return [];
		const variables = buildFormVariables(fields);
		if (variables.length === 0) return [];
		return [{ formId: selectedForm.id, formName: selectedForm.name, variables }];
	}, [fields, selectedForm]);

	const handleToggle = (type, nextEnabled) => {
		setOverrides((prev) => {
			const current = prev[type];
			if (nextEnabled) {
				// 件名・本文が両方とも空のときだけ、その時点の共通テンプレートを複製してプリセットする。
				// 既に下書きがある場合は破棄しない（OFF→再ONで復活する仕様と一致させる）。
				const hasDraft = !!current.subject || !!current.body;
				if (!hasDraft) {
					const meta = MAIL_TYPE_META[type];
					return {
						...prev,
						[type]: {
							enabled: true,
							subject: commonTemplates[meta.subjectKey] || '',
							body: commonTemplates[meta.bodyKey] || '',
						},
					};
				}
				return { ...prev, [type]: { ...current, enabled: true } };
			}
			// OFF にする際も subject/body は保持したまま enabled だけ落とす（破棄しない）。
			return { ...prev, [type]: { ...current, enabled: false } };
		});
	};

	const updateField = (type, patch) => {
		setOverrides((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));
	};

	const isDirty = MAIL_TYPES.some((type) => {
		const a = overrides[type];
		const b = initial[type];
		return a.enabled !== b.enabled || a.subject !== b.subject || a.body !== b.body;
	});

	// 未保存の変更をページ側（タブ切替・フォーム切替の確認ダイアログ）に伝える。
	useEffect(() => {
		onDirtyChange && onDirtyChange(isDirty);
	}, [isDirty, onDirtyChange]);

	// アンマウント時（メールタブから離脱したとき等）に未保存フラグを確実に false へ戻す。
	// これにより親の mailDirty は常に FormMailTab の実 dirty を忠実に反映し、
	// 手動リセットのタイミングずれ（フォーム追加モーダルを開いた直後にキャンセルした等）で
	// ガードが失効することを防ぐ（未保存フラグの単一情報源＝このコンポーネント）。
	useEffect(() => {
		return () => {
			onDirtyChange && onDirtyChange(false);
		};
	}, [onDirtyChange]);

	/**
	 * enabled=true の各種別について、件名・本文が両方入力済みかを検証する。
	 * 未入力の種別があれば見出し名を名指ししたトーストを出し、保存処理を進めない
	 * （サーバ側の smb_form_mail_override_incomplete はバックストップとして残る）。
	 *
	 * @return {boolean} 検証OKなら true
	 */
	const validateBeforeSave = () => {
		const incompleteLabels = MAIL_TYPES.filter((type) => {
			const o = overrides[type];
			return o.enabled && (!o.subject.trim() || !o.body.trim());
		}).map((type) => MAIL_TYPE_META[type].label);

		if (incompleteLabels.length > 0) {
			showToast(
				`「${incompleteLabels.join('」「')}」の件名と本文を入力してください。`,
				'error',
				6000
			);
			return false;
		}
		return true;
	};

	const handleSave = async () => {
		if (!selectedForm) return;
		if (!validateBeforeSave()) return;
		setSaving(true);
		try {
			// 3種別すべて（OFF分の下書きも含めて）を送る。
			await API.forms.update(selectedForm.id, { mail_overrides: overrides });
			showToast('メール文面を保存しました', 'success');
			setInitial(overrides);
			onSaved && onSaved();
		} catch (err) {
			showToast(err.message || '保存に失敗しました。', 'error', 6000);
		} finally {
			setSaving(false);
		}
	};

	if (!selectedForm) return null;

	return (
		<div className="smb-settings-form">
			<div className="smb-notice smb-notice--info">
				<p>未設定の項目は「設定 → メール通知」の共通文面が使われます。</p>
			</div>

			{MAIL_TYPES.map((type) => {
				const meta = MAIL_TYPE_META[type];
				const override = overrides[type];
				return (
					<div className="smb-settings-section" key={type}>
						<div className="smb-settings-section__header">
							<h3 className="smb-settings-section__title">{meta.label}</h3>
							<p className="smb-settings-section__lead">{meta.lead}</p>
						</div>
						<div className="smb-settings-toggle-row">
							<Switch
								id={`smb-form-mail-toggle-${type}`}
								checked={override.enabled}
								onChange={(next) => handleToggle(type, next)}
								label="このフォーム専用の文面を使う"
							/>
						</div>

						{override.enabled ? (
							<>
								<Input
									label="件名"
									value={override.subject}
									onChange={(e) =>
										updateField(type, { subject: e.target.value })
									}
								/>
								<BodyFieldWithHelper
									label="本文"
									value={override.body}
									onChange={(v) => updateField(type, { body: v })}
									helperId={`helper-form-mail-${type}`}
									customGroups={customGroups}
								/>
							</>
						) : (
							<div className="smb-mail-override-preview">
								<p className="smb-mail-override-preview__note">
									未設定のため共通文面が使われます。
								</p>
								<Input
									label="件名（共通）"
									value={commonTemplates[meta.subjectKey] || ''}
									disabled
								/>
								<Textarea
									label="本文（共通）"
									value={commonTemplates[meta.bodyKey] || ''}
									rows={8}
									disabled
								/>
							</div>
						)}
					</div>
				);
			})}

			<div className="smb-settings-actions">
				<Button
					variant="primary"
					onClick={handleSave}
					loading={saving}
					disabled={!isDirty && !saving}
				>
					メール文面を保存
				</Button>
			</div>
		</div>
	);
}
