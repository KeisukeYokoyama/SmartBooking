/**
 * 予約詳細モーダル。
 *
 * - 予約の全情報を閲覧、ステータス / 管理者メモ を編集可能
 * - 予約日時・店舗・担当者は変更不可（UI では読み取り専用）
 * - カスタムフィールドは閲覧のみ（編集はできない。仕様の簡素化）
 * - 削除は内側のボタンから ConfirmDialog 経由で
 *
 * 現状の REST API (PUT /reservations/{id}) が受け付けるのは status と admin_memo のみ。
 * 氏名・メール・電話の編集は今回は対応しない（YAGNI）。
 */
import { useEffect, useMemo, useState } from 'react';
import { API } from '../../api';
import Button from '../../components/Button';
import ErrorMessage from '../../components/ErrorMessage';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import Spinner from '../../components/Spinner';
import Textarea from '../../components/Textarea';
import StatusBadge, { STATUS_OPTIONS, STATUS_LABELS } from './StatusBadge';

function formatDate(s) {
	return s || '—';
}

function formatTime(s) {
	return s ? String(s).slice(0, 5) : '—';
}

export default function ReservationDetailModal({
	open,
	reservationId,
	onClose,
	onSaved,
	onAskDelete,
	stores = [],
	staff = [],
	customFields = [],
}) {
	const [loading, setLoading] = useState(false);
	const [loadError, setLoadError] = useState(null);
	const [data, setData] = useState(null);
	const [status, setStatus] = useState('pending');
	const [memo, setMemo] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState(null);

	const storeMap = useMemo(() => new Map(stores.map((s) => [s.id, s])), [stores]);
	const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

	useEffect(() => {
		if (!open || !reservationId) return;
		let cancelled = false;
		setLoading(true);
		setLoadError(null);
		setData(null);
		setFormError(null);
		API.reservations
			.get(reservationId)
			.then((row) => {
				if (cancelled) return;
				setData(row);
				setStatus(row.status);
				setMemo(row.admin_memo || '');
			})
			.catch((err) => {
				if (cancelled) return;
				setLoadError(err.message || '予約情報の読み込みに失敗しました。');
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, reservationId]);

	const dirty = !!data && (status !== data.status || (memo || '') !== (data.admin_memo || ''));
	// Modal の isDirty 機構に統一: Escape/背景クリック/× ボタンは Modal 側で確認、
	// フッターの「閉じる」ボタンはここで同じ文言の確認をかける（同一ガードを通る）。
	const isDirty = !submitting && dirty;
	const dirtyConfirmMessage = '変更内容が保存されていません。閉じてもよろしいですか？';

	const handleCloseFromButton = () => {
		if (submitting) return;
		if (isDirty) {
			const ok =
				typeof window !== 'undefined' ? window.confirm(dirtyConfirmMessage) : true;
			if (!ok) return;
		}
		onClose();
	};

	const handleSave = async () => {
		if (!data) return;
		setSubmitting(true);
		setFormError(null);
		try {
			const updated = await API.reservations.update(data.id, { status, admin_memo: memo });
			setData(updated);
			if (onSaved) onSaved(updated);
		} catch (err) {
			setFormError(err.message || '保存に失敗しました。');
		} finally {
			setSubmitting(false);
		}
	};

	const handleDelete = () => {
		if (!data) return;
		onAskDelete(data);
	};

	// システムエンティティ（is_system=1）は内部参照用なので「—」で隠す。
	const storeName = data
		? data.store_is_system
			? '—'
			: storeMap.get(data.store_id)?.name || '—'
		: '—';
	const staffName = data
		? data.staff_is_system
			? '—'
			: staffMap.get(data.staff_id)?.name || '—'
		: '—';

	// カスタムフィールドを表示用に整形（ core 3 フィールドは除外）.
	const displayFields = useMemo(
		() => customFields.filter((f) => !['customer_name', 'customer_email', 'customer_phone'].includes(f.field_key)),
		[customFields]
	);

	return (
		<Modal
			open={open}
			onClose={onClose}
			isDirty={isDirty}
			dirtyConfirmMessage={dirtyConfirmMessage}
			title={data ? `予約 #${data.id} の詳細` : '予約の詳細'}
			size="lg"
			footer={
				<>
					<Button variant="ghost" onClick={handleDelete} disabled={!data || submitting}>
						削除
					</Button>
					<div className="smb-modal__spacer" />
					<Button variant="secondary" onClick={handleCloseFromButton} disabled={submitting}>
						閉じる
					</Button>
					<Button variant="primary" onClick={handleSave} loading={submitting} disabled={!data || !dirty}>
						変更を保存
					</Button>
				</>
			}
		>
			{loading && (
				<div className="smb-loading">
					<Spinner label="読み込み中" />
					<span>予約情報を読み込んでいます…</span>
				</div>
			)}
			{loadError && !loading && <ErrorMessage message={loadError} />}
			{!loading && !loadError && data && (
				<div className="smb-reservation-detail">
					<div className="smb-reservation-detail__summary">
						<div className="smb-reservation-detail__summary-row">
							<span className="smb-reservation-detail__label">現在のステータス</span>
							<StatusBadge status={data.status} />
						</div>
						<div className="smb-reservation-detail__summary-row">
							<span className="smb-reservation-detail__label">予約番号</span>
							<span className="smb-reservation-detail__value">#{data.id}</span>
						</div>
					</div>

					<section className="smb-reservation-detail__section">
						<h3 className="smb-reservation-detail__section-title">予約枠</h3>
						<dl className="smb-reservation-detail__defs">
							<div>
								<dt>予約日</dt>
								<dd>{formatDate(data.schedule_date)}</dd>
							</div>
							<div>
								<dt>予約時間</dt>
								<dd>{formatTime(data.schedule_time)}</dd>
							</div>
							<div>
								<dt>店舗</dt>
								<dd>{storeName}</dd>
							</div>
							<div>
								<dt>担当者</dt>
								<dd>{staffName}</dd>
							</div>
						</dl>
						<p className="smb-reservation-detail__hint">
							予約日時・店舗・担当者を変更するには、この予約を削除してから再作成してください。
						</p>
					</section>

					<section className="smb-reservation-detail__section">
						<h3 className="smb-reservation-detail__section-title">予約者情報</h3>
						<dl className="smb-reservation-detail__defs">
							<div>
								<dt>氏名</dt>
								<dd>{data.customer_name || '—'}</dd>
							</div>
							<div>
								<dt>メール</dt>
								<dd>
									{data.customer_email ? (
										<a href={`mailto:${data.customer_email}`}>{data.customer_email}</a>
									) : (
										'—'
									)}
								</dd>
							</div>
							<div>
								<dt>電話</dt>
								<dd>
									{data.customer_phone ? (
										<a href={`tel:${data.customer_phone}`}>{data.customer_phone}</a>
									) : (
										'—'
									)}
								</dd>
							</div>
						</dl>
					</section>

					{displayFields.length > 0 && (
						<section className="smb-reservation-detail__section">
							<h3 className="smb-reservation-detail__section-title">追加の入力項目</h3>
							<dl className="smb-reservation-detail__defs">
								{displayFields.map((f) => {
									let display = '—';
									if (f.field_type === 'address') {
										// 住所フィールドはサーバー側で {field_key}_zip / {field_key}_address の
										// 2キーに分けて保存されている。
										const zip = data.meta?.[`${f.field_key}_zip`];
										const address = data.meta?.[`${f.field_key}_address`];
										const zipStr = zip !== undefined && zip !== null ? String(zip).trim() : '';
										const addressStr =
											address !== undefined && address !== null ? String(address).trim() : '';
										if (zipStr !== '' || addressStr !== '') {
											const zipPart = zipStr ? `〒${zipStr}` : '';
											display = [zipPart, addressStr].filter(Boolean).join(' ');
										}
									} else {
										const v = data.meta?.[f.field_key];
										if (v !== undefined && v !== null && v !== '') {
											if (f.field_type === 'checkbox') {
												try {
													const arr = typeof v === 'string' ? JSON.parse(v) : v;
													display = Array.isArray(arr) ? arr.join('、') : String(v);
												} catch {
													display = String(v);
												}
											} else {
												display = String(v);
											}
										}
									}
									return (
										<div key={f.field_key}>
											<dt>{f.field_label}</dt>
											<dd>{display}</dd>
										</div>
									);
								})}
							</dl>
						</section>
					)}

					<section className="smb-reservation-detail__section">
						<h3 className="smb-reservation-detail__section-title">管理</h3>
						{formError && <ErrorMessage message={formError} onDismiss={() => setFormError(null)} />}
						<Select
							label="ステータスを変更"
							value={status}
							onChange={(e) => setStatus(e.target.value)}
							options={STATUS_OPTIONS}
							help={
								status === 'cancelled' && data.status !== 'cancelled'
									? 'キャンセルに変更すると、この時間枠の予約数が 1 つ解放されます。'
									: status !== 'cancelled' && data.status === 'cancelled'
										? 'キャンセルから復活させると、この時間枠の予約数が 1 つ増えます。満席の場合は復活できません。'
										: `現在のステータス: ${STATUS_LABELS[data.status] || data.status}`
							}
						/>
						<Textarea
							label="管理者メモ（予約者には公開されません）"
							value={memo}
							onChange={(e) => setMemo(e.target.value)}
							placeholder="社内向けの申し送り事項を記入できます。"
							rows={3}
						/>
					</section>

					<section className="smb-reservation-detail__section smb-reservation-detail__section--meta">
						<dl className="smb-reservation-detail__defs smb-reservation-detail__defs--inline">
							<div>
								<dt>受付日時</dt>
								<dd>{data.created_at || '—'}</dd>
							</div>
							<div>
								<dt>最終更新</dt>
								<dd>{data.updated_at || '—'}</dd>
							</div>
						</dl>
					</section>
				</div>
			)}
		</Modal>
	);
}
