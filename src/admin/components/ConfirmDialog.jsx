/**
 * 破壊的操作の確認ダイアログ。
 *
 * Modal を継承し、タイトル・メッセージ・ボタンラベル・バリアントを渡せるようにする。
 */
import Button from './Button';
import Modal from './Modal';

export default function ConfirmDialog({
	open,
	title = '本当に削除しますか？',
	message,
	confirmLabel = '削除',
	cancelLabel = 'キャンセル',
	variant = 'danger',
	loading = false,
	onConfirm,
	onCancel,
}) {
	return (
		<Modal
			open={open}
			onClose={onCancel}
			title={title}
			size="sm"
			footer={
				<>
					<Button variant="secondary" onClick={onCancel} disabled={loading}>
						{cancelLabel}
					</Button>
					<Button variant={variant} onClick={onConfirm} loading={loading}>
						{confirmLabel}
					</Button>
				</>
			}
		>
			<p className="smb-confirm__message">{message}</p>
		</Modal>
	);
}
