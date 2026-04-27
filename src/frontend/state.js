/**
 * Smart Booking フロント予約フォームの状態管理。
 *
 * ステップ制の予約フォームに必要な最小限の state を useReducer で保持する。
 *
 * ステップ一覧 (Gen-A 以降):
 *   'loading'  — 初期データ取得中
 *   'error'    — 初期データ取得失敗
 *   'store'    — 店舗選択
 *   'staff'    — 担当者選択
 *   'main'     — メイン入力 (日付 + 時間 + フォームを 1 画面に統合)
 *   'confirm'  — 確認画面
 *   'done'     — 完了画面
 *
 * 後方互換のため 'date' / 'time' / 'form' が GO_TO_STEP 等で渡された場合は
 * 'main' に書き換える（time/scheduleId は date 指定時のみクリア）。
 *
 * 表示順序（flow_order）:
 *   'A' (default): store → staff → main(日付→フォーム) → confirm → done
 *   'B'          : store → staff → main(フォーム→日付) → confirm → done
 *   ※ flow_order の差は MainInputPage 内のセクション順序で吸収する。
 */

export const INITIAL_STATE = {
	// UI.
	step: 'loading',
	loading: true,
	error: null,

	// 初期取得データ。
	settings: null,
	stores: [],
	staff: [],
	customFields: [],

	// ショートコード属性で指定された固定店舗 (0 なら未指定)。
	fixedStoreId: 0,

	// システムエンティティ方式: ユーザー作成 (is_system=0) かつ is_active=1 のレコードの有無。
	// ショートコード localize 経由で App.jsx から INIT_SUCCESS payload に詰められる。
	// false の場合、対応するステップは完全スキップし storeId/staffId=0 でサーバ側自動振り分けに委ねる。
	hasUserStores: true,
	hasUserStaff: true,

	// 選択値。
	storeId: null,
	staffId: null,
	date: null,
	time: null,
	scheduleId: null,
	formValues: {},

	// 取得済みスケジュール + 空き状況。
	schedules: [],
	availabilityLoading: false,
	availabilityError: null,
	availabilityRange: null, // { dateFrom, dateTo, storeId, staffId }

	// 予約送信の UI ステート (Gen-C)。
	submitting: false,
	submitError: null,
	submitErrorStatus: null, // 直近の送信失敗の HTTP status (例: 409)。導線出し分けに使用。
	completedReservation: null, // { id, schedule_date, schedule_time, store_name, staff_name } | null
};

/**
 * flow_order を反映したステップの順序。
 *
 * Gen-A 以降は date/time/form を 'main' に統合したため A/B の差は
 * MainInputPage 内のセクション順序で吸収し、ステップ順は同一になる。
 *
 * @param {string} _flowOrder 'A' または 'B'（参考のため受け取るが結果は同じ）
 * @return {string[]} ステップ名の配列
 */
// eslint-disable-next-line no-unused-vars
export function getStepOrder( _flowOrder ) {
	return [ 'store', 'staff', 'main', 'confirm', 'done' ];
}

/**
 * スキップルールを適用して「最初に表示するステップ」を決定する。
 *
 * システムエンティティ方式:
 *   ユーザーが店舗・担当者を 1 つも作成していない場合（hasUserStores=false など）、
 *   API は空配列を返すが裏側にシステムエンティティが存在する。
 *   この場合は storeId / staffId を 0（未確定）のまま該当ステップを完全スキップし、
 *   サーバ側でシステムエンティティへ自動振り分けされる前提で進める。
 *
 * @param {Object}   params
 * @param {number}   params.storeCount
 * @param {number}   params.staffCountForResolvedStore
 * @param {number}   params.fixedStoreId               ショートコードで指定された店舗 ID
 * @param {string}   params.flowOrder
 * @param {Object[]} params.stores                     有効な店舗リスト
 * @param {Object[]} params.staff                      担当者リスト
 * @param {boolean}  [params.showStoreFront=true]      フロントで店舗選択を表示するか
 * @param {boolean}  [params.showStaffFront=true]      フロントで担当者選択を表示するか
 * @param {boolean}  [params.hasUserStores=true]       ユーザー作成 (is_system=0) の有効店舗が存在するか
 * @param {boolean}  [params.hasUserStaff=true]        ユーザー作成 (is_system=0) の有効担当者が存在するか
 * @return {{ step: string, storeId: number|null, staffId: number|null }} 初期ステップ情報
 */
