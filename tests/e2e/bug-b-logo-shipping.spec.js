/**
 * BUG-B (v0.2.3): 管理画面ロゴの配布同梱 — 修正後の Green ゲート.
 *
 * 修正機構（Step2）:
 *   src/admin/App.jsx が `import logoSrc from './images/SmartBookingLogo.svg'`
 *   に変更され、@wordpress/scripts (url-loader) が 785B の SVG を
 *   `build/admin.js` に `data:image/svg+xml;base64,...` として**インライン同梱**。
 *   → ロゴは admin.js 単体で完結し、配布に docs/ が無くても 404 不能.
 *
 * 反転（Red→Green）:
 *   修正前は App.jsx が実行時 `${pluginUrl}docs/images/SmartBookingLogo.svg` を
 *   参照し（build に docs/images 文字列がハードコード・data URI 無し）、docs/ は
 *   .distignore で配布除外 → 配布物でロゴ 404. 本 spec の期待（src=data URI／
 *   build に docs/images 不在／data URI 同梱）は修正前 build では成立せず Red、
 *   修正後 build で Green.
 */
const { test, expect } = require( '@playwright/test' );
const fs = require( 'fs' );
const path = require( 'path' );
const { loginAsAdmin } = require( './helpers' );

const PLUGIN_ROOT = path.resolve( __dirname, '../../' );
const BUILD_ADMIN = path.join( PLUGIN_ROOT, 'build/admin.js' );

function loadDistignoreEntries() {
	const raw = fs.readFileSync( path.join( PLUGIN_ROOT, '.distignore' ), 'utf8' );
	return raw
		.split( /\r?\n/ )
		.map( ( l ) => l.trim() )
		.filter( ( l ) => l && ! l.startsWith( '#' ) )
		.map( ( l ) => l.replace( /\/+$/, '' ) );
}

function isExcluded( relPath, entries ) {
	return entries.some( ( e ) => relPath === e || relPath.startsWith( e + '/' ) );
}

test.describe( 'BUG-B: admin logo shipped inline in distribution bundle', () => {
	// GREEN 1: 実行時解決（404 でない）— data URI インラインで self-resolve.
	test( '[GREEN] 管理画面ロゴ img src が data URI で描画される（naturalWidth>0）', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking', {
			waitUntil: 'domcontentloaded',
		} );

		const img = page.locator( 'img.smb-app__brand-logo' );
		await expect( img ).toHaveCount( 1 );

		const src = await img.getAttribute( 'src' );
		console.log( '[BUG-B] rendered logo src (first 60) =', ( src || '' ).slice( 0, 60 ) );
		// 実行時 src は docs/ を指さず、data URI で自己完結する.
		expect( src ).toMatch( /^data:image\/svg\+xml/ );
		expect( src ).not.toContain( 'docs/images' );

		await img.evaluate( ( el ) => ( el.decode ? el.decode().catch( () => {} ) : null ) );
		const naturalWidth = await img.evaluate( ( el ) => el.naturalWidth );
		console.log( '[BUG-B] rendered naturalWidth =', naturalWidth );
		expect( naturalWidth ).toBeGreaterThan( 0 );
	} );

	// GREEN 2: 配布バンドルにロゴが同梱され、非配布 docs/ を参照しない.
	test( '[GREEN] build/admin.js にロゴ data URI 同梱・docs/images 不参照', () => {
		const js = fs.readFileSync( BUILD_ADMIN, 'utf8' );
		// ロゴがバンドルへインライン同梱されている.
		expect( js ).toContain( 'data:image/svg+xml' );
		// 非配布 docs/ ディレクトリを実行時参照していない.
		expect( js.indexOf( 'docs/images' ) ).toBe( -1 );
	} );

	// GREEN 3: 同梱先 build/admin.js は .distignore で除外されない（＝配布される）.
	test( '[GREEN] ロゴ同梱先 build/admin.js は配布対象（.distignore 非除外）', () => {
		const entries = loadDistignoreEntries();
		// build/ は配布に含まれる（ロゴのインライン同梱先）.
		expect( isExcluded( 'build/admin.js', entries ) ).toBe( false );
		// docs/ は配布から除外される（旧参照先＝配布不能だったことの確認）.
		expect( isExcluded( 'docs/images/SmartBookingLogo.svg', entries ) ).toBe( true );
	} );
} );
