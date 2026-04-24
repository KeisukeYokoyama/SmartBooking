/**
 * WordPress メディアライブラリ連携の画像ピッカー。
 *
 * wp.media() を呼び出し、attachment の id / url を取得する。
 * class-admin.php で wp_enqueue_media() が呼ばれていることを前提にする。
 */
import Button from './Button';

export default function MediaPicker({ imageId, imageUrl, onChange, buttonLabel = '画像を選択' }) {
	const openMedia = () => {
		if (typeof window === 'undefined' || !window.wp || !window.wp.media) {
			// メディアライブラリが読み込まれていない（enqueue 忘れなど）.
			alert('メディアライブラリを開けませんでした。ページを再読み込みしてください。');
			return;
		}
		const frame = window.wp.media({
			title: '画像を選択',
			button: { text: 'この画像を使用' },
			multiple: false,
			library: { type: 'image' },
		});
		frame.on('select', () => {
			const attachment = frame.state().get('selection').first().toJSON();
			if (attachment && attachment.id) {
				onChange({
					id: attachment.id,
					url: attachment.sizes && attachment.sizes.medium ? attachment.sizes.medium.url : attachment.url,
				});
			}
		});
		frame.open();
	};

	const clear = (e) => {
		e.preventDefault();
		onChange({ id: 0, url: '' });
	};

	return (
		<div className="smb-media-picker">
			{imageUrl ? (
				<div className="smb-media-picker__preview">
					<img src={imageUrl} alt="" />
				</div>
			) : (
				<div className="smb-media-picker__placeholder" aria-hidden="true">
					<span>画像なし</span>
				</div>
			)}
			<div className="smb-media-picker__actions">
				<Button type="button" variant="secondary" size="sm" onClick={openMedia}>
					{imageId ? '画像を変更' : buttonLabel}
				</Button>
				{imageId ? (
					<button type="button" className="smb-media-picker__clear" onClick={clear}>
						削除
					</button>
				) : null}
			</div>
		</div>
	);
}
