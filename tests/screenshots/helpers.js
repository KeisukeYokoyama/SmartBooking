/**
 * 撮影 spec 共通ヘルパー（docs/website-screenshots 用）。
 *
 * 位置づけ:
 *   - 回帰スイート（tests/e2e/）とは無関係。`npm run screenshots` からのみ読まれる。
 *   - ここはアサーション（expect）を増やす場所ではない。目的は「見た目のキャプチャ」のみ。
 *   - 出力先は docs/website-screenshots/<slug>/NN-name.png（<slug> は公式サイト側の
 *     ヘルプページ slug と一致させる。既存 slug 一覧は docs/website-screenshots/README.md 参照）。
 *
 * 元は tests/screenshots/help.spec.js の中に閉じていたが、撮影対象が複数ファイルに
 * 分かれたため共有モジュールとして切り出した（挙動は変えていない）。
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );

const OUTPUT_ROOT = path.resolve(
	__dirname,
	'..',
	'..',
	'docs',
	'website-screenshots'
);

/**
 * 各カットに「何の文字が写っているか」を機械判定するためのテキストダンプ出力先。
 *
 * なぜ必要か:
 *   PNG は grep できない。2026-09-12 に「公開済み 27 枚のどれに `お名前` が写っているか」を
 *   特定する必要が生じ、全枚を目視で突き合わせるしかなかった
 *   （`docs/bugs/screenshot-seed-customer-name-label.md`）。撮影時点の DOM テキストを
 *   PNG と同じ名前で残しておけば、以後は `grep -rl 'お名前' screenshot-text/` で
 *   影響カットが一意に出る。
 *
 * ⚠ 出力先を `test-results/` 配下にしないこと。Playwright は実行のたびに `outputDir`
 * （既定 `test-results/`）を**丸ごと削除**するため、`--grep` で 1 カットだけ撮り直すと
 * 他のカットのダンプが消える（実際に踏んだ）。リポジトリ直下の専用ディレクトリへ出し、
 * .gitignore で除外する。
 *
 * innerText だけでなく placeholder / value も出す（`山田 太郎` のように
 * **プレースホルダにしか現れない文字**があるため）。
 */
const TEXT_DUMP_ROOT = path.resolve( __dirname, '..', '..', 'screenshot-text' );

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
 *   - 撮影の直前に必ず `prepareChrome( page )` を通す。`page.addStyleTag()` はページ遷移で
 *     失われるため、呼び出し側の遷移状況に関わらず効くようここで毎回呼び直す。
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
	await dumpText( page, slug, name );
}

/**
 * 撮影と同時に「写っている文字」を test-results/shot-text/<slug>/<name>.txt へ書き出す。
 *
 * 撮影自体を絶対に止めないため、失敗しても例外を投げない（ダンプはあくまで補助）。
 * 対象は `document.body` の innerText と、フォームコントロールの
 * placeholder / value / 選択中 option のラベル。ビューポート外の要素も含む
 * （カットの切り出し位置に依存せず「そのページに出ていた文字」を拾うため。
 * 逆に「画像に写っているか」の最終確認は目視で行う）。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          slug
 * @param {string}                          name PNG と同じファイル名（拡張子は .txt に置換する）。
 */
async function dumpText( page, slug, name ) {
	try {
		const payload = await page.evaluate( () => {
			const controls = [];
			document
				.querySelectorAll( 'input, textarea, select' )
				.forEach( ( el ) => {
					const tag = el.tagName.toLowerCase();
					const parts = [ tag ];
					if ( el.name ) {
						parts.push( `name=${ el.name }` );
					}
					if ( el.id ) {
						parts.push( `id=${ el.id }` );
					}
					if ( el.placeholder ) {
						parts.push( `placeholder="${ el.placeholder }"` );
					}
					if ( 'select' === tag ) {
						const opt = el.options[ el.selectedIndex ];
						if ( opt ) {
							parts.push( `selected="${ opt.label }"` );
						}
					} else if ( el.value && 'password' !== el.type ) {
						parts.push( `value="${ el.value }"` );
					}
					if ( parts.length > 1 ) {
						controls.push( `[${ parts.join( ' ' ) }]` );
					}
				} );
			return {
				url: window.location.href,
				innerText: document.body ? document.body.innerText : '',
				controls: controls.join( '\n' ),
			};
		} );
		const dir = path.join( TEXT_DUMP_ROOT, slug );
		fs.mkdirSync( dir, { recursive: true } );
		const out = [
			`# ${ slug }/${ name }`,
			`## url`,
			payload.url,
			'',
			'## innerText',
			payload.innerText,
			'',
			'## form controls (placeholder / value / selected)',
			payload.controls,
			'',
		].join( '\n' );
		fs.writeFileSync(
			path.join( dir, name.replace( /\.png$/, '' ) + '.txt' ),
			out,
			'utf8'
		);
	} catch ( _e ) {
		// ダンプの失敗で撮影を止めない。
	}
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
	// React の初回描画直後はレイアウトが数フレーム動く（一覧の遅延読み込み等）。
	await page.waitForTimeout( 400 );
}

