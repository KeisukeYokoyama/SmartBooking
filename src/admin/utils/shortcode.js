/**
 * ショートコード文字列の組み立てを1箇所に集約する。
 *
 * 予約フォームの埋め込みショートコードは `[smart_booking ...]`。属性は現状
 * `form_id`（複数フォーム v0.4.0）と `store_id`（店舗限定）の2つ。将来属性が
 * 増えても buildShortcode に渡す属性を足すだけで済むよう、ここに集約する。
 *
 * サーバ側の対応は includes/class-shortcode.php（受理する属性）と
 * Smart_Booking_REST_Forms::resolve_form_id（form_id 省略/不正 → デフォルト解決）。
 */

// includes/class-shortcode.php の Smart_Booking_Shortcode::SHORTCODE と一致させる。
export const SHORTCODE_TAG = 'smart_booking';

/**
 * 属性オブジェクトから `[smart_booking key="value" ...]` を組み立てる。
 * 空文字・null・undefined の属性は省略する（属性の並びは渡した順）。
 *
 * @param {Object} attrs 例: { form_id: 2 } / { store_id: 1 } / {}
 * @return {string} 組み立てたショートコード文字列。
 */
export function buildShortcode( attrs = {} ) {
	const parts = [ SHORTCODE_TAG ];
	Object.entries( attrs ).forEach( ( [ key, value ] ) => {
		if ( value === undefined || value === null || value === '' ) {
			return;
		}
		parts.push( `${ key }="${ value }"` );
	} );
	return `[${ parts.join( ' ' ) }]`;
}

/**
 * フォームの埋め込みショートコード。
 *
 * デフォルトフォームは form_id を省略する。サーバが未指定 → デフォルトへ解決するため、
 * 省略形の方がシンプルで、将来デフォルトフォームの id が変わっても壊れない。
 *
 * @param {Object|null} form { id, is_default }
 * @return {string} フォームの埋め込みショートコード文字列。
 */
export function buildFormShortcode( form ) {
	if ( ! form ) {
		return buildShortcode( {} );
	}
	if ( Number( form.is_default ) === 1 ) {
		return buildShortcode( {} );
	}
	return buildShortcode( { form_id: form.id } );
}

/**
 * 店舗限定の埋め込みショートコード。
 *
 * @param {Object|null} store { id }
 * @return {string} 店舗 id が無ければ空文字。
 */
export function buildStoreShortcode( store ) {
	if ( ! store || ! store.id ) {
		return '';
	}
	return buildShortcode( { store_id: store.id } );
}
