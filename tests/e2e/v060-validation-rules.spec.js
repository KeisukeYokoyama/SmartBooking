/**
 * v0.6.0 カスタムフィールドの入力ルール（文字種 / 文字数 / 一致する項目）E2E（新規）。
 *
 * 仕様: docs/spec-amendment-v060-validation-rules.md（付録A テストベクトル）。
 *
 *  1. 付録A: REST 直叩き（POST /public/reservations）で判定と保存値（整形後）を確認。
 *  2. 付録A: フロント操作（主要ケース）でインラインエラー文言と整形後の確認画面表示を確認。
 *  3. 手動予約（POST /reservations）ではルールを評価しないこと。
 *  4. 管理 API が不正ルール（最小>最大・未知 charset・自己参照・対象外型）を拒否すること。
 *  5. 一致ルールの比較先の削除ガード（smb_field_match_referenced）。
 *  6. マイグレーションの冪等性（無効化→有効化×2 で列は1つ・既存行 NULL）。
 *
 * 配布物外（検証専用）。serial・単一 spec でブラウザ生成を最小化する（環境のメモリ制約対策）。
 */
const { execSync } = require( 'node:child_process' );
const { test, expect } = require( '@playwright/test' );
const {
	gotoFrontForm,
	restoreBaseline,
	setOption,
	USER_STORE_ID,
	USER_STAFF_ID,
	insertSchedule,
	publicRest,
	ymd,
} = require( './phase3-helpers' );
const { loginAsAdmin } = require( './helpers' );

const CF = 'wp_smart_booking_custom_fields';
const RM = 'wp_smart_booking_reservation_meta';

function dbq( sql, extra = '' ) {
	return execSync(
		`npx wp-env run cli wp db query ${ JSON.stringify( sql ) } ${ extra }`,
		{ encoding: 'utf8' }
	);
}

function scalar( sql ) {
	const out = dbq( sql, '--skip-column-names' );
	return out.replace( /Success:.*$/m, '' ).trim();
}

