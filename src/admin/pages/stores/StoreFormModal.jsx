/**
 * 店舗の追加・編集モーダル。
 *
 * 参考スクショ（docs/reference-ui/admin-store-add-modal.png）を踏まえ、
 * 住所は都道府県セレクト + 市区町村 + 番地の3段構成で入力ミスを減らす。
 * カレンダー色は `<input type="color">` + HEX テキスト併用で、キーボードでも指定可能にする。
 */
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import MediaPicker from '../../components/MediaPicker';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import Switch from '../../components/Switch';
import Textarea from '../../components/Textarea';
import { PREFECTURES } from '../../constants';

const EMPTY = {
	name: '',
	description: '',
	prefecture: '',
	city: '',
	address_line: '',
	phone: '',
	email: '',
	image_id: 0,
	image_url: '',
	calendar_color: '#2271b1',
	sort_order: 0,
	is_active: 1,
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export default function StoreFormModal({ open, store, onClose, onSubmit, submitting }) {
	const [values, setValues] = useState(EMPTY);
	const [errors, setErrors] = useState({});
	const initialRef = useRef(EMPTY);

	useEffect(() => {
		if (open) {
			setErrors({});
			const init = store
				? {
						...EMPTY,
						...store,
						calendar_color: store.calendar_color || '#2271b1',
					}
				: EMPTY;
			initialRef.current = init;
			setValues(init);
		}
	}, [open, store]);

	const computedIsDirty = JSON.stringify(values) !== JSON.stringify(initialRef.current);
	const isDirty = !submitting && computedIsDirty;

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const validate = () => {
		const next = {};
		if (!values.name.trim()) next.name = '店舗名は必須です。';
		if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
			next.email = 'メールアドレスの形式が正しくありません。';
		}
		if (!HEX_RE.test(values.calendar_color)) {
			next.calendar_color = 'カラーコードは #RRGGBB 形式で入力してください。';
		}
		setErrors(next);
		return Object.keys(next).length === 0;
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (!validate()) return;
		onSubmit(values);
	};

	const prefOptions = [{ value: '', label: '選択してください' }, ...PREFECTURES.map((p) => ({ value: p, label: p }))];

	return (
		<Modal
			open={open}
			onClose={onClose}
			isDirty={isDirty}
			title={store ? '店舗を編集' : '店舗を追加'}
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						{store ? '保存' : '追加する'}
					</Button>
				</>
			}
		>
			<form className="smb-form" onSubmit={handleSubmit} noValidate>
				<Input
					label="店舗名"
					required
					error={errors.name}
					value={values.name}
					onChange={(e) => update({ name: e.target.value })}
					placeholder="例）渋谷本店"
				/>

				<Textarea
					label="店舗説明"
					value={values.description}
					onChange={(e) => update({ description: e.target.value })}
					placeholder="来店者に見せる紹介文（予約フォームに表示されます）"
					rows={3}
				/>

				<div className="smb-field-group smb-field-group--address">
					<Select
						label="都道府県"
						options={prefOptions}
						value={values.prefecture}
						onChange={(e) => update({ prefecture: e.target.value })}
					/>
					<Input
						label="市区町村"
						value={values.city}
						onChange={(e) => update({ city: e.target.value })}
						placeholder="渋谷区"
					/>
					<Input
						label="番地・建物名"
						value={values.address_line}
						onChange={(e) => update({ address_line: e.target.value })}
						placeholder="道玄坂1-2-3 ○○ビル 4F"
					/>
				</div>

				<div className="smb-field-group smb-field-group--contact">
					<Input
						label="電話番号"
						type="tel"
						value={values.phone}
						onChange={(e) => update({ phone: e.target.value })}
						placeholder="03-1234-5678"
					/>
					<Input
						label="メールアドレス"
						type="email"
						error={errors.email}
						value={values.email}
						onChange={(e) => update({ email: e.target.value })}
						placeholder="notification@example.com"
						help="予約通知メールの送信先になります。"
					/>
				</div>

				<div className="smb-field">
					<div className="smb-field__label">
						<span>店舗画像</span>
					</div>
					<MediaPicker
						imageId={values.image_id}
						imageUrl={values.image_url}
						onChange={({ id, url }) => update({ image_id: id, image_url: url })}
					/>
				</div>

				<div className="smb-field">
					<div className="smb-field__label">
						<span>カレンダー表示色</span>
					</div>
					<div className="smb-color-picker">
						<input
							type="color"
							aria-label="カラーピッカー"
							value={values.calendar_color}
							onChange={(e) => update({ calendar_color: e.target.value })}
							className="smb-color-picker__swatch"
						/>
						<input
							type="text"
							aria-label="カラーコード"
							value={values.calendar_color}
							onChange={(e) => update({ calendar_color: e.target.value })}
							className="smb-input smb-color-picker__hex"
							placeholder="#2271b1"
							maxLength={7}
						/>
					</div>
					{errors.calendar_color ? (
						<p className="smb-field__error">{errors.calendar_color}</p>
					) : (
						<p className="smb-field__help">
							スケジュール管理画面でこの店舗の予約枠を表示する色です。カレンダーでの色分けに使います。
						</p>
					)}
				</div>

				<div className="smb-field-group smb-field-group--meta">
					<Input
						label="表示順"
						type="number"
						value={values.sort_order}
						onChange={(e) => update({ sort_order: Number(e.target.value) })}
						help="小さい数字が上に表示されます。"
					/>
					<div className="smb-field">
						<div className="smb-field__label">
							<span>ステータス</span>
						</div>
						<Switch
							checked={!!values.is_active}
							onChange={(v) => update({ is_active: v ? 1 : 0 })}
							label={values.is_active ? '有効（予約フォームに表示）' : '無効（非表示）'}
						/>
					</div>
				</div>

				{/* 非表示送信ボタンで Enter キーでのフォーム送信を有効化 */}
				<button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>
					送信
				</button>
			</form>
		</Modal>
	);
}
