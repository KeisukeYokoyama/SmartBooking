/**
 * v0.5.1 空き状況文言カスタマイズ + フォールバック E2E（読取専用検証資産）。
 *
 * 文言3種（残りわずか/満席/締切）を任意値に設定 → フロントのバッジ表示 & aria-label に反映。
 * 空文字設定 → デフォルト表示（残りわずか/満席）に戻ることも検証。
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
	// cap10 booked8 => 空き2（自動しきい値で few_left） / cap3 booked3 => full.
	const rows = [
		`(${ s },${ st },'${ DAY }','10:00:00','11:00:00',10,8,1,NOW(),NOW())`,
		`(${ s },${ st },'${ DAY }','11:00:00','12:00:00',3,3,1,NOW(),NOW())`,
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
		els.map( ( e ) => {
			const badge = e.querySelector( '.smb-front-time-btn__badge' );
			return {
				aria: e.getAttribute( 'aria-label' ) || '',
				cls: e.className,
				badge: badge ? badge.textContent.trim() : '',
			};
		} )
	);
}

test.describe( 'v0.5.1 文言カスタマイズ + フォールバック', () => {
	test.beforeAll( () => {
		restoreBaseline();
		clearV051();
		setOption( 'smart_booking_display_days', 14 );
		seed();
	} );
	test.afterAll( () => {
		clearV051();
		restoreBaseline();
	} );

	test( 'カスタム文言がバッジ & aria-label に反映', async ( { page }, testInfo ) => {
		setOption( 'smart_booking_label_few_left', 'あと少し' );
		setOption( 'smart_booking_label_full', '満員御礼' );
		const slots = await readSlots( page );
		// eslint-disable-next-line no-console
		console.log( `[v051-lbl-custom][${ testInfo.project.name }] ${ JSON.stringify( slots ) }` );
		const few = slots.find( ( s ) => s.cls.includes( 'is-few_left' ) );
		const full = slots.find( ( s ) => s.cls.includes( 'is-full' ) );
		expect( few, 'few_left 枠が存在' ).toBeTruthy();
		expect( full, 'full 枠が存在' ).toBeTruthy();
		expect( few.badge ).toBe( 'あと少し' );
		expect( few.aria ).toContain( 'あと少し' );
		expect( full.badge ).toBe( '満員御礼' );
		expect( full.aria ).toContain( '満員御礼' );
	} );

	test( '空文字設定でデフォルト表示に戻る', async ( { page }, testInfo ) => {
		setOption( 'smart_booking_label_few_left', '' );
		setOption( 'smart_booking_label_full', '' );
		const slots = await readSlots( page );
		// eslint-disable-next-line no-console
		console.log( `[v051-lbl-default][${ testInfo.project.name }] ${ JSON.stringify( slots ) }` );
		const few = slots.find( ( s ) => s.cls.includes( 'is-few_left' ) );
		const full = slots.find( ( s ) => s.cls.includes( 'is-full' ) );
		expect( few.badge ).toBe( '残りわずか' );
		expect( few.aria ).toContain( '残りわずか' );
		expect( full.badge ).toBe( '満席' );
		expect( full.aria ).toContain( '満席' );
	} );
} );
