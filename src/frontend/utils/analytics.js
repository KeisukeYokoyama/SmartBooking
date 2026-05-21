/**
 * GTM (Google Tag Manager) 連携用 dataLayer プッシュヘルパ。
 *
 * 各予約ステップへ遷移したタイミングでカスタムイベントを 1 件送信する。
 * GTM タグ自体は WordPress テーマ側または GTM プラグインで埋め込まれる前提で、
 * 本プラグインは window.dataLayer への push のみを担当する。
 *
 * 仕様（docs/help/markdown/gtm.md と同期）:
 *   step           | event                    | booking_step
 *   ---------------+--------------------------+---------------
 *   店舗選択         | smart_booking_step       | store_select
 *   担当者選択       | smart_booking_step       | staff_select
 *   日付選択         | smart_booking_step       | date_select
 *   時間選択         | smart_booking_step       | time_select
 *   フォーム入力     | smart_booking_step       | form_input
 *   確認画面         | smart_booking_step       | confirm
 *   完了画面         | smart_booking_complete   | complete
 *
 * GTM が存在しない環境でも window.dataLayer への push は安全に動作する
 * （配列が無ければここで生成し、プッシュした内容は単に未消費のまま残るだけ）。
 */

export function pushBookingEvent( step ) {
	if ( typeof window === 'undefined' ) {
		return;
	}
	if ( ! Array.isArray( window.dataLayer ) ) {
		window.dataLayer = [];
	}
	window.dataLayer.push( {
		event: step === 'complete' ? 'smart_booking_complete' : 'smart_booking_step',
		booking_step: step,
	} );
}
