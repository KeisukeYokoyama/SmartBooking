/**
 * Smart Booking Phase 1 — アンインストール（破壊的テスト）。
 *
 * ⚠️⚠️⚠️ 重要な警告 ⚠️⚠️⚠️
 * `wp plugin delete` は wp-env 環境ではプラグイン本体のファイルを削除する恐れがあります
 *   （シンボリックリンク配下のファイル実体をホスト OS 上で消去してしまいます）。
 * そのため本テストでは `wp eval` で uninstall.php を直接実行する方式のみを採用しています。
 * 絶対に `wp plugin delete smart-booking` を wp-env 環境で実行しないでください。
 *
 * 通常の playwright.config.js では testIgnore で除外しています。
 *
 * 実行方法:
 *   npx playwright test --config=playwright.uninstall.config.js
 *
 * 後処理:
 *   U-3 で Activator::activate を呼び直してテーブルを再生成し、他テストへの影響を無くす。
 */
const { test, expect } = require( '@playwright/test' );
const { wpCli, listSmbTables, countSmbOptions } = require( './helpers' );

test.describe.configure( { mode: 'serial' } );

test.describe( 'Phase 1 (破壊的): アンインストール検証', () => {
	test( 'U-1. uninstall.php 実行後に smb_ テーブル 6 つがすべて DROP される', () => {
		// 事前確認: テーブルが存在すること.
		const before = listSmbTables();
		expect(
			before.length,
			`事前状態で 6 テーブルが存在していること: ${ before.join( ',' ) }`
		).toBe( 6 );

		// uninstall.php を直接実行するため WP_UNINSTALL_PLUGIN を define してから require する.
		// wp-env コンテナ内のプラグインパスは /var/www/html/wp-content/plugins/smart-booking/.
		wpCli(
			`eval "define('WP_UNINSTALL_PLUGIN', 'smart-booking/smart-booking.php'); require WP_PLUGIN_DIR . '/smart-booking/uninstall.php';"`
		);

		const remaining = listSmbTables();
		expect(
			remaining,
			`残存テーブル: ${ remaining.join( ', ' ) }`
		).toEqual( [] );
	} );

	test( 'U-2. wp_options から smb_ プレフィックスのレコードが全削除される', () => {
		const count = countSmbOptions();
		expect( count ).toBe( 0 );
	} );

	test( 'U-3. プラグインを deactivate → activate するとテーブル 6 つが再生成される', () => {
		// deactivate → activate で register_activation_hook 経由に Activator::activate() が走る.
		// これは WordPress.org 審査時の再有効化シナリオに最も近い方式.
		wpCli( 'plugin deactivate smart-booking' );
		wpCli( 'plugin activate smart-booking' );
		const tables = listSmbTables();
		expect(
			tables.length,
			`再生成後のテーブル: ${ tables.join( ', ' ) }`
		).toBe( 6 );
	} );
} );
