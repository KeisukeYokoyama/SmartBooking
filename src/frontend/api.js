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

const globalCtx = typeof window !== 'undefined' ? window.smartBookingFrontend || {} : {};
const REST_URL = globalCtx.restUrl || '/wp-json/smart-booking/v1/';
const NONCE = globalCtx.nonce || '';

/**
 * REST ベース URL とサブパスを結合してクエリ文字列を付与する。
 *
 * @param {string} path   'public/stores' など。
 * @param {object} [params] クエリパラメタ。
 * @returns {string}
 */
function buildUrl(path, params) {
	const base = REST_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
	if (!params || Object.keys(params).length === 0) return base;
	const qs = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== null && v !== '')
		.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
		.join('&');
	return qs ? base + '?' + qs : base;
}

/**
 * fetch ラッパ。
 *
 * @param {string} url
 * @param {RequestInit} init
 * @returns {Promise<any>}
 */
async function request(url, init = {}) {
	const headers = {
		Accept: 'application/json',
		'X-WP-Nonce': NONCE,
		...(init.headers || {}),
	};
	if (init.body && typeof init.body === 'string' && !headers['Content-Type']) {
		headers['Content-Type'] = 'application/json';
	}

	const res = await fetch(url, {
		credentials: 'same-origin',
		...init,
		headers,
	});

	const contentType = res.headers.get('content-type') || '';

	if (!res.ok) {
		let message = '通信に失敗しました (HTTP ' + res.status + ')';
		if (contentType.includes('application/json')) {
			try {
				const body = await res.json();
				if (body && body.message) message = body.message;
				const err = new Error(message);
				err.status = res.status;
				err.code = body && body.code ? body.code : null;
				throw err;
			} catch (e) {
				if (e instanceof Error && e.message === message) throw e;
			}
		}
		const err = new Error(message);
		err.status = res.status;
		throw err;
	}

	if (contentType.includes('application/json')) {
		return res.json();
	}
	return res.text();
}

export function apiGet(path, params) {
	return request(buildUrl(path, params), { method: 'GET' });
}

export function apiPost(path, data) {
	return request(buildUrl(path), {
		method: 'POST',
		body: JSON.stringify(data || {}),
	});
}

export const publicAPI = {
	stores: () => apiGet('public/stores'),
	staff: (storeId) => apiGet('public/staff', storeId ? { store_id: storeId } : undefined),
	settings: () => apiGet('public/settings'),
	customFields: () => apiGet('public/custom-fields'),
};
