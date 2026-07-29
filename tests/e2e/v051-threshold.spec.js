/**
 * v0.5.1 空き状況しきい値挙動 E2E（logic-evaluator 検証資産・読取専用）。
 *
 * 仕様: smart_booking_few_left_threshold を 1 に設定すると、
 *   空き=1 の枠だけ few_left（残りわずか）、空き=2 の枠は available（通常）。
 * DOM の実 availability クラス（is-few_left / is-available）で検証する。
 */
const { test, expect } = require( '@playwright/test' );
const path = require( 'node:path' );
const { execSync } = require( 'node:child_process' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );

function wpCli( cmd ) {
	return execSync( `npx wp-env run cli ${ cmd }`, {
		cwd: path.resolve( __dirname, '..', '..' ),
		encoding: 'utf8',
		stdio: [ 'ignore', 'pipe', 'pipe' ],
		timeout: 60_000,
	} );
}
function mdLabel( offset ) {
	const d = new Date();
	d.setDate( d.getDate() + offset );
	return `${ d.getMonth() + 1 }/${ d.getDate() }`;
}
function clearV051() {
	[
		'smart_booking_few_left_threshold',
		'smart_booking_label_few_left',
		'smart_booking_label_full',
		'smart_booking_label_closed',
	].forEach( ( k ) => {
		try {
			wpCli( `wp option delete ${ k }` );
		} catch ( _e ) {}
	} );
}
const DAY = ymd( 3 );
function seed() {
	const s = USER_STORE_ID;
	const st = USER_STAFF_ID;
	// cap5 booked4 => 空き1 / cap5 booked3 => 空き2.
	const rows = [
		`(${ s },${ st },'${ DAY }','10:00:00','11:00:00',5,4,1,NOW(),NOW())`,
		`(${ s },${ st },'${ DAY }','11:00:00','12:00:00',5,3,1,NOW(),NOW())`,
	].join( ',' );
	wpCli(
		`wp db query "INSERT INTO wp_smart_booking_schedules (store_id,staff_id,schedule_date,start_time,end_time,capacity,booked_count,is_active,created_at,updated_at) VALUES ${ rows };"`
	);
}
async function readSlots( page ) {
	await gotoFrontForm( page );
	await page.waitForSelector( '.smb-front-day-tile', { timeout: 10_000 } );
	await page.getByText( mdLabel( 3 ), { exact: true } ).first().click();
	await page.waitForSelector( '.smb-front-time-btn', { timeout: 10_000 } );
	return page.$$eval( '.smb-front-time-btn', ( els ) =>
		els.map( ( e ) => ( {
			aria: e.getAttribute( 'aria-label' ) || '',
			cls: e.className,
		} ) )
	);
}

test.describe( 'v0.5.1 しきい値=1 挙動', () => {
	test.beforeAll( () => {
		restoreBaseline();
		clearV051();
		setOption( 'smart_booking_display_days', 14 );
		setOption( 'smart_booking_few_left_threshold', 1 );
		seed();
	} );
	test.afterAll( () => {
		clearV051();
		restoreBaseline();
	} );

	test( '空き=1 のみ few_left・空き=2 は通常', async ( { page }, testInfo ) => {
		const slots = await readSlots( page );
		// eslint-disable-next-line no-console
		console.log( `[v051-thr][${ testInfo.project.name }] ${ JSON.stringify( slots ) }` );
		const slot10 = slots.find( ( s ) => s.aria.startsWith( '10:00' ) );
		const slot11 = slots.find( ( s ) => s.aria.startsWith( '11:00' ) );
		expect( slot10, '10:00 (空き1) 枠が存在' ).toBeTruthy();
		expect( slot11, '11:00 (空き2) 枠が存在' ).toBeTruthy();
		// 空き=1 => few_left.
		expect( slot10.cls ).toContain( 'is-few_left' );
		// 空き=2 => available（few_left ではない）.
		expect( slot11.cls ).toContain( 'is-available' );
		expect( slot11.cls ).not.toContain( 'is-few_left' );
	} );
} );