export function resolveInitialStep( {
	storeCount,
	staffCountForResolvedStore,
	fixedStoreId,
	flowOrder,
	stores,
	staff,
	showStoreFront = true,
	showStaffFront = true,
	hasUserStores = true,
	hasUserStaff = true,
} ) {
	let storeId = null;
	let staffId = null;
	let step = 'store';

	// 店舗ステップのスキップ判定:
	//   0. ユーザー店舗が無い（システム店舗で運用） → storeId=0 のまま完全スキップ
	//   1. ショートコードで店舗固定 → 固定店舗を選択
	//   2. 有効な店舗が 1 つだけ → 自動選択
	//   3. show_store_front=false → ショートコード指定があればその店舗、なければ stores[0]
	//      （stores は呼び出し元で sort_order ASC 済みである前提）
	if ( ! hasUserStores ) {
		storeId = 0;
		step = 'staff';
	} else if ( fixedStoreId > 0 ) {
		storeId = fixedStoreId;
		step = 'staff';
	} else if ( storeCount === 1 ) {
		storeId = stores[ 0 ].id;
		step = 'staff';
	} else if ( showStoreFront === false && stores.length > 0 ) {
		storeId = stores[ 0 ].id;
		step = 'staff';
	} else {
		return { step: 'store', storeId: null, staffId: null };
	}

	// 担当者ステップのスキップ判定:
	//   0. ユーザー担当者が無い（システム担当者で運用） → staffId=0 のまま完全スキップ
	//   1. 担当者が 1 人だけ → 自動選択
	//   2. show_staff_front=false → サーバ側で自動振り分けに任せ、staffId は 0（未確定）のまま
	//      `/public/availability` へのリクエストでは staff_id を送らず、サーバが統合スケジュールを返す。
	if ( ! hasUserStaff ) {
		staffId = 0;
		const order = getStepOrder( flowOrder );
		const idx = order.indexOf( 'staff' );
		step = order[ idx + 1 ] || 'main';
	} else if ( staffCountForResolvedStore === 1 ) {
		const single =
			staff.find( ( s ) => s.store_id === storeId ) || staff[ 0 ];
		if ( single ) {
			staffId = single.id;
			// flow_order を考慮して次のステップを決定する。
			const order = getStepOrder( flowOrder );
			const idx = order.indexOf( 'staff' );
			step = order[ idx + 1 ] || 'main';
		}
	} else if ( showStaffFront === false ) {
		// staffId は 0（= 未確定 / サーバ側で自動振り分け）。
		staffId = 0;
		const order = getStepOrder( flowOrder );
		const idx = order.indexOf( 'staff' );
		step = order[ idx + 1 ] || 'main';
	}

	return { step, storeId, staffId };
}

/**
 * 現在ステップから戻れる先のステップが存在するかどうかを判定する。
 *
 * Gen-A 以降は 'main' ステップに date/time/form が統合されたため、
 * 'main' から戻る場合のみ store/staff のスキップ判定で「実際に表示されるステップ」を探す。
 *
 * スキップされる可能性のある step:
 *   - 'store':  hasUserStores=false / fixedStoreId > 0 / 有効店舗が 1 つ以下 / show_store_front=false ならスキップ
 *   - 'staff':  hasUserStaff=false / 当該 store_id に紐づく担当者が 1 人以下 / show_staff_front=false ならスキップ
 *
 * @param {Object} state 現在のフォーム状態
 * @return {boolean} 戻れるステップが存在すれば true
 */
