/**
 * BUG-1/2/4 店舗×担当者スコープ隔離ゲート + 重複/孤児 不変条件。
 *
 * 実体は wp eval-file (tests/red/bug124-red.php) が REST の copy_schedules/create_item を
 * 実コード経路で叩き、DB クエリで不変条件を検証する。ここでは SUMMARY を解析し
 * 「FAIL(=バグ再現)=0」を assert する。
 *   - 未修正コード: 7 FAIL -> このスペックは RED（バグ存在の証明）
 *   - 修正後      : 0 FAIL -> GREEN（隔離ゲート成立）
 *
 * 実行: npx playwright test tests/e2e/bug124-scope-isolation.spec.js --project=desktop
 */
const { test, expect } = require( '@playwright/test' );
const { execSync } = require( 'node:child_process' );
const path = require( 'node:path' );

const REL = 'wp-content/plugins/smart-booking/tests/red/bug124-red.php';

function runRed() {
	const out = execSync( `npx wp-env run cli wp eval-file ${ REL }`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 120_000,
	} );
	return out;
}

test.describe( 'BUG-1/2/4 scope isolation gate', () => {
	test( 'copy stays within (store,staff); no dup rows; no orphan drift', () => {
		const out = runRed();
		// eslint-disable-next-line no-console
		console.log( out );
		const m = out.match( /SUMMARY:\s*PASS=(\d+)\s*FAIL\(BUG REPRODUCED\)=(\d+)/ );
		expect( m, `SUMMARY line not found in:\n${ out }` ).not.toBeNull();
		const failCount = parseInt( m[ 2 ], 10 );
		expect( failCount, `Scope-isolation/dup/orphan invariants violated (FAIL=${ failCount }). See eval-file output above.` ).toBe( 0 );
	} );
} );
