/**
 * 確認画面・完了画面の URL パラメータ付与（v0.6.5）。
 *
 * 設定「確認画面・完了画面でURLパラメータを付ける」（初期値 OFF）が ON のときだけ、
 * ステップの遷移に合わせてページ URL のクエリ `smt_booking` を書き換える。
 * GA4 拡張計測（ブラウザの履歴イベントに基づくページの変更）や広告媒体の
 * 「URL 条件のコンバージョン」で計測できるようにするのが目的。
 *
 * 仕様（docs/spec-amendment-v065-step-url-param.md が正本）:
 *   入力画面 → 確認画面       : smt_booking=confirm を付ける
 *   確認画面 → 完了画面       : 値を complete に置き換える
 *   確認画面 → 入力画面       : smt_booking を取り除く（「修正する」・送信エラーで戻る）
 *   それ以外（初回表示を含む） : URL は触らない
 *
 * - すべて history.pushState で変更する（replaceState は使わない）。
 * - 目標 URL が現在と同じなら pushState しない。
 * - 既存のクエリ（utm_* など）とハッシュは元の表記のまま保持する。
 * - history API が使えない環境では何もせず、例外を外に出さない。
 */

export const STEP_URL_PARAM_KEY = 'smt_booking';

/**
 * 遷移（prevStep → step）から付けるべき値を決める。
 *
 * @param {string} prevStep 直前のステップ.
 * @param {string} step     現在のステップ.
 * @return {string|null|undefined} 付ける値 / null＝取り除く / undefined＝触らない.
 */
function resolveParamValue( prevStep, step ) {
	if ( prevStep === step ) {
		return undefined;
	}
	if ( step === 'confirm' && prevStep === 'main' ) {
		return 'confirm';
	}
	if ( step === 'done' && prevStep === 'confirm' ) {
		return 'complete';
	}
	if ( step === 'main' && prevStep === 'confirm' ) {
		return null;
	}
	return undefined;
}

/**
 * ステップ遷移に応じて URL の smt_booking パラメータを更新する。
 *
 * @param {string} prevStep 直前のステップ.
 * @param {string} step     現在のステップ.
 */
export function syncStepUrlParam( prevStep, step ) {
	const value = resolveParamValue( prevStep, step );
	if ( value === undefined ) {
		return;
	}
	try {
		if (
			typeof window === 'undefined' ||
			! window.history ||
			typeof window.history.pushState !== 'function' ||
			! window.location
		) {
			return;
		}
		const { pathname, search, hash } = window.location;
		const parts = String( search || '' )
			.replace( /^\?/, '' )
			.split( '&' )
			.filter( ( p ) => p !== '' );
		const isOwn = ( p ) => p.split( '=' )[ 0 ] === STEP_URL_PARAM_KEY;
		const own = parts.filter( isOwn );
		const target =
			value === null ? null : `${ STEP_URL_PARAM_KEY }=${ value }`;

		// 目標の状態と同じなら何もしない（重複 pushState の防止）。
		if (
			target === null
				? own.length === 0
				: own.length === 1 && own[ 0 ] === target
		) {
			return;
		}

		const rest = parts.filter( ( p ) => ! isOwn( p ) );
		if ( target !== null ) {
			rest.push( target );
		}
		const nextSearch = rest.length > 0 ? `?${ rest.join( '&' ) }` : '';
		window.history.pushState(
			window.history.state,
			'',
			`${ pathname }${ nextSearch }${ hash }`
		);
	} catch {
		// 失敗しても予約フローには影響させない。
	}
}
