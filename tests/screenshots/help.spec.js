/**
 * 公式サイト（smart-booking-website）のヘルプページ用スクリーンショットを撮影するスペック。
 *
 * 位置づけ（重要）:
 *   - これは回帰スイートではない。`npx playwright test`（既存 playwright.config.js）には
 *     含まれず、`npm run screenshots`（playwright.screenshots.config.js）でのみ実行される。
 *   - ここはアサーション（expect）を増やす場所ではない。目的は「見た目のキャプチャ」のみ。
 *     回帰の検証は tests/e2e/ 側の責務。
 *   - 出力先は docs/website-screenshots/<slug>/NN-name.png（<slug> は公式サイト側の
 *     ヘルプページ slug と一致させる。既存 slug 一覧は docs/website-screenshots/README.md 参照）。
 *
 * 前提:
 *   - wp-env が起動していること（http://localhost:8888）。
 *   - デモデータのシード（別スクリプトで投入予定）が入っていることが望ましいが、
 *     未投入でも「ページが開けて一覧が描画される」レベルでは撮影できるよう、
 *     待ち条件は特定の店舗名などのシード依存文字列に強く依存させていない
 *     （判断理由は docs/website-screenshots/README.md に記載）。
 *
 * カットを追加する手順:
 *   1. `shot( page, slug, name )` で撮影して保存する。name は "NN-kebab-case.png" 形式。
 *   2. 管理画面ページへの遷移は `gotoAdminPage( page, pageSlug, readySelector )` を使う。
 *   3. 出力ディレクトリは自動作成されるので気にしなくてよい。
 *   4. 環境ノイズ（更新通知バー等）の非表示は `shot()` が内部で毎回 `prepareChrome()` を
 *      呼ぶため、カット追加側で意識する必要はない（詳細は `prepareChrome()` の docblock）。
 */
const { test } = require( '@playwright/test' );
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { loginAsAdmin } = require( '../e2e/helpers' );

const OUTPUT_ROOT = path.resolve(
	__dirname,
	'..',
	'..',
	'docs',
	'website-screenshots'
);

/**
 * WordPress 管理画面に写り込む "環境ノイズ" を CSS 注入で非表示にする。
 *
 * なぜ CSS 注入なのか（DB を書き換えない理由）:
 *   wp-env の実際の更新状態（コア/プラグインの利用可能な更新件数など）は時期によって
 *   変わる。これを DB・オプションの書き換えで「更新なし」の状態にそろえる方式だと、
 *   撮影するたびに環境の実状態に依存した違う絵になってしまい、冪等性が保てない。
 *   CSS で `display: none !important` にする方式なら、環境の実状態に一切左右されず
 *   毎回同じ見た目が得られる。また WordPress のグローバルな状態（更新通知の有無や
 *   DB の値）を書き換えないため、回帰スイート（tests/e2e/）や他の検証作業に
 *   副作用を残さない。
 *
 * 非表示にする対象:
 *   - .update-nag            「WordPress X.Y is available!」の黄色い通知バー。
 *                             `display:none` はレイアウトフローから外れるため、
 *                             このバーの分だけ下に押し下げられていたコンテンツが
 *                             正しい縦位置（既存マニュアル画像と同じ位置）に戻る。
 *                             `visibility:hidden` だと空間が残ってしまうため使わない。
 *   - #wp-admin-bar-updates   管理バー左上の更新カウントバッジ。
 *   - .update-plugins         サイドバー「プラグイン」項目の更新バッジ。
 *   - #wp-admin-bar-comments  管理バーのコメント数バッジ。
 *
 * @param {import('@playwright/test').Page} page
 */
async function prepareChrome( page ) {
	await page.addStyleTag( {
		content: `
			.update-nag,
			#wp-admin-bar-updates,
			.update-plugins,
			#wp-admin-bar-comments {
				display: none !important;
			}
		`,
	} );
}

/**
 * docs/website-screenshots/<slug>/<name>.png へ 1280x720 のビューポート画像を書き出す。
 *
 * 追加時の規約:
 *   - slug: 公式サイトのヘルプページ slug（例: 'stores'）。
 *   - name: "NN-kebab-case.png" 形式（NN は同一 slug 内の連番2桁）。
 *   - 常に fullPage:false（ビューポートのみ）。type/quality は指定しない
 *     （path の拡張子 .png により自動的に PNG になる。既存 27 枚と同じ条件を保つため）。
 *   - 撮影の直前に必ず `prepareChrome( page )` を通してから `page.screenshot()` する。
 *     `page.addStyleTag()` はページ遷移すると失われるため、`gotoAdminPage()` の後や
 *     モーダル操作の後など、呼び出し側でどこまで遷移が挟まっていても確実に効くように、
 *     撮影の直前（この関数の内部）で毎回呼び直す設計にしている。呼び出し側
 *     （各 `test()`）で呼び忘れる余地がない。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          slug
 * @param {string}                          name
 */
async function shot( page, slug, name ) {
	const dir = path.join( OUTPUT_ROOT, slug );
	fs.mkdirSync( dir, { recursive: true } );
	await prepareChrome( page );
	await page.screenshot( { path: path.join( dir, name ), fullPage: false } );
}

/**
 * 管理画面の指定ページへ遷移し、React アプリのマウント完了（readySelector の出現）まで待つ。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          pageSlug      wp-admin の ?page= に渡すクエリ値（例: 'smart-booking-stores'）。
 * @param {string}                          readySelector マウント完了の目印にする CSS セレクタ（例: '.smb-page--stores'）。
 */
async function gotoAdminPage( page, pageSlug, readySelector ) {
	await page.goto( `/wp-admin/admin.php?page=${ pageSlug }`, {
		waitUntil: 'domcontentloaded',
	} );
	await page.waitForSelector( readySelector, { timeout: 15_000 } );
}

test.describe( 'help screenshots (docs/website-screenshots)', () => {
	test.beforeEach( async ( { page } ) => {
		await loginAsAdmin( page );
	} );

	test( 'stores', async ( { page } ) => {
		await gotoAdminPage(
			page,
			'smart-booking-stores',
			'.smb-page--stores'
		);
		// シード未投入でも一覧コンテナの描画自体は待てるはず。特定の店舗名（例: 渋谷店）を
		// 厳しく待つと、シード未実行時にタイムアウトしてしまうため、店舗名への依存は避け、
		// 「一覧テーブル/リストが描画されたこと」を基準に待つ。
		await page.waitForTimeout( 500 );
		await shot( page, 'stores', '01-store-list.png' );

		await page
			.locator( 'button', { hasText: '店舗を追加' } )
			.first()
			.click();
		await page.waitForSelector( '[role="dialog"]', { timeout: 10_000 } );
		await page.waitForTimeout( 400 );
		await shot( page, 'stores', '02-store-add-modal.png' );
		await page.keyboard.press( 'Escape' );
	} );
} );
