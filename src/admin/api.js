/**
 * REST API クライアント。
 *
 * wp_localize_script で `smartBookingAdmin` にセットされた restUrl / nonce を使い
 * WordPress REST API (/smart-booking/v1/) を呼び出すための薄いラッパ。
 *
 * - 常に Cookie 認証 (credentials: 'same-origin') を使う
 * - 書き込み系リクエストには X-WP-Nonce を付与する
 * - 4xx/5xx はエラーを throw し、サーバの message を Error に含める
 */

const globalCtx =
	typeof window !== 'undefined' ? window.smartBookingAdmin || {} : {};
const REST_URL = globalCtx.restUrl || '';
const NONCE = globalCtx.nonce || '';

if ( ! REST_URL && typeof console !== 'undefined' ) {
	// wp_localize_script で restUrl が渡っていない異常系。
	// パーマリンク固有のハードコードにフォールバックせず、気付けるように警告のみ行う。
	// eslint-disable-next-line no-console
	console.warn(
		'Smart Booking: restUrl が取得できませんでした。REST API 呼び出しが失敗する可能性があります。'
	);
}

/**
 * URL にクエリ文字列を付与する。null/undefined/空文字はスキップ。
 *
 * @param {string} path     REST URL からのサブパス ('stores', 'schedules/copy', 'stores/5' など)
 * @param {Object} [params] クエリパラメタ
 * @return {string} 完全な REST API URL
 */
function buildUrl( path, params ) {
	const base =
		REST_URL.replace( /\/$/, '' ) + '/' + path.replace( /^\//, '' );
	if ( ! params || Object.keys( params ).length === 0 ) {
		return base;
	}
	const qs = Object.entries( params )
		.filter( ( [ , v ] ) => v !== undefined && v !== null && v !== '' )
		.map(
			( [ k, v ] ) =>
				encodeURIComponent( k ) + '=' + encodeURIComponent( v )
		)
		.join( '&' );
	if ( ! qs ) {
		return base;
	}
	// Plain パーマリンクでは REST_URL が `?rest_route=...` 形式（既にクエリ文字列を含む）
	// になるため、base に既存のクエリ文字列がある場合は `&` で連結する（二重 `?` 防止）。
	const sep = base.indexOf( '?' ) === -1 ? '?' : '&';
	return base + sep + qs;
}

/**
 * fetch のラッパ。HTTP エラー時は Error を throw。
 *
 * @param {string} url  リクエスト URL
 * @param {Object} init fetch オプション (method/body/headers 等)
 * @return {Promise<any>} JSON / Blob / テキストをレスポンス Content-Type に応じて返す
 */
async function request( url, init = {} ) {
	const headers = {
		Accept: 'application/json',
		...( init.headers || {} ),
	};
	if ( init.method && init.method !== 'GET' && init.method !== 'HEAD' ) {
		headers[ 'X-WP-Nonce' ] = NONCE;
		if (
			init.body &&
			typeof init.body === 'string' &&
			! headers[ 'Content-Type' ]
		) {
			headers[ 'Content-Type' ] = 'application/json';
		}
	} else {
		// GET にも nonce を付与しておくと wp のキャッシュ/認可判定で安全側.
		headers[ 'X-WP-Nonce' ] = NONCE;
	}

	const res = await fetch( url, {
		credentials: 'same-origin',
		...init,
		headers,
	} );

	// CSV など JSON 以外のレスポンスも考慮.
	const contentType = res.headers.get( 'content-type' ) || '';

	if ( ! res.ok ) {
		let message = '通信に失敗しました (HTTP ' + res.status + ')';
		if ( contentType.includes( 'application/json' ) ) {
			try {
				const body = await res.json();
				if ( body && body.message ) {
					message = body.message;
				}
				const err = new Error( message );
				err.status = res.status;
				err.code = body && body.code ? body.code : null;
				err.data = body && body.data ? body.data : null;
				throw err;
			} catch ( parseErr ) {
				if (
					parseErr instanceof Error &&
					parseErr.message !== message
				) {
					// JSON 解析失敗。デフォルトメッセージで throw.
				}
			}
		}
		const err = new Error( message );
		err.status = res.status;
		throw err;
	}

	if ( contentType.includes( 'application/json' ) ) {
		return res.json();
	}
	if ( contentType.includes( 'text/csv' ) ) {
		return res.blob();
	}
	return res.text();
}

export function apiGet( path, params ) {
	return request( buildUrl( path, params ), { method: 'GET' } );
}

export function apiPost( path, data ) {
	return request( buildUrl( path ), {
		method: 'POST',
		body: JSON.stringify( data || {} ),
	} );
}

export function apiPut( path, data ) {
	return request( buildUrl( path ), {
		method: 'PUT',
		body: JSON.stringify( data || {} ),
	} );
}

export function apiDelete( path ) {
	return request( buildUrl( path ), { method: 'DELETE' } );
}

/**
 * CSV などのファイルダウンロード用。
 *
 * サーバから Blob を受け取り、非表示の <a download> でブラウザの保存ダイアログを起動する。
 * 成功時は filename を返す。失敗時は Error を throw。
 *
 * @param {string} path       REST URL からのサブパス
 * @param {Object} [params]   クエリパラメタ
 * @param {string} [filename] ダウンロード時のファイル名（省略時はサーバ側 Content-Disposition か自動生成）
 * @return {Promise<string>} 実際に保存されたファイル名
 */
export async function apiDownload( path, params, filename ) {
	const url = buildUrl( path, params );
	const res = await fetch( url, {
		method: 'GET',
		credentials: 'same-origin',
		headers: {
			Accept: 'text/csv, application/octet-stream, */*',
			'X-WP-Nonce': NONCE,
		},
	} );
	if ( ! res.ok ) {
		let message = '通信に失敗しました (HTTP ' + res.status + ')';
		try {
			const body = await res.json();
			if ( body && body.message ) {
				message = body.message;
			}
		} catch {
			// noop.
		}
		const err = new Error( message );
		err.status = res.status;
		throw err;
	}

	const blob = await res.blob();
	let saveName = filename;
	if ( ! saveName ) {
		// Content-Disposition から推測.
		const cd = res.headers.get( 'content-disposition' ) || '';
		const m = /filename="?([^";]+)"?/i.exec( cd );
		saveName = m ? m[ 1 ] : 'download.csv';
	}

	const objectUrl = URL.createObjectURL( blob );
	const a = document.createElement( 'a' );
	a.href = objectUrl;
	a.download = saveName;
	document.body.appendChild( a );
	a.click();
	document.body.removeChild( a );
	// Safari の遅延対応で少し待ってから revoke。
	setTimeout( () => URL.revokeObjectURL( objectUrl ), 1000 );
	return saveName;
}

