/**
 * フォーム名の追加/変更モーダル。
 *
 * - mode='create' : 新規フォーム作成（名前のみ入力）
 * - mode='rename'  : 既存フォームの名前変更（デフォルトフォームも改名可）
 *
 * フィールド定義（初期3フィールド等）はサーバ側で自動生成されるため、
 * このモーダルはフォーム名の入出力のみを扱う。
 */
import { useEffect, useRef, useState } from 'react';
import Button from '../../components/Button';
import Input from '../../components/Input';
import Modal from '../../components/Modal';

export default function FormNameModal({
	open,
	mode = 'create',
	initialName = '',
	submitting = false,
	onClose,
	onSubmit,
}) {
	const [name, setName] = useState('');
	const [error, setError] = useState('');
	const initialRef = useRef('');

	useEffect(() => {
		if (!open) return;
		const init = initialName || '';
		setName(init);
		setError('');
		initialRef.current = init;
	}, [open, initialName]);

	const isDirty = !submitting && name !== initialRef.current;

	const title = mode === 'rename' ? 'フォーム名を変更' : 'フォームを追加';

	const handleSubmit = (evt) => {
		if (evt) evt.preventDefault();
		const trimmed = name.trim();
		if (!trimmed) {
			setError('フォーム名を入力してください。');
			return;
		}
		onSubmit(trimmed);
	};

	return (
		<Modal
			open={open}
			onClose={onClose}
			isDirty={isDirty}
			title={title}
			size="sm"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						{mode === 'rename' ? '変更を保存' : '追加する'}
					</Button>
				</>
			}
		>
			<form className="smb-form" onSubmit={handleSubmit}>
				<Input
					label="フォーム名"
					required
					value={name}
					onChange={(e) => {
						setName(e.target.value);
						if (error) setError('');
					}}
					error={error}
					maxLength={100}
					placeholder="例：Web相談フォーム"
					help="管理画面でフォームを見分けるための名前です。予約フォームの画面には表示されません。"
				/>
			</form>
		</Modal>
	);
}
