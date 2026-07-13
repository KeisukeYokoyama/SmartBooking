/**
 * few_left（残りわずか）視覚回帰 再現テスト（Red / Step1）
 *
 * 仕様（docs/smart-booking-spec.md 3.4 カレンダーUI）:
 *   available … 選択可能・通常色 / few_left … 選択可能・【警告色】
 *   full … 選択不可・グレーアウト / closed … 選択不可・グレーアウト
 *   → few_left は available と【視覚的に区別可能（警告色）】でなければならない。
 *
 * 回帰の機序（src/frontend/styles/frontend.css）:
 *   :794  .smb-front-time-btn.is-few_left { background:#fffbeb; border-color:#fbbf24 }  ← 元の警告色
 *   :2305 .smb-front-time-btn.is-few_left { background:#ffffff; border-color:var(--smb-front-border-default) } ← 同specificity・後勝ちで打ち消し
 *   :2361 .smb-front-time-btn__badge { display:none }  ← 「残りわずか」バッジも非表示
 *   日付タイル側: DateSelect が付ける is-tone-few に対応する CSS が無く、day-strip は __badge 要素も描画しない。
 *   結果 few_left は available と見た目完全同一（aria-label のみ差）。
 *
 * few_left 判定（includes/rest/class-rest-public.php get_availability）:
 *   available = capacity - booked_count。 available<=2 もしくは available<=ceil(capacity*0.3) で few_left。
 *   本テスト: capacity=10 / booked_count=8 → 残席2 <= 2 で few_left。
 *              capacity=10 / booked_count=0 → 残席10 で available。
 *              capacity=10 / booked_count=10 → full。
 *
 * このテストは「few_left と available が区別できる」ことを期待（Green の布石）として書く。
 * 修正前は両者同一のため落ちる = Red。修正後 Green になれば直ったと判定する。
 * 読み取り専用の検証資産（product source は変更しない）。
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

// DateSelect の day-strip タイルが描画する日番号ラベル "{month+1}/{date}"。
function mdLabel( offset ) {
	const d = new Date();
	d.setDate( d.getDate() + offset );
	return `${ d.getMonth() + 1 }/${ d.getDate() }`;
}

const DATE_AVAIL = ymd( 2 ); // available のみの日 → tone available
const DATE_FEW = ymd( 3 ); // few_left のみの日 → tone few
const DATE_FULL = ymd( 4 ); // full のみの日 → tone full（disabled）
const DATE_MIX = ymd( 5 ); // available + few_left + full を同一日に並べる（時間枠比較用）

function seed() {
	const s = USER_STORE_ID;
	const st = USER_STAFF_ID;
	const rows = [
		`(${ s },${ st },'${ DATE_AVAIL }','10:00:00','11:00:00',10,0,1,NOW(),NOW())`,
		`(${ s },${ st },'${ DATE_FEW }','10:00:00','11:00:00',10,8,1,NOW(),NOW())`,
		`(${ s },${ st },'${ DATE_FULL }','10:00:00','11:00:00',10,10,1,NOW(),NOW())`,
		`(${ s },${ st },'${ DATE_MIX }','10:00:00','11:00:00',10,0,1,NOW(),NOW())`,
		`(${ s },${ st },'${ DATE_MIX }','13:00:00','14:00:00',10,8,1,NOW(),NOW())`,
		`(${ s },${ st },'${ DATE_MIX }','16:00:00','17:00:00',10,10,1,NOW(),NOW())`,
	].join( ',' );
	wpCli(
		`wp db query "INSERT INTO wp_smart_booking_schedules (store_id,staff_id,schedule_date,start_time,end_time,capacity,booked_count,is_active,created_at,updated_at) VALUES ${ rows };"`
	);
}

async function computed( page, selector ) {
	return page.evaluate( ( sel ) => {
		const el = document.querySelector( sel );
		if ( ! el ) return null;
		const cs = getComputedStyle( el );
		return {
			backgroundColor: cs.backgroundColor,
			borderColor: cs.borderTopColor,
			color: cs.color,
			opacity: cs.opacity,
			display: cs.display,
			className: el.className,
		};
	}, selector );
}

// day-strip の指定 M/D タイルの computed style を返す。
async function computedDayTile( page, md ) {
	return page.evaluate( ( label ) => {
		const tiles = Array.from(
			document.querySelectorAll( '.smb-front-day-tile' )
		);
		const el = tiles.find( ( t ) => {
			const day = t.querySelector( '.smb-front-day-tile__day' );
			return day && day.textContent.trim() === label;
		} );
		if ( ! el ) return null;
		const cs = getComputedStyle( el );
		return {
			backgroundColor: cs.backgroundColor,
			borderColor: cs.borderTopColor,
			color: cs.color,
			opacity: cs.opacity,
			className: el.className,
			hasBadge: !! el.querySelector( '.smb-front-day-tile__badge' ),
		};
	}, md );
}

async function openMixedDay( page ) {
	await gotoFrontForm( page );
	await page.waitForSelector( '.smb-front-day-tile', { timeout: 10_000 } );
	// mixed 日（available+few+full）の日番号を厳密一致でクリック → TimeSelect 表示。
	await page.getByText( mdLabel( 5 ), { exact: true } ).first().click();
	await page.waitForSelector( '.smb-front-time-btn.is-few_left', {
		timeout: 10_000,
	} );
}

test.describe( 'few_left 視覚回帰 再現（Red）', () => {
	test.beforeAll( () => {
		restoreBaseline();
		setOption( 'smart_booking_display_days', 14 ); // day-strip に +5 日を確実に含める
		seed();
	} );

	test.afterAll( () => {
		restoreBaseline(); // 投入データ削除・オプション既定復帰（permalink 不変）
	} );

	test( '時間枠: few_left は available と視覚的に区別できるべき', async ( {
		page,
	}, testInfo ) => {
		const vp = testInfo.project.name;
		await openMixedDay( page );

		const avail = await computed(
			page,
			'.smb-front-time-btn.is-available'
		);
		const few = await computed( page, '.smb-front-time-btn.is-few_left' );
		const full = await computed( page, '.smb-front-time-btn.is-full' );
		const badge = await computed(
			page,
			'.smb-front-time-btn.is-few_left .smb-front-time-btn__badge'
		);

		// 実測ダンプ（load-bearing 証跡）。
		// eslint-disable-next-line no-console
		console.log( `[few-left][${ vp }] TIME available=${ JSON.stringify( avail ) }` );
		// eslint-disable-next-line no-console
		console.log( `[few-left][${ vp }] TIME few_left =${ JSON.stringify( few ) }` );
		// eslint-disable-next-line no-console
		console.log( `[few-left][${ vp }] TIME full     =${ JSON.stringify( full ) }` );
		// eslint-disable-next-line no-console
		console.log( `[few-left][${ vp }] TIME fewbadge =${ JSON.stringify( badge ) }` );

		expect( avail ).not.toBeNull();
		expect( few ).not.toBeNull();

		// 制御群（現状 Green のはず）: full は available とグレーアウトで区別できる。
		expect( full ).not.toBeNull();
		expect( full.color ).not.toBe( avail.color );

		// 期待仕様（Green の布石）: few_left は available と背景 or ボーダーで区別できる。
		// 現状は両者同一 → この assert が落ちる = Red。
		expect(
			few.backgroundColor !== avail.backgroundColor ||
				few.borderColor !== avail.borderColor
		).toBe( true );
	} );

	test( '時間枠: 残りわずかバッジが可視であるべき', async ( { page }, testInfo ) => {
		const vp = testInfo.project.name;
		await openMixedDay( page );
		const badge = await computed(
			page,
			'.smb-front-time-btn.is-few_left .smb-front-time-btn__badge'
		);
		// eslint-disable-next-line no-console
		console.log(
			`[few-left][${ vp }] BADGE display=${ badge && badge.display } text/bg=${ JSON.stringify( badge ) }`
		);
		// 期待: 残りわずかバッジは可視（display !== none）。現状 display:none → Red。
		expect( badge ).not.toBeNull();
		expect( badge.display ).not.toBe( 'none' );
	} );

	test( '日付タイル: few_left 日は available 日と視覚的に区別できるべき', async ( {
		page,
	}, testInfo ) => {
		const vp = testInfo.project.name;
		await gotoFrontForm( page );
		await page.waitForSelector( '.smb-front-day-tile', { timeout: 10_000 } );

		const availTile = await computedDayTile( page, mdLabel( 2 ) );
		const fewTile = await computedDayTile( page, mdLabel( 3 ) );
		const fullTile = await computedDayTile( page, mdLabel( 4 ) );

		// eslint-disable-next-line no-console
		console.log( `[few-left][${ vp }] TILE available=${ JSON.stringify( availTile ) }` );
		// eslint-disable-next-line no-console
		console.log( `[few-left][${ vp }] TILE few_left =${ JSON.stringify( fewTile ) }` );
		// eslint-disable-next-line no-console
		console.log( `[few-left][${ vp }] TILE full     =${ JSON.stringify( fullTile ) }` );

		expect( availTile ).not.toBeNull();
		expect( fewTile ).not.toBeNull();

		// サニティ: tone クラスは正しく付与されている（区別の材料はあるのに CSS が無いことの証明）。
		expect( fewTile.className ).toContain( 'is-tone-few' );
		expect( availTile.className ).toContain( 'is-tone-available' );

		// 制御群: full 日は disabled（選択不可・グレーアウト）で区別できる。
		expect( fullTile ).not.toBeNull();
		expect( fullTile.className ).toContain( 'is-disabled' );

		// 期待仕様（Green の布石）: few_left 日は available 日と背景/ボーダー/バッジで区別できる。
		// 現状は day-strip に tone-few 用 CSS もバッジ要素も無く同一 → Red。
		expect(
			fewTile.backgroundColor !== availTile.backgroundColor ||
				fewTile.borderColor !== availTile.borderColor ||
				fewTile.hasBadge === true
		).toBe( true );
	} );
} );