export function canGoBack( state ) {
	if ( ! state || ! state.step ) {
		return false;
	}
	const order = getStepOrder(
		state.settings ? state.settings.flow_order : 'A'
	);
	const idx = order.indexOf( state.step );
	if ( idx <= 0 ) {
		return false;
	}

	const showStoreFront = state.settings
		? state.settings.show_store_front !== false
		: true;
	const showStaffFront = state.settings
		? state.settings.show_staff_front !== false
		: true;
	const hasUserStores = state.hasUserStores !== false;
	const hasUserStaff = state.hasUserStaff !== false;

	for ( let i = idx - 1; i >= 0; i-- ) {
		const s = order[ i ];
		if ( s === 'store' ) {
			if (
				! hasUserStores ||
				state.fixedStoreId > 0 ||
				( state.stores || [] ).length <= 1 ||
				! showStoreFront
			) {
				continue;
			}
			return true;
		}
		if ( s === 'staff' ) {
			if ( ! hasUserStaff || ! showStaffFront ) {
				continue;
			}
			const staffForStore = ( state.staff || [] ).filter(
				( x ) => x.store_id === state.storeId
			);
			if ( staffForStore.length <= 1 ) {
				continue;
			}
			return true;
		}
		// それ以外（main/confirm/done）はスキップしない。
		return true;
	}
	return false;
}

/**
 * reducer。
 *
 * @param {Object}                        state
 * @param {{type: string, payload?: any}} action
 */