export const API = {
	stores: {
		list: ( params ) => apiGet( 'stores', params ),
		get: ( id ) => apiGet( 'stores/' + id ),
		create: ( data ) => apiPost( 'stores', data ),
		update: ( id, data ) => apiPut( 'stores/' + id, data ),
		remove: ( id ) => apiDelete( 'stores/' + id ),
	},
	staff: {
		list: ( params ) => apiGet( 'staff', params ),
		get: ( id ) => apiGet( 'staff/' + id ),
		create: ( data ) => apiPost( 'staff', data ),
		update: ( id, data ) => apiPut( 'staff/' + id, data ),
		remove: ( id ) => apiDelete( 'staff/' + id ),
	},
	schedules: {
		list: ( params ) => apiGet( 'schedules', params ),
		get: ( id ) => apiGet( 'schedules/' + id ),
		create: ( data ) => apiPost( 'schedules', data ),
		update: ( id, data ) => apiPut( 'schedules/' + id, data ),
		remove: ( id ) => apiDelete( 'schedules/' + id ),
		copy: ( data ) => apiPost( 'schedules/copy', data ),
	},
	reservations: {
		list: ( params ) => apiGet( 'reservations', params ),
		get: ( id ) => apiGet( 'reservations/' + id ),
		create: ( data ) => apiPost( 'reservations', data ),
		update: ( id, data ) => apiPut( 'reservations/' + id, data ),
		remove: ( id ) => apiDelete( 'reservations/' + id ),
	},
	customFields: {
		list: ( formId ) =>
			apiGet( 'custom-fields', formId ? { form_id: formId } : undefined ),
		create: ( data ) => apiPost( 'custom-fields', data ),
		update: ( id, data ) => apiPut( 'custom-fields/' + id, data ),
		remove: ( id ) => apiDelete( 'custom-fields/' + id ),
		reorder: ( items ) => apiPut( 'custom-fields/reorder', { items } ),
	},
	forms: {
		list: () => apiGet( 'forms' ),
		create: ( data ) => apiPost( 'forms', data ),
		update: ( id, data ) => apiPut( 'forms/' + id, data ),
		remove: ( id ) => apiDelete( 'forms/' + id ),
	},
	settings: {
		get: () => apiGet( 'settings' ),
		update: ( settings ) => apiPost( 'settings', { settings } ),
	},
	mailError: {
		get: () => apiGet( 'mail-error' ),
		clear: () => apiDelete( 'mail-error' ),
	},
};
