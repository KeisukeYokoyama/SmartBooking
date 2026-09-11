/**
 * v0.5.5 H3: 予約詳細が「その予約が作られたフォーム」の入力項目を読むようにする。
 *
 * 起票: サイト側 `~/dev/smart-booking-website/docs/help-backlog.md` §H3
 * 計画: docs/plans/v0.5.5-release-plan.md §1
 *
 * 壊れ方（修正前）:
 *   `src/admin/pages/ReservationsPage.jsx` が `API.customFields.list()` を form_id 無しで呼ぶ。
 *   サーバは未指定を既定フォームへ解決する（includes/rest/class-rest-custom-fields.php）ため、
 *   **既定以外のフォームで追加した項目の回答が予約詳細ダイアログに出ない**。
 *   回答値そのものは保存されており CSV には出るので、「管理画面からだけ読めない」状態になる。
 *
 * 本 spec の検証点:
 *   (1) 既定以外のフォーム経由の予約の詳細に、そのフォームの項目のラベルと回答が出る
 *   (2) 既定フォーム経由の予約の詳細は従来どおり既定フォームの項目が出る（回帰）
 *   (3) フォームをまたいで項目が混ざらない（フォームBの項目が既定フォームの予約詳細に出ない）
 *
 * ⚠️ 手動予約作成モーダルは対象外。UI にフォーム選択が無く、サーバが常に既定フォームへ
 *    解決するため（includes/rest/class-rest-reservations.php の create_item）、
 *    既定フォームの項目を渡すのが正しい。
 *
 * 配布物外（検証専用）。
 */
const { test, expect } = require( '@playwright/test' );
const {
	restoreBaseline,
	insertSchedule,
	publicRest,
	gotoFrontForm,
	ymd,
	USER_STORE_ID,
	USER_STAFF_ID,
} = require( './phase3-helpers' );
const { bootstrapAdmin } = require( './phase2-helpers' );
const {
	dbq,
	resetForms,
	insertForm,
	getDefaultFormId,
	CF,
} = require( './v040-helpers' );

test.describe.configure( { mode: 'serial' } );

const FORM_B_NAME = '無料体験フォーム';
const B_KEY = 'taiken_memo';
const B_LABEL = '体験で試したいこと';
const B_ANSWER = 'マンツーマンの体験を希望します';
const DEFAULT_KEY = 'kikkake';
const DEFAULT_LABEL = 'ご相談のきっかけ';
const DEFAULT_ANSWER = '知人の紹介です';

/**
 * 指定フォームにカスタムフィールドを1件追加する。
 *
 * @param {number} formId
 * @param {string} key
 * @param {string} label
 * @param {number} sortOrder
 */
function addFieldToForm( formId, key, label, sortOrder ) {
	dbq(
		`INSERT INTO ${ CF } (form_id,field_key,field_label,field_type,field_options,placeholder,is_required,sort_order,condition_field_key,condition_value,created_at) ` +
			`VALUES (${ formId },'${ key }','${ label }','textarea','[]','',0,${ sortOrder },NULL,NULL,NOW());`
	);
}

/**
 * 公開 REST で予約を1件作る。form_id を明示できる。
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object}                          opts
 * @param {number}                          opts.formId
 * @param {number}                          opts.scheduleId
 * @param {string}                          opts.name
 * @param {Object}                          opts.customFields
 */
async function book( page, { formId, scheduleId, name, customFields } ) {
	const res = await publicRest( page, 'public/reservations', {
		method: 'POST',
		body: {
			form_id: formId,
			schedule_id: scheduleId,
			customer_name: name,
			customer_email: 'form@example.com',
			customer_phone: '09033334444',
			custom_fields: customFields,
			honeypot: '',
		},
	} );
	expect( res.status ).toBe( 200 );
	return res.data;
}

/**
 * 予約一覧から指定した予約者名の行の詳細モーダルを開く。
 *
 * @param {import('@playwright/test').Page} page
 * @param {string}                          customerName
 * @param {boolean}                         mobile       モバイルプロジェクトか（カード表示）.
 */
