/**
 * 住所自動補完ユーティリティ (v0.3.0 機能④ 住所フィールド).
 *
 * zipcloud (https://zipcloud.ibsnet.co.jp/) を利用して郵便番号から住所候補を取得する。
 * 呼び出し条件（address フィールドが存在し、自動入力 ON、郵便番号 7 桁入力時のみ）は
 * 呼び出し側（AddressField）が判定する。ここでは通信そのものだけを担当する。
 *
 * フェイルソフト方針: 該当なし・HTTP エラー・タイムアウト・ネットワーク不通のいずれも
 * 例外を投げず null を返す。予約フォームの入力・送信を一切ブロックしない。
 * 本番コードでの error ログ出力は禁止のため console.error/warn は使用しない。
 */

const ZIPCLOUD_ENDPOINT = 'https://zipcloud.ibsnet.co.jp/api/search';
const TIMEOUT_MS = 5000;

/**
 * 郵便番号の入力文字列を数字のみに正規化する。
 * 全角数字 (U+FF10-FF19) は半角に変換し、ハイフン・空白・その他の非数字文字は除去する。
 * 桁数の判定（7桁かどうか）は呼び出し側で行う。
 *
 * @param {string} raw 入力された郵便番号文字列
 * @return {string} 数字のみの文字列
 */
export function normalizeZip( raw ) {
	const str = raw === undefined || raw === null ? '' : String( raw );
	const halfWidth = str.replace( /[０-９]/g, ( ch ) =>
		String.fromCharCode( ch.charCodeAt( 0 ) - 0xfee0 )
	);
	return halfWidth.replace( /[^0-9]/g, '' );
}

/**
 * 正規化済みの7桁郵便番号から住所候補を取得する。
 * 7桁でない・該当なし・通信失敗（HTTPエラー/タイムアウト/例外）のいずれの場合も null を返す。
 *
 * @param {string} zip7 正規化済みの7桁郵便番号
 * @return {Promise<string|null>} 住所候補文字列（都道府県+市区町村+町域）、または null
 */
export async function lookupAddress( zip7 ) {
	if ( typeof zip7 !== 'string' || zip7.length !== 7 ) {
		return null;
	}

	let controller;
	let timer;
	if ( typeof AbortController !== 'undefined' ) {
		controller = new AbortController();
		timer = setTimeout( () => controller.abort(), TIMEOUT_MS );
	}

	try {
		const res = await fetch( `${ ZIPCLOUD_ENDPOINT }?zipcode=${ zip7 }`, {
			credentials: 'omit',
			cache: 'no-store',
			signal: controller ? controller.signal : undefined,
		} );
		if ( ! res.ok ) {
			return null;
		}
		const data = await res.json();
		if (
			! data ||
			! Array.isArray( data.results ) ||
			data.results.length === 0
		) {
			return null;
		}
		const r = data.results[ 0 ];
		const address = `${ r.address1 || '' }${ r.address2 || '' }${
			r.address3 || ''
		}`;
		return address || null;
	} catch {
		return null;
	} finally {
		if ( timer ) {
			clearTimeout( timer );
		}
	}
}
