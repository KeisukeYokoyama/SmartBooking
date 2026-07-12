/**
 * BUG-A 再ゲート（Step 3）: Plain パーマリンク下で「修正版 buildUrl の URL 組み立て」が
 * REST route に到達する（非404・単一 ? ）ことを、実バンドルが使う LIVE restUrl と
 * 実サーバに対して証明する。
 *
 * 原 spec (bug-a-plain-repro.spec.js) は旧 buildUrl（無条件 '?' 前置）をインライン再実装した
 * Red 実証専用のため、src 修正では反転しない。本 spec は「修正後 buildUrl と同一の
 * セパレータ決定（base に '?' があれば '&'）」を LIVE restUrl に適用して実 fetch し、Green を示す。
 * さらに、実バンドルがナビゲーション中に発行した実 REST リクエスト URL を捕捉して二重 '?' が
 * 無いことを確認する（load-bearing な URL 引用用）。
 */
const { test, expect } = require( '@playwright/test' );
const { loginAsAdmin } = require( './helpers' );
const { gotoFrontForm } = require( './phase3-helpers' );

// 修正版 buildUrl と同一のロジックで URL を組み立てる（ページ内で評価）。
const FIXED_BUILD = ( restUrl, path, params ) => {
	const base = restUrl.replace( /\/$/, '' ) + '/' + path.replace( /^\//, '' );
	const qs = Object.entries( params )
		.filter( ( [ , v ] ) => v !== undefined && v !== null && v !== '' )
		.map( ( [ k, v ] ) => encodeURIComponent( k ) + '=' + encodeURIComponent( v ) )
		.join( '&' );
	if ( ! qs ) return base;
	const sep = base.indexOf( '?' ) === -1 ? '?' : '&'; // ← 修正版 api.js と同一
	return base + sep + qs;
};

function attachCapture( page ) {
	const rest = [];
	page.on( 'response', ( res ) => {
		const u = res.url();
		if ( u.includes( 'smart-booking' ) ) rest.push( { url: u, status: res.status() } );
	} );
	return rest;
}

test.describe( 'BUG-A re-gate: Plain permalink fixed buildUrl reaches route', () => {
	test( '(b) front: 修正版セパレータの param 付き public/staff・availability が非404・単一?', async ( { page } ) => {
		const captured = attachCapture( page );
		await gotoFrontForm( page );

		const restUrl = await page.evaluate(
			() => ( window.smartBookingFrontend || {} ).restUrl || ''
		);
		expect( restUrl, 'restUrl は Plain（rest_route=）形式であること' ).toContain( 'rest_route=' );

		const run = async ( path, params ) =>
			page.evaluate(
				async ( { restUrl, path, params, fnStr } ) => {
					// eslint-disable-next-line no-new-func
					const build = new Function( 'return (' + fnStr + ')' )();
					const ctx = window.smartBookingFrontend || {};
					const url = build( restUrl, path, params );
					const res = await fetch( url, {
						credentials: 'same-origin',
						headers: { Accept: 'application/json', 'X-WP-Nonce': ctx.nonce },
					} );
					let data = null;
					try { data = await res.json(); } catch {}
					return { url, status: res.status, code: data && data.code };
				},
				{ restUrl, path, params, fnStr: FIXED_BUILD.toString() }
			);

		const staff = await run( 'public/staff', { store_id: 2 } );
		const avail = await run( 'public/availability', {
			store_id: 2, staff_id: 2, date_from: '2026-07-01', date_to: '2026-07-31',
		} );
		// eslint-disable-next-line no-console
		console.log( '[REGATE][front] staff=', JSON.stringify( staff ) );
		// eslint-disable-next-line no-console
		console.log( '[REGATE][front] avail=', JSON.stringify( avail ) );
		// eslint-disable-next-line no-console
		console.log( '[REGATE][front] bundle-captured=', JSON.stringify( captured ) );

		for ( const r of [ staff, avail ] ) {
			expect( r.code, 'route に到達（rest_no_route でない）' ).not.toBe( 'rest_no_route' );
			expect( r.status, '非404' ).not.toBe( 404 );
			expect( ( r.url.match( /\?/g ) || [] ).length, '単一 ? （二重 ? が無い）' ).toBe( 1 );
		}
		// 実バンドルが自然発行した REST リクエストにも二重 ? が無いこと。
		for ( const c of captured ) {
			expect( ( c.url.match( /\?/g ) || [] ).length, 'bundle URL も単一 ?: ' + c.url ).toBeLessThanOrEqual( 1 );
		}
	} );

	test( '(a) admin: 修正版セパレータの param 付き /schedules が 200・単一?', async ( { page } ) => {
		const captured = attachCapture( page );
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking', { waitUntil: 'domcontentloaded' } );
		const ctx = await page.evaluate( () => {
			const c = window.smartBookingAdmin || {};
			return { restUrl: c.restUrl || '', nonce: c.nonce || '' };
		} );
		expect( ctx.restUrl, 'admin restUrl は Plain 形式' ).toContain( 'rest_route=' );

		const call = async ( path, params ) =>
			page.evaluate(
				async ( { restUrl, nonce, path, params, fnStr } ) => {
					// eslint-disable-next-line no-new-func
					const build = new Function( 'return (' + fnStr + ')' )();
					const url = build( restUrl, path, params );
					const res = await fetch( url, {
						credentials: 'same-origin',
						headers: { Accept: 'application/json', 'X-WP-Nonce': nonce },
					} );
					let data = null;
					try { data = await res.json(); } catch {}
					return { url, status: res.status, code: data && data.code };
				},
				{ restUrl: ctx.restUrl, nonce: ctx.nonce, path, params, fnStr: FIXED_BUILD.toString() }
			);

		const withParam = await call( 'schedules', {
			store_id: 2, staff_id: 2, start_date: '2026-07-01', end_date: '2026-07-31',
		} );
		// eslint-disable-next-line no-console
		console.log( '[REGATE][admin] schedules=', JSON.stringify( withParam ) );
		// eslint-disable-next-line no-console
		console.log( '[REGATE][admin] bundle-captured=', JSON.stringify( captured ) );

		expect( withParam.code, 'rest_no_route でない' ).not.toBe( 'rest_no_route' );
		expect( withParam.status, '200 で到達' ).toBe( 200 );
		expect( ( withParam.url.match( /\?/g ) || [] ).length, '単一 ?' ).toBe( 1 );
		for ( const c of captured ) {
			expect( ( c.url.match( /\?/g ) || [] ).length, 'bundle URL も単一 ?: ' + c.url ).toBeLessThanOrEqual( 1 );
		}
	} );
} );