/**
 * 指定要素がビューポート上端から `offset` px の位置に来るまでスクロールする。
 *
 * 「セクション見出しから〜までを1枚に収める」という原稿側の指定を満たすための道具。
 * 既定の 48px は WP 管理バー（32px）の下に少し余白を置いた値。
 *
 * @param {import('@playwright/test').Page}    page
 * @param {import('@playwright/test').Locator} locator
 * @param {number}                             offset
 */
async function scrollToTop( page, locator, offset = 48 ) {
	await locator.evaluate( ( el, off ) => {
		const rect = el.getBoundingClientRect();
		window.scrollBy( 0, rect.top - off );
	}, offset );
	await page.waitForTimeout( 300 );
}

/**
 * モーダル内部のスクロール領域を、指定要素が見える位置まで動かす。
 *
 * モーダル本文（.smb-modal__body 等）は window ではなく自前のスクロールコンテナなので、
 * `scrollToTop()` ではなくこちらを使う。
 *
 * @param {import('@playwright/test').Page}    page
 * @param {import('@playwright/test').Locator} locator
 */
async function scrollInModal( page, locator ) {
	await locator.evaluate( ( el ) => {
		el.scrollIntoView( { block: 'center' } );
	} );
	await page.waitForTimeout( 250 );
}

/**
 * フォーム設定ページを開き、フォームセレクタで指定名のフォームを選び、必要ならタブを切り替える。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          formName フォーム名（完全一致。例: '無料体験のお申し込み'）。
 * @param {string}                          [tab]    'fields'（既定）または 'mail'。
 */
async function openFormSettings( page, formName, tab = 'fields' ) {
	await gotoAdminPage(
		page,
		'smart-booking-form-settings',
		'.smb-page--form-settings'
	);
	const select = page.locator( '.smb-form-selector-bar select.smb-select' );
	await select.waitFor( { timeout: 15_000 } );
	await select.selectOption( { label: formName } );
	// フィールド一覧の再読み込み（API.customFields.list）が終わるまで待つ。
	await page.waitForTimeout( 700 );
	if ( 'mail' === tab ) {
		await page
			.locator( 'button[role="tab"]', { hasText: 'メール' } )
			.first()
			.click();
		await page.waitForTimeout( 700 );
	}
}

/**
 * 「現在のフィールド一覧」から、指定ラベルの行の「編集」ボタンを押してモーダルを開く。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          label フィールドのラベル（例: '送付先住所'）。
 * @return {Promise<import('@playwright/test').Locator>} モーダルの Locator。
 */
async function openFieldEditModal( page, label ) {
	const row = page
		.locator( '.smb-field-list__row' )
		.filter( { hasText: label } )
		.first();
	await row.waitFor( { timeout: 15_000 } );
	await row.getByRole( 'button', { name: '編集', exact: true } ).click();
	const modal = page.locator( '.smb-modal' ).first();
	await modal.waitFor( { timeout: 10_000 } );
	await page.waitForTimeout( 400 );
	return modal;
}

/**
 * `window.confirm` / `alert` を常に OK で閉じるハンドラを登録する。
 *
 * src/admin/components/Modal.jsx は未保存の変更があるモーダルを Escape で閉じるとき
 * `window.confirm` を出す。Playwright は既定でダイアログを **dismiss**（＝キャンセル）
 * するため、ハンドラを付けないとモーダルが閉じず次のカットに前の画面が写り込む。
 *
 * @param {import('@playwright/test').Page} page
 */
function autoAcceptDialogs( page ) {
	page.on( 'dialog', ( dialog ) => {
		dialog.accept().catch( () => {} );
	} );
}

/**
 * 開いているモーダルを Escape で閉じ、閉じ切るまで待つ。
 *
 * 未保存の変更があるモーダルは `window.confirm` を挟むため、
 * 呼び出し側の test で `autoAcceptDialogs( page )` を済ませておくこと。
 *
 * @param {import('@playwright/test').Page} page
 */
async function closeModal( page ) {
	await page.keyboard.press( 'Escape' );
	await page
		.locator( '.smb-modal' )
		.first()
		.waitFor( { state: 'detached', timeout: 5000 } )
		.catch( () => {} );
	await page.waitForTimeout( 250 );
}

module.exports = {
	OUTPUT_ROOT,
	TEXT_DUMP_ROOT,
	prepareChrome,
	shot,
	dumpText,
	gotoAdminPage,
	scrollToTop,
	scrollInModal,
	openFormSettings,
	openFieldEditModal,
	closeModal,
	autoAcceptDialogs,
};