async function openDetail( page, customerName, mobile ) {
	// bootstrapAdmin は nonce の localize を待つだけで React の描画完了は待たないため、
	// 行が出る前にセレクタを評価しないよう、一覧と対象行の可視化を明示的に待つ。
	await page.waitForSelector( '.smb-page--reservations', {
		timeout: 15_000,
	} );
	const row = page
		.locator( '.smb-table__row, .smb-reservation-card' )
		.filter( { hasText: customerName } )
		.first();
	await expect( row ).toBeVisible( { timeout: 15_000 } );

	// デスクトップは行内の「詳細」ボタン、モバイル（375px）はカード全体クリックで開く。
	// モバイルには「詳細」ボタンが存在しない（ReservationsPage.jsx の isMobile 分岐）。
	// 分岐条件は phase2-reservations.spec.js と同じくプロジェクト名で判定する
	// （ボタンの有無を count() で見ると、描画前に 0 を引いて誤った経路に入る）。
	if ( mobile ) {
		await row.click();
	} else {
		await row.getByRole( 'button', { name: '詳細', exact: true } ).click();
	}
	await expect( page.locator( '.smb-modal' ) ).toBeVisible( {
		timeout: 10_000,
	} );
	return page.locator( '.smb-modal' );
}

let defaultFormId = 0;
let formBId = 0;

test.describe( 'v0.5.5 H3: 予約詳細がフォーム別の入力項目を読む', () => {
	test.setTimeout( 150_000 );

	test.beforeEach( async ( { page } ) => {
		restoreBaseline();
		resetForms();

		defaultFormId = getDefaultFormId();
		formBId = insertForm( FORM_B_NAME );

		// 既定フォームとフォームBに、それぞれ別の項目を1つずつ用意する。
		addFieldToForm( defaultFormId, DEFAULT_KEY, DEFAULT_LABEL, 50 );
		addFieldToForm( formBId, B_KEY, B_LABEL, 50 );

		const scheduleId = insertSchedule( {
			storeId: USER_STORE_ID,
			staffId: USER_STAFF_ID,
			date: ymd( 2 ),
			start: '10:00:00',
			end: '11:00:00',
			capacity: 10,
		} );

		await gotoFrontForm( page );
		await book( page, {
			formId: formBId,
			scheduleId,
			name: '体験 花子',
			customFields: { [ B_KEY ]: B_ANSWER },
		} );
		await book( page, {
			formId: defaultFormId,
			scheduleId,
			name: '相談 次郎',
			customFields: { [ DEFAULT_KEY ]: DEFAULT_ANSWER },
		} );
	} );

	test.afterAll( async () => {
		resetForms();
		restoreBaseline();
	} );

	test( '(1) 既定以外のフォーム経由の予約詳細に、そのフォームの項目と回答が出る', async ( {
		page,
	}, testInfo ) => {
		await bootstrapAdmin( page, 'reservations' );
		const modal = await openDetail(
			page,
			'体験 花子',
			testInfo.project.name === 'mobile'
		);

		await expect( modal ).toContainText( B_LABEL );
		await expect( modal ).toContainText( B_ANSWER );
	} );

	test( '(2) 既定フォーム経由の予約詳細は従来どおり既定フォームの項目が出る（回帰）', async ( {
		page,
	}, testInfo ) => {
		await bootstrapAdmin( page, 'reservations' );
		const modal = await openDetail(
			page,
			'相談 次郎',
			testInfo.project.name === 'mobile'
		);

		await expect( modal ).toContainText( DEFAULT_LABEL );
		await expect( modal ).toContainText( DEFAULT_ANSWER );
	} );

	test( '(3) フォームをまたいで項目が混ざらない', async ( {
		page,
	}, testInfo ) => {
		const mobile = testInfo.project.name === 'mobile';
		await bootstrapAdmin( page, 'reservations' );

		// 既定フォームの予約に、フォームBの項目は出ない。
		const defaultModal = await openDetail( page, '相談 次郎', mobile );
		await expect( defaultModal.getByText( B_LABEL ) ).toHaveCount( 0 );
		await defaultModal
			.getByRole( 'button', { name: '閉じる' } )
			.first()
			.click();
		await expect( page.locator( '.smb-modal' ) ).toHaveCount( 0 );

		// フォームBの予約に、既定フォームの項目は出ない。
		const bModal = await openDetail( page, '体験 花子', mobile );
		await expect( bModal.getByText( DEFAULT_LABEL ) ).toHaveCount( 0 );
	} );
} );
