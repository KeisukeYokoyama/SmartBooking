/**
 * WordPress メディアライブラリ連携の画像ピッカー。
 *
 * wp.media() を呼び出し、attachment の id / url を取得する。
 * class-admin.php で wp_enqueue_media() が呼ばれていることを前提にする。
 *
 * 「ファイルをアップロード」タブを毎回初期表示にする方針:
 *   WordPress の Library state は既定で `contentUserSetting: true` となっており、
 *   ユーザーが最後に開いていたタブ（library/upload）を user setting Cookie から
 *   読み戻して contentMode を復元する。そのため2回目以降「メディアライブラリ」
 *   タブが開いてしまう。これを避けるため、自前で Library コントローラを生成し
 *     - contentMode: 'upload'        — 初期タブをアップロードに固定
 *     - contentUserSetting: false   — 直近タブの記憶／保存を無効化
 *   を渡す。これにより毎回 wp.media() を新規生成すれば常にアップロードタブで
 *   開く。なおユーザーがタブを「メディアライブラリ」に手動切替するのは妨げない
 *   （次回開いた時にまたアップロードに戻るだけ）。
 */
import Button from './Button';

function buildMediaFrame() {
	const wp = window.wp;
	const Library = wp && wp.media && wp.media.controller && wp.media.controller.Library;
	const baseOptions = {
		title: '画像を選択',
		button: { text: 'この画像を使用' },
		multiple: false,
		library: { type: 'image' },
	};

	if (Library && typeof wp.media.query === 'function') {
		return wp.media({
			...baseOptions,
			states: [
				new Library({
					id: 'library',
					title: '画像を選択',
					library: wp.media.query({ type: 'image' }),
					multiple: false,
					contentMode: 'upload',
					contentUserSetting: false,
				}),
			],
		});
	}

	// フォールバック: Library コントローラが取得できない環境では従来方式
	// （フレーム生成 → open 時に content.mode('upload') 強制）に戻す.
	const frame = wp.media(baseOptions);
	frame.on('open', () => {
		const state = typeof frame.state === 'function' ? frame.state() : null;
		if (state && typeof state.set === 'function') {
			state.set('contentMode', 'upload');
		}
		if (frame.content && typeof frame.content.mode === 'function') {
			frame.content.mode('upload');
		}
	});
	return frame;
}

export default function MediaPicker({ imageId, imageUrl, onChange, buttonLabel = '画像を選択' }) {
	const openMedia = () => {
		if (typeof window === 'undefined' || !window.wp || !window.wp.media) {
			// メディアライブラリが読み込まれていない（enqueue 忘れなど）.
			alert('メディアライブラリを開けませんでした。ページを再読み込みしてください。');
			return;
		}
		const frame = buildMediaFrame();

		frame.on('select', () => {
			const attachment = frame.state().get('selection').first().toJSON();
			if (attachment && attachment.id) {
				onChange({
					id: attachment.id,
					url:
						attachment.sizes && attachment.sizes.medium
							? attachment.sizes.medium.url
							: attachment.url,
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
