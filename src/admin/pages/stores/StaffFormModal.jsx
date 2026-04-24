/**
 * 担当者の追加・編集モーダル。
 */
import { useEffect, useState } from 'react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import MediaPicker from '../../components/MediaPicker';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import Switch from '../../components/Switch';
import Textarea from '../../components/Textarea';

const EMPTY = {
	store_id: 0,
	name: '',
	email: '',
	phone: '',
	description: '',
	image_id: 0,
	image_url: '',
	sort_order: 0,
	is_active: 1,
};

export default function StaffFormModal({ open, staff, stores = [], onClose, onSubmit, submitting }) {
	const [values, setValues] = useState(EMPTY);
	const [errors, setErrors] = useState({});

	useEffect(() => {
		if (open) {
			setErrors({});
			if (staff) {
				setValues({ ...EMPTY, ...staff });
			} else {
				setValues({
					...EMPTY,
					store_id: stores.length > 0 ? stores[0].id : 0,
				});
			}
		}
	}, [open, staff, stores]);

	const update = (patch) => setValues((prev) => ({ ...prev, ...patch }));

	const validate = () => {
		const next = {};
		if (!values.name.trim()) next.name = '担当者名は必須です。';
		if (!values.store_id) next.store_id = '所属店舗を選択してください。';
		if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
			next.email = 'メールアドレスの形式が正しくありません。';
		}
		setErrors(next);
		return Object.keys(next).length === 0;
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		if (!validate()) return;
		onSubmit(values);
	};

	const storeOptions = [
		{ value: '', label: '選択してください' },
		...stores.map((s) => ({ value: String(s.id), label: s.name })),
	];

	return (
		<Modal
			open={open}
			onClose={onClose}
			title={staff ? '担当者を編集' : '担当者を追加'}
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						{staff ? '保存' : '追加する'}
					</Button>
				</>
			}
		>
			<form className="smb-form" onSubmit={handleSubmit} noValidate>
				<Input
					label="担当者名"
					required
					error={errors.name}
					value={values.name}
					onChange={(e) => update({ name: e.target.value })}
					placeholder="例）山田 太郎"
				/>

				<Select
					label="所属店舗"
					required
					error={errors.store_id}
					options={storeOptions}
					value={String(values.store_id || '')}
					onChange={(e) => update({ store_id: Number(e.target.value) })}
				/>

				<div className="smb-field-group smb-field-group--contact">
					<Input
						label="メールアドレス"
						type="email"
						error={errors.email}
						value={values.email}
						onChange={(e) => update({ email: e.target.value })}
						placeholder="staff@example.com"
						help="設定すると予約通知が CC でこの担当者にも届きます。"
					/>
					<Input
						label="電話番号"
						type="tel"
						value={values.phone}
						onChange={(e) => update({ phone: e.target.value })}
						placeholder="090-1234-5678"
					/>
				</div>

				<Textarea
					label="プロフィール"
					value={values.description}
					onChange={(e) => update({ description: e.target.value })}
					placeholder="予約フォームで紹介文として表示されます。"
					rows={3}
				/>

				<div className="smb-field">
					<div className="smb-field__label">
						<span>プロフィール写真</span>
					</div>
					<MediaPicker
						imageId={values.image_id}
						imageUrl={values.image_url}
						onChange={({ id, url }) => update({ image_id: id, image_url: url })}
					/>
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

				<button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>
					送信
				</button>
			</form>
		</Modal>
	);
}