export function reducer( state, action ) {
	switch ( action.type ) {
		case 'INIT_START':
			return { ...state, loading: true, error: null, step: 'loading' };

		case 'INIT_SUCCESS': {
			const {
				settings,
				stores,
				staff,
				customFields,
				fixedStoreId,
				hasUserStores = true,
				hasUserStaff = true,
			} = action.payload;
			const activeStores = stores;
			const activeStaff = staff;

			// ショートコードで店舗が固定されているのに、API から該当店舗が返ってこない場合のみエラー扱い。
			// ユーザー店舗が無い (hasUserStores=false) 場合はシステム店舗で運用するためエラーにしない。
			if (
				fixedStoreId > 0 &&
				! activeStores.some( ( s ) => s.id === fixedStoreId )
			) {
				return {
					...state,
					loading: false,
					error: '指定された店舗は現在予約を受け付けていません。',
					step: 'error',
					settings,
					stores: activeStores,
					staff: activeStaff,
					customFields,
					fixedStoreId,
					hasUserStores,
					hasUserStaff,
				};
			}

			// resolvedStoreId は staff のフィルタリング用（実際の予約には使わない）。
			// ユーザー店舗が無い場合は activeStores が空なので、resolvedStoreId は 0（= 全担当者対象）。
			const resolvedStoreId =
				fixedStoreId > 0
					? fixedStoreId
					: activeStores.length > 0
						? activeStores[ 0 ].id
						: 0;
			const staffForResolved = resolvedStoreId
				? activeStaff.filter( ( s ) => s.store_id === resolvedStoreId )
				: activeStaff;
			const staffCountForResolved = staffForResolved.length;

			// settings.show_store_front / show_staff_front は bool で来る（未定義時はデフォルト ON 扱い）。
			const showStoreFront =
				settings && settings.show_store_front !== false;
			const showStaffFront =
				settings && settings.show_staff_front !== false;

			const { step, storeId, staffId } = resolveInitialStep( {
				storeCount: activeStores.length,
				staffCountForResolvedStore: staffCountForResolved,
				fixedStoreId,
				flowOrder: settings.flow_order,
				stores: activeStores,
				staff: staffForResolved,
				showStoreFront,
				showStaffFront,
				hasUserStores,
				hasUserStaff,
			} );

			return {
				...state,
				loading: false,
				error: null,
				step,
				storeId,
				staffId,
				settings,
				stores: activeStores,
				staff: activeStaff,
				customFields,
				fixedStoreId,
				hasUserStores,
				hasUserStaff,
			};
		}

		case 'INIT_FAIL':
			return {
				...state,
				loading: false,
				error: action.payload || '初期化に失敗しました。',
				step: 'error',
			};

		case 'SET_STORE': {
			const storeId = action.payload;
			const staffForStore = state.staff.filter(
				( s ) => s.store_id === storeId
			);
			const showStaffFront = state.settings
				? state.settings.show_staff_front !== false
				: true;
			const hasUserStaff = state.hasUserStaff !== false;
			// ユーザー担当者が無い → システム担当者運用。担当者ステップ完全スキップ。
			if ( ! hasUserStaff ) {
				const order = getStepOrder( state.settings.flow_order );
				const idx = order.indexOf( 'staff' );
				return {
					...state,
					storeId,
					staffId: 0,
					step: order[ idx + 1 ] || 'main',
				};
			}
			// 担当者が 1 人なら staff をスキップ。
			if ( staffForStore.length === 1 ) {
				const order = getStepOrder( state.settings.flow_order );
				const idx = order.indexOf( 'staff' );
				return {
					...state,
					storeId,
					staffId: staffForStore[ 0 ].id,
					step: order[ idx + 1 ] || 'main',
				};
			}
			if ( staffForStore.length === 0 ) {
				return {
					...state,
					storeId,
					staffId: null,
					step: 'error',
					error: 'この店舗には予約可能な担当者がいません。',
				};
			}
			// show_staff_front=false の場合は担当者ステップをスキップして main へ。
			// staffId は 0（= サーバ側で自動振り分け）。availability 取得時も staff_id を送らない。
			if ( ! showStaffFront ) {
				const order = getStepOrder( state.settings.flow_order );
				const idx = order.indexOf( 'staff' );
				return {
					...state,
					storeId,
					staffId: 0,
					step: order[ idx + 1 ] || 'main',
				};
			}
			return { ...state, storeId, staffId: null, step: 'staff' };
		}

		case 'SET_STAFF': {
			const order = getStepOrder( state.settings.flow_order );
			const idx = order.indexOf( 'staff' );
			return {
				...state,
				staffId: action.payload,
				step: order[ idx + 1 ] || 'main',
			};
		}

		case 'SET_DATE': {
			// 日付が変わった場合は、選択済みの時間枠をリセットする。
			const newDate =
				action.payload && action.payload.date
					? action.payload.date
					: null;
			if ( newDate === state.date ) {
				return state;
			}
			return {
				...state,
				date: newDate,
				time: null,
				scheduleId: null,
			};
		}

		case 'SET_TIME': {
			// Gen-A 以降: 時間枠クリックでは time + scheduleId のみ更新し、ステップは触らない。
			// 同一画面 ('main') 内で日付・時間・フォームを並べているため、画面遷移は不要。
			const payload = action.payload || {};
			return {
				...state,
				time: payload.time || null,
				scheduleId: payload.scheduleId || null,
			};
		}

		case 'AVAILABILITY_START':
			return {
				...state,
				availabilityLoading: true,
				availabilityError: null,
			};

		case 'AVAILABILITY_SUCCESS': {
			const { schedules, dateFrom, dateTo, storeId, staffId } =
				action.payload || {};
			return {
				...state,
				schedules: Array.isArray( schedules ) ? schedules : [],
				availabilityLoading: false,
				availabilityError: null,
				availabilityRange: {
					dateFrom: dateFrom || null,
					dateTo: dateTo || null,
					storeId: storeId || null,
					staffId: staffId || null,
				},
			};
		}

		case 'AVAILABILITY_FAIL':
			return {
				...state,
				availabilityLoading: false,
				availabilityError:
					action.payload || 'スケジュールの取得に失敗しました。',
			};

		case 'SET_FORM_VALUES':
			return {
				...state,
				formValues: { ...state.formValues, ...action.payload },
			};

		case 'UPDATE_FORM_FIELD': {
			const { key, value } = action.payload || {};
			if ( ! key ) {
				return state;
			}
			return {
				...state,
				formValues: { ...state.formValues, [ key ]: value },
			};
		}

		case 'GO_TO_CONFIRM': {
			// Gen-A 以降: 'main' から常に 'confirm' へ。
			// 日付・時間・フォーム入力はすべて 'main' で揃えてある前提。
			return {
				...state,
				step: 'confirm',
				submitError: null,
				submitErrorStatus: null,
			};
		}

		case 'GO_BACK_FROM_CONFIRM':
			return {
				...state,
				step: 'main',
				submitError: null,
				submitErrorStatus: null,
			};

		case 'SUBMIT_START':
			return {
				...state,
				submitting: true,
				submitError: null,
				submitErrorStatus: null,
			};

		case 'SUBMIT_SUCCESS':
			return {
				...state,
				submitting: false,
				submitError: null,
				submitErrorStatus: null,
				completedReservation: action.payload || null,
				step: 'done',
			};

		case 'SUBMIT_FAIL': {
			// 後方互換: payload が文字列で来たら { message, status: null } として扱う。
			const payload = action.payload;
			let message;
			let status = null;
			if ( payload && typeof payload === 'object' ) {
				message = payload.message || '予約の送信に失敗しました。';
				status =
					payload.status !== null && payload.status !== undefined
						? payload.status
						: null;
			} else {
				message = payload || '予約の送信に失敗しました。';
			}
			return {
				...state,
				submitting: false,
				submitError: message,
				submitErrorStatus: status,
			};
		}

		case 'GO_TO_STEP': {
			const next = action.payload;
			// 後方互換: 旧版で使われていた 'date' / 'time' / 'form' は 'main' に書き換える。
			// 'date' 指定（例: ConfirmPage の 409 後の「日付を選び直す」）は time/scheduleId をクリアして main に戻す。
			if ( next === 'date' || next === 'time' ) {
				return {
					...state,
					step: 'main',
					time: null,
					scheduleId: null,
					submitError: null,
					submitErrorStatus: null,
				};
			}
			if ( next === 'form' ) {
				return { ...state, step: 'main' };
			}
			return { ...state, step: next };
		}

		case 'GO_BACK': {
			const order = getStepOrder(
				state.settings ? state.settings.flow_order : 'A'
			);
			const idx = order.indexOf( state.step );
			if ( idx <= 0 ) {
				return state;
			}
			const showStoreFront = state.settings
				? state.settings.show_store_front !== false
				: true;
			const showStaffFront = state.settings
				? state.settings.show_staff_front !== false
				: true;
			const hasUserStores = state.hasUserStores !== false;
			const hasUserStaff = state.hasUserStaff !== false;

			// idx より前で、スキップされない最初の step を探す。
			let target = idx - 1;
			while ( target >= 0 ) {
				const candidate = order[ target ];
				if ( candidate === 'store' ) {
					if (
						! hasUserStores ||
						state.fixedStoreId > 0 ||
						state.stores.length <= 1 ||
						! showStoreFront
					) {
						target -= 1;
						continue;
					}
				}
				if ( candidate === 'staff' ) {
					if ( ! hasUserStaff || ! showStaffFront ) {
						target -= 1;
						continue;
					}
					const staffForStore = state.staff.filter(
						( s ) => s.store_id === state.storeId
					);
					if ( staffForStore.length <= 1 ) {
						target -= 1;
						continue;
					}
				}
				return { ...state, step: candidate };
			}
			return state;
		}

		case 'RESET':
			return { ...INITIAL_STATE, step: 'loading' };

		default:
			return state;
	}
}