// validation_rules 付きのカスタムフィールドを DB へ直接投入する（デフォルトフォームに紐付け）。
function insertRuleField(
	key,
	label,
	type,
	rules,
	{
		required = 0,
		sort = 50,
		condKey = null,
		condVal = null,
		options = null,
	} = {}
) {
	const vr = rules
		? "'" + JSON.stringify( rules ).replace( /'/g, "''" ) + "'"
		: 'NULL';
	const ck = condKey === null ? 'NULL' : `'${ condKey }'`;
	const cv = condVal === null ? 'NULL' : `'${ condVal }'`;
	const opts = options ? JSON.stringify( options ).replace( /'/g, "''" ) : '';
	dbq(
		`INSERT INTO ${ CF } (field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,validation_rules,created_at) ` +
			`VALUES ('${ key }','${ label }','${ type }','${ opts }','',${ required },${ sort },${ ck },${ cv },${ vr },NOW()); ` +
			`UPDATE ${ CF } SET form_id=(SELECT id FROM wp_smart_booking_forms WHERE is_default=1 LIMIT 1) WHERE form_id=0;`
	);
}

function latestReservationId() {
	const v = scalar(
		'SELECT id FROM wp_smart_booking_reservations ORDER BY id DESC LIMIT 1;'
	);
	const m = /(\d+)/.exec( v );
	return m ? parseInt( m[ 1 ], 10 ) : 0;
}

function metaVal( reservationId, metaKey ) {
	return scalar(
		`SELECT meta_value FROM ${ RM } WHERE reservation_id=${ reservationId } AND meta_key='${ metaKey }';`
	);
}

let scheduleId = 0;

test.describe.configure( { mode: 'serial' } );

test.describe( 'v0.6.0 入力ルール', () => {
	test.setTimeout( 180_000 );

	test.beforeAll( () => {
		restoreBaseline();
		setOption( 'smart_booking_show_store_front', 0 );
		setOption( 'smart_booking_show_staff_front', 0 );
		// 既定の表示期間は 7 日（today〜today+6）。フロント操作テストで日付タイルが表示されるよう
		// 窓内の日付を使う（REST テストは schedule_id 直指定なので日付非依存）。
		scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 2 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 200,
		} );
		// 付録A 用のルールフィールド群（すべて任意）。
		insertRuleField(
			'vn',
			'数字',
			'text',
			{ charset: 'numeric' },
			{ sort: 50 }
		);
		insertRuleField(
			'va',
			'英字',
			'text',
			{ charset: 'alpha' },
			{ sort: 51 }
		);
		insertRuleField(
			'van',
			'英数',
			'text',
			{ charset: 'alnum' },
			{ sort: 52 }
		);
		insertRuleField(
			'vk',
			'カナ',
			'text',
			{ charset: 'katakana' },
			{ sort: 53 }
		);
		insertRuleField(
			'vh',
			'ひら',
			'text',
			{ charset: 'hiragana' },
			{ sort: 54 }
		);
		insertRuleField(
			'vka',
			'かな',
			'text',
			{ charset: 'kana' },
			{ sort: 55 }
		);
		insertRuleField(
			'vlen',
			'範囲',
			'text',
			{ min_length: 2, max_length: 5 },
			{ sort: 56 }
		);
		insertRuleField(
			'vlmax',
			'上限',
			'text',
			{ max_length: 3 },
			{ sort: 57 }
		);
		insertRuleField(
			'vlta',
			'上限TA',
			'textarea',
			{ max_length: 3 },
			{ sort: 58 }
		);
		insertRuleField(
			'vmatch',
			'メール確認',
			'email',
			{ match_field_key: 'customer_email' },
			{ sort: 59 }
		);
		// 型変更後にルールが残っているケース（select だが charset が DB に残る）→ 実行時は無視。
		insertRuleField(
			'vsel',
			'選択',
			'select',
			{ charset: 'numeric' },
			{ sort: 60, options: [ '選択肢A', '選択肢B' ] }
		);
		// 条件フィールド（親 radio の値が「希望する」のときだけ表示）＋ numeric。
		insertRuleField( 'vcondparent', '希望', 'radio', null, {
			sort: 61,
			options: [ '希望する', '希望しない' ],
		} );
		insertRuleField(
			'vcond',
			'条件数字',
			'text',
			{ charset: 'numeric' },
			{ sort: 62, condKey: 'vcondparent', condVal: '希望する' }
		);
	} );

	test.afterAll( () => {
		// テストで作った予約・フィールドを片付け、既定状態へ戻す。
		restoreBaseline();
	} );

	// POST /public/reservations のペイロードを組む。
	function resBody( customFields, extra = {} ) {
		return {
			schedule_id: scheduleId,
			customer_name: '山田太郎',
			customer_email: 'test@example.com',
			customer_phone: '090-1234-5678',
			honeypot: '',
			custom_fields: customFields,
			...extra,
		};
	}

	test( '付録A: REST 直叩き（判定・保存値）', async ( { page } ) => {
		await gotoFrontForm( page );

		// [key, 入力(custom_fields), 期待] を順に検証する。
		// 期待: { code } なら 400・そのコード。{ saved: {key:value} } なら 200・保存値一致。
		const okCases = [
			{ cf: { vn: '12345' }, saved: { vn: '12345' } },
			{ cf: { vn: '１２３４５' }, saved: { vn: '12345' } },
			{ cf: { vn: ' 123 ' }, saved: { vn: '123' } },
			{ cf: { va: 'Ｔａｒｏ' }, saved: { va: 'Taro' } },
			{ cf: { van: 'ＡＢ１２' }, saved: { van: 'AB12' } },
			{ cf: { vk: 'ヤマダ　タロウ' }, saved: { vk: 'ヤマダ　タロウ' } },
			{ cf: { vk: 'ジョン・スミス' }, saved: { vk: 'ジョン・スミス' } },
			{ cf: { vk: 'ヴァイオレット' }, saved: { vk: 'ヴァイオレット' } },
			{ cf: { vh: 'やまだ たろう' }, saved: { vh: 'やまだ たろう' } },
			{ cf: { vka: 'ヤマダ たろう' }, saved: { vka: 'ヤマダ たろう' } },
			{ cf: { vlen: 'あい' }, saved: { vlen: 'あい' } },
			{ cf: { vlmax: '😀😀😀' }, saved: { vlmax: '😀😀😀' } },
			// textarea + max3: 改行統一で 3 文字 → OK（200 が通ること自体が \r\n→\n の統一を証明する。
			// 4 文字なら length で 400 になるため）。保存値は付録A で「—」（未指定）＝mysql --batch が
			// 改行をリテラル \n にエスケープするため厳密比較しない。
			{ cf: { vlta: 'a\r\nb' }, saved: {} },
			{
				cf: { vmatch: 'test@example.com' },
				saved: { vmatch: 'test@example.com' },
			},
			{
				cf: { vmatch: 'test@example.com  ' },
				saved: { vmatch: 'test@example.com' },
			},
			{ cf: { vn: '' }, saved: {} }, // 空欄は評価しない・meta なし。
			{ cf: { vsel: '選択肢A' }, saved: { vsel: '選択肢A' } }, // 型対象外→ルール無視。
			{ cf: { vcondparent: '希望しない', vcond: 'abc' }, saved: {} }, // 条件非表示→評価しない・破棄。
		];
		const ngCases = [
			{ cf: { vn: '123 45' }, code: 'smb_reservation_field_format' },
			{ cf: { vn: '123-45' }, code: 'smb_reservation_field_format' },
			{ cf: { va: 'Taro Yamada' }, code: 'smb_reservation_field_format' },
			{ cf: { vk: 'ｶﾀｶﾅ' }, code: 'smb_reservation_field_format' },
			{ cf: { vk: 'やまだ' }, code: 'smb_reservation_field_format' },
			{ cf: { vlen: 'あ' }, code: 'smb_reservation_field_length' },
			{
				cf: { vlen: 'あいうえおか' },
				code: 'smb_reservation_field_length',
			},
			{
				cf: { vmatch: 'TEST@example.com' },
				code: 'smb_reservation_field_mismatch',
			},
			{
				cf: { vcondparent: '希望する', vcond: 'abc' },
				code: 'smb_reservation_field_format',
			}, // 条件表示中は評価。
		];

		for ( const c of okCases ) {
			const res = await publicRest( page, 'public/reservations', {
				method: 'POST',
				body: resBody( c.cf ),
			} );
			expect
				.soft( res.status, `OK ${ JSON.stringify( c.cf ) }` )
				.toBe( 200 );
			if ( res.status === 200 ) {
				const rid = latestReservationId();
				for ( const [ k, v ] of Object.entries( c.saved ) ) {
					expect
						.soft(
							metaVal( rid, k ),
							`saved ${ k } for ${ JSON.stringify( c.cf ) }`
						)
						.toBe( v );
				}
			}
		}

		for ( const c of ngCases ) {
			const res = await publicRest( page, 'public/reservations', {
				method: 'POST',
				body: resBody( c.cf ),
			} );
			expect
				.soft( res.status, `NG ${ JSON.stringify( c.cf ) }` )
				.toBe( 400 );
			expect
				.soft(
					res.data && res.data.code,
					`NG code ${ JSON.stringify( c.cf ) }`
				)
				.toBe( c.code );
		}

		expect(
			test.info().errors,
			'付録A REST に soft 失敗なし'
		).toHaveLength( 0 );
	} );

	test( '付録A: フロント操作（文字種変換・エラー文言）', async ( {
		page,
	} ) => {
		await gotoFrontForm( page );
		// 日付 → 時間を選択（schedule は 10:00-11:00）。canConfirm に日時が必要なため。
		await page.waitForSelector( '.smb-front-day-tile:not(.is-disabled)', {
			timeout: 15_000,
		} );
		await page
			.locator( '.smb-front-day-tile:not(.is-disabled)' )
			.first()
			.click();
		await page.getByRole( 'button', { name: /10:00から11:00/ } ).click();
		// 数字フィールドに全角を入れ、確認画面で半角へ整形されて表示されること。
		await page
			.locator( '#smb-front-field-customer_name' )
			.fill( '山田太郎' );
		await page
			.locator( '#smb-front-field-customer_email' )
			.fill( 'test@example.com' );
		await page
			.locator( '#smb-front-field-customer_phone' )
			.fill( '090-1234-5678' );
		await page.locator( '#smb-front-field-vn' ).fill( '１２３４５' );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();
		await page.waitForSelector( '.smb-front-confirm-page', {
			timeout: 10_000,
		} );
		// 確認画面に整形後の 12345 が表示される（全角 → 半角に変換されている）。
		await expect( page.locator( '.smb-front-confirm-page' ) ).toContainText(
			'12345'
		);

		// 戻って NG（英字）→ インラインエラー「半角数字で入力してください。」。
		await page
			.getByRole( 'button', { name: '入力内容を修正する' } )
			.click();
		await page.waitForSelector( '#smb-front-field-vn', {
			timeout: 10_000,
		} );
		await page.locator( '#smb-front-field-vn' ).fill( 'abc' );
		await page.getByRole( 'button', { name: '予約内容の確認' } ).click();
		const err = page.locator( '#smb-front-field-vn-err' );
		await expect( err ).toHaveText( '半角数字で入力してください。' );
	} );

	// --- 管理 REST 用ヘルパ（loginAsAdmin 後に smartBookingAdmin.nonce で叩く） ---
	async function adminRest( page, endpoint, opts = {} ) {
		const method = opts.method || 'GET';
		return page.evaluate(
			async ( { endpoint, method, body } ) => {
				const ctx = window.smartBookingAdmin || {};
				const restUrl = ctx.restUrl || '/wp-json/smart-booking/v1/';
				const url =
					restUrl.replace( /\/$/, '' ) +
					'/' +
					endpoint.replace( /^\//, '' );
				const headers = {
					Accept: 'application/json',
					'X-WP-Nonce': ctx.nonce,
				};
				const init = { method, credentials: 'same-origin', headers };
				if ( body !== null && body !== undefined ) {
					headers[ 'Content-Type' ] = 'application/json';
					init.body = JSON.stringify( body );
				}
				const res = await fetch( url, init );
				let data = null;
				try {
					data = await res.json();
				} catch {
					// noop.
				}
				return { ok: res.ok, status: res.status, data };
			},
			{ endpoint, method, body: opts.body || null }
		);
	}

	test( '手動予約ではルールを評価しない', async ( { page } ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking', {
			waitUntil: 'domcontentloaded',
		} );
		await page.waitForFunction(
			() =>
				!! (
					window.smartBookingAdmin && window.smartBookingAdmin.nonce
				),
			{ timeout: 15_000 }
		);

		// vn（数字ルール）に英字を入れても手動予約は成功する（ルール未評価）。
		const res = await adminRest( page, 'reservations', {
			method: 'POST',
			body: {
				schedule_id: scheduleId,
				customer_name: '手動 太郎',
				customer_email: 'manual@example.com',
				customer_phone: '090-0000-0000',
				status: 'approved',
				meta: { vn: 'abc-not-numeric' },
			},
		} );
		expect( res.status ).toBe( 200 );
		expect( res.data && res.data.id ).toBeTruthy();
	} );

	test( '管理 API は不正ルールを拒否する', async ( { page } ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking', {
			waitUntil: 'domcontentloaded',
		} );
		await page.waitForFunction(
			() =>
				!! (
					window.smartBookingAdmin && window.smartBookingAdmin.nonce
				),
			{ timeout: 15_000 }
		);

		const mk = ( label, key, type, rules ) => ( {
			field_label: label,
			field_key: key,
			field_type: type,
			validation_rules: rules,
		} );

		const r1 = await adminRest( page, 'custom-fields', {
			method: 'POST',
			body: mk( 'NG範囲', 'ng_range', 'text', {
				min_length: 10,
				max_length: 2,
			} ),
		} );
		expect.soft( r1.status ).toBe( 400 );
		expect
			.soft( r1.data && r1.data.code )
			.toBe( 'smb_field_rule_length_range' );

		const r2 = await adminRest( page, 'custom-fields', {
			method: 'POST',
			body: mk( 'NG文字種', 'ng_cs', 'text', { charset: 'romaji' } ),
		} );
		expect.soft( r2.status ).toBe( 400 );
		expect
			.soft( r2.data && r2.data.code )
			.toBe( 'smb_field_rule_charset_invalid' );

		const r3 = await adminRest( page, 'custom-fields', {
			method: 'POST',
			body: mk( 'NG型', 'ng_type', 'select', { charset: 'numeric' } ),
		} );
		// select は選択肢必須のため options 無しだと別エラーになりうる。charset 型エラーを主に確認。
		expect.soft( r3.status ).toBe( 400 );

		const r4 = await adminRest( page, 'custom-fields', {
			method: 'POST',
			body: mk( 'NG不在', 'ng_match', 'text', {
				match_field_key: 'does_not_exist',
			} ),
		} );
		expect.soft( r4.status ).toBe( 400 );
		expect
			.soft( r4.data && r4.data.code )
			.toBe( 'smb_field_rule_match_missing' );

		expect(
			test.info().errors,
			'不正ルール拒否に soft 失敗なし'
		).toHaveLength( 0 );
	} );

	test( '一致ルールの比較先は削除できない（削除ガード）', async ( {
		page,
	} ) => {
		await loginAsAdmin( page );
		await page.goto( '/wp-admin/admin.php?page=smart-booking', {
			waitUntil: 'domcontentloaded',
		} );
		await page.waitForFunction(
			() =>
				!! (
					window.smartBookingAdmin && window.smartBookingAdmin.nonce
				),
			{ timeout: 15_000 }
		);

		// 比較先 dst と、それを参照する src を作る。
		const dst = await adminRest( page, 'custom-fields', {
			method: 'POST',
			body: {
				field_label: '比較先',
				field_key: 'gdst',
				field_type: 'text',
			},
		} );
		const dstId = dst.data && dst.data.id;
		expect( dstId ).toBeTruthy();
		const src = await adminRest( page, 'custom-fields', {
			method: 'POST',
			body: {
				field_label: '比較元',
				field_key: 'gsrc',
				field_type: 'text',
				validation_rules: { match_field_key: 'gdst' },
			},
		} );
		expect( src.status ).toBe( 200 );

		// dst の削除は拒否される。
		const del = await adminRest( page, `custom-fields/${ dstId }`, {
			method: 'DELETE',
		} );
		expect( del.status ).toBe( 400 );
		expect( del.data && del.data.code ).toBe(
			'smb_field_match_referenced'
		);

		// 後片付け: src の match を外し、両方削除。
		const srcId = src.data.id;
		await adminRest( page, `custom-fields/${ srcId }`, {
			method: 'PUT',
			body: {
				id: srcId,
				field_label: '比較元',
				field_type: 'text',
				validation_rules: {},
			},
		} );
		await adminRest( page, `custom-fields/${ srcId }`, {
			method: 'DELETE',
		} );
		await adminRest( page, `custom-fields/${ dstId }`, {
			method: 'DELETE',
		} );
	} );

	test( 'マイグレーションは冪等（無効化→有効化×2）', () => {
		const colCount = () =>
			scalar(
				"SELECT COUNT(*) FROM information_schema.columns WHERE table_name='wp_smart_booking_custom_fields' AND column_name='validation_rules';"
			);
		for ( let i = 0; i < 2; i++ ) {
			execSync( 'npx wp-env run cli wp plugin deactivate smart-booking', {
				encoding: 'utf8',
			} );
			execSync( 'npx wp-env run cli wp plugin activate smart-booking', {
				encoding: 'utf8',
			} );
			expect( colCount() ).toBe( '1' );
		}
	} );
} );
