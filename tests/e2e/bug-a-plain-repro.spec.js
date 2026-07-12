/**
 * BUG-A 再現テスト: Plain パーマリンク下で REST が二重 `?` → 404 rest_no_route。
 *
 * 規約準拠: 修正前は Red（失敗）、修正後 Green。
 *   本テストは「修正後に期待される正しい挙動」= param 付き REST 呼び出しも
 *   route に到達する（404 rest_no_route にならない）ことを assert する。
 *   現状（buildUrl が無条件に '?' を付与）では二重 '?' で 404 になるため Red。
 *   buildUrl が既存クエリを検知して '&' 連結するよう直せば Green になる。
 *
 * 前提: パーマリンクが Plain（''）。logic-evaluator が事前に設定する。
 *   restUrl に 'rest_route=' が含まれることで Plain を自己検証する。
 *
 * ⚠️ 位置づけ（重要・恒久）:
 *   本 spec は BUG-A の Red 実証専用であり、admin 側のアサーション内で
 *   実バンドルの buildUrl を使わず「無条件 '?' 前置」という旧バグロジックを
 *   意図的に再実装して 404 を再現している（コメント参照: L72 相当）。
 *   そのため本 spec は修正後も設計上ずっと赤（failing）のままが正常であり、
 *   通常の回帰実行（`npx playwright test` 等）に含めると「回帰失敗」と
 *   誤認される。この理由から本 spec は常時スキップとし、回帰ゲートには
 *   使わない。正しい Plain パーマリンクの Green ゲートは別ファイル
 *   `tests/e2e/bug-a-plain-regate.spec.js` を参照すること（そちらが正のゲート）。
 */
const { test, expect } = require( '@playwright/test' );
const { loginAsAdmin } = require( './helpers' );
const { gotoFrontForm, publicRest } = require( './phase3-helpers' );

test.describe.skip( 'BUG-A: Plain permalink REST 404 (double-?) [Red-only, not a regression gate — see bug-a-plain-regate.spec.js]', () => {
	test( '(b) front: param付き public/staff が route に到達する（非404）', async ( { page } ) => {
		await gotoFrontForm( page );
		const restUrl = await page.evaluate(
			() => ( window.smartBookingFrontend || {} ).restUrl || ''
		);
		expect( restUrl, 'restUrl should be Plain (rest_route=) form' ).toContain(
			'rest_route='
		);

		// no-param（対照）: route マッチ → 200
		const noParam = await publicRest( page, 'public/stores' );
		expect( noParam.status, 'no-param should reach route' ).toBe( 200 );

		// param付き: 修正後は route に到達すべき（404 rest_no_route にならない）
		const withParam = await publicRest( page, 'public/staff', {
			query: { store_id: 1 },
		} );
		console.log( '[BUG-A][b] withParam status=', withParam.status, 'body=', JSON.stringify( withParam.data ) );
		expect(
			withParam.data && withParam.data.code,
			'param call must not be rest_no_route (route must match)'
		).not.toBe( 'rest_no_route' );
		expect( withParam.status, 'param call should reach route (not 404)' ).not.toBe( 404 );
	} );

	test( '(a) admin: param付き /schedules が route に到達する（非404）', async ( { page } ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking', {
			waitUntil: 'domcontentloaded',
		} );
		const ctx = await page.evaluate( () => {
			const c = window.smartBookingAdmin || {};
			return { restUrl: c.restUrl || '', nonce: c.nonce || '' };
		} );
		expect( ctx.restUrl, 'admin restUrl should be Plain' ).toContain(
			'rest_route='
		);

		// 実バンドルと同じ buildUrl（無条件 ? 前置）で組み立て、実 fetch する
		const call = async ( path, params ) =>
			page.evaluate(
				async ( { restUrl, nonce, path, params } ) => {
					const base =
						restUrl.replace( /\/$/, '' ) + '/' + path.replace( /^\//, '' );
					let url = base;
					if ( params && Object.keys( params ).length ) {
						const qs = Object.entries( params )
							.map(
								( [ k, v ] ) =>
									encodeURIComponent( k ) +
									'=' +
									encodeURIComponent( v )
							)
							.join( '&' );
						url = qs ? base + '?' + qs : base; // ← src/admin/api.js L37 と同一（無条件 ?）
					}
					const res = await fetch( url, {
						credentials: 'same-origin',
						headers: { Accept: 'application/json', 'X-WP-Nonce': nonce },
					} );
					let data = null;
					try {
						data = await res.json();
					} catch {}
					return { status: res.status, data, url };
				},
				{ restUrl: ctx.restUrl, nonce: ctx.nonce, path, params }
			);

		const noParam = await call( 'schedules', null );
		expect( noParam.status, 'no-param admin should reach route (200)' ).toBe(
			200
		);

		const withParam = await call( 'schedules', {
			store_id: 1,
			staff_id: 1,
			start_date: '2026-07-01',
			end_date: '2026-07-31',
		} );
		console.log( '[BUG-A][a] withParam url=', withParam.url, 'status=', withParam.status, 'body=', JSON.stringify( withParam.data ) );
		expect(
			withParam.data && withParam.data.code,
			'param admin call must not be rest_no_route'
		).not.toBe( 'rest_no_route' );
		expect( withParam.status, 'param admin call should reach route (not 404)' ).not.toBe( 404 );
	} );
} );
