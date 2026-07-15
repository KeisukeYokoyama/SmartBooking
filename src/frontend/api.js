/**
 * Smart Booking フロント予約フォーム用 REST クライアント。
 *
 * `wp_localize_script` で `smartBookingFrontend` にセットされた restUrl / nonce を使い
 * `/wp-json/smart-booking/v1/public/*` のエンドポイントを呼び出す。
 *
 * - Cookie 認証（credentials: 'same-origin'）
 * - すべてのリクエストに X-WP-Nonce を付与
 * - 4xx/5xx はエラーを throw し、サーバの message を Error に含める
 */

const globalCtx =
	typeof window !== 'undefined' ? window.smartBookingFrontend || {} : {};
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
 * REST ベース URL とサブパスを結合してクエリ文字列を付与する。
 *
 * @param {string} path     'public/stores' など。
 * @param {Object} [params] クエリパラメタ。
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
 * fetch ラッパ。
 *
 * @param {string} url  リクエスト URL
 * @param {Object} init fetch オプション (method/body/headers 等)
 * @return {Promise<any>} JSON / テキストをレスポンス Content-Type に応じて返す
 */
async function request( url, init = {} ) {
	const headers = {
		Accept: 'application/json',
		'X-WP-Nonce': NONCE,
		...( init.headers || {} ),
	};
	if (
		init.body &&
		typeof init.body === 'string' &&
		! headers[ 'Content-Type' ]
	) {
		headers[ 'Content-Type' ] = 'application/json';
	}

	const res = await fetch( url, {
		credentials: 'same-origin',
		...init,
		headers,
	} );

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
				throw err;
			} catch ( e ) {
				if ( e instanceof Error && e.message === message ) {
					throw e;
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

export const publicAPI = {
	stores: () => apiGet( 'public/stores' ),
	staff: ( storeId ) =>
		apiGet( 'public/staff', storeId ? { store_id: storeId } : undefined ),
	settings: () => apiGet( 'public/settings' ),
	customFields: ( formId ) =>
		apiGet(
			'public/custom-fields',
			formId ? { form_id: formId } : undefined
		),
	availability: ( { storeId, staffId, dateFrom, dateTo } = {} ) =>
		apiGet( 'public/availability', {
			store_id: storeId || undefined,
			staff_id: staffId || undefined,
			date_from: dateFrom || undefined,
			date_to: dateTo || undefined,
		} ),
	/**
	 * 予約作成 POST。
	 *
	 * @param {Object} payload
	 * @param {number} payload.schedule_id
	 * @param {number} [payload.form_id]       複数フォーム対応: どのフォーム経由の予約かを識別する ID
	 * @param {string} payload.customer_name
	 * @param {string} payload.customer_email
	 * @param {string} payload.customer_phone
	 * @param {string} [payload.honeypot]
	 * @param {Object} [payload.custom_fields] カスタムフィールド入力値 (field_key → value)
	 * @return {Promise<{id:number,schedule_date:string,schedule_time:string,store_name:string,staff_name:string,status:string}>} 作成された予約のサマリ
	 */
	createReservation: ( payload ) => apiPost( 'public/reservations', payload ),
};
