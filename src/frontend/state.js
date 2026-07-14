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
 *
 * 店舗・担当者ステップの表示制御:
 *   show_store_front / show_staff_front の手動 ON/OFF トグルで制御する。
 *   - ON  → ステップを表示する（店舗 1 つ／担当者 1 人でも自動スキップしない）
 *   - OFF → ステップをスキップし、デフォルト店舗・デフォルト担当者を自動選択する
 *   ショートコード `[smart_booking store_id="X"]` で固定された場合は
 *   トグルに関わらず店舗ステップをスキップする。
 *   ユーザー作成 (is_system=0) の店舗・担当者がそもそも存在しない場合は
 *   表示するものが無いためスキップし、storeId/staffId=0 でサーバ側自動振り分けに委ねる。
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
 * settings から店舗・担当者の表示フラグを取り出す。
 * 設定が無い／未定義の場合は OFF（false）として扱う。
 *
 * @param {Object|null} settings
 * @return {{ showStore: boolean, showStaff: boolean }}
 */
function readVisibilityFlags( settings ) {
	if ( ! settings ) {
		return { showStore: false, showStaff: false };
	}
	return {
		showStore: settings.show_store_front === true,
		showStaff: settings.show_staff_front === true,
	};
}

/**
 * スキップルールを適用して「最初に表示するステップ」を決定する。
 *
 * 店舗ステップ:
 *   1. fixedStoreId > 0 → 固定店舗を選択しスキップ
 *   2. hasUserStores=false → 店舗が無いのでスキップ（システム店舗運用）
 *   3. showStoreFront=true && stores.length > 0 → ステップを表示
 *   4. それ以外（OFF または 店舗 0 件） → 自動選択してスキップ
 *
 * 担当者ステップ:
 *   1. hasUserStaff=false → 担当者が無いのでスキップ（システム担当者運用）
 *   2. showStaffFront=true && 該当店舗に担当者あり → ステップを表示
 *   3. それ以外（OFF または 担当者 0 件） → 自動選択してスキップ
 *
 * @param {Object}   params
 * @param {number}   params.fixedStoreId         ショートコードで指定された店舗 ID
 * @param {string}   params.flowOrder
 * @param {Object[]} params.stores               有効な店舗リスト（is_system=0）
 * @param {Object[]} params.staff                担当者リスト（is_system=0）
 * @param {boolean}  [params.hasUserStores=true]
 * @param {boolean}  [params.hasUserStaff=true]
 * @param {boolean}  [params.showStoreFront=false]
 * @param {boolean}  [params.showStaffFront=false]
 * @return {{ step: string, storeId: number|null, staffId: number|null }} 初期ステップ情報
 */
export function resolveInitialStep( {
	fixedStoreId,
	flowOrder,
	stores,
	staff,
	hasUserStores = true,
	hasUserStaff = true,
	showStoreFront = false,
	showStaffFront = false,
} ) {
	let storeId = null;
	let staffId = null;
	let step = 'store';

	// 店舗ステップの解決。
	if ( fixedStoreId > 0 ) {
		storeId = fixedStoreId;
		step = 'staff';
	} else if ( ! hasUserStores ) {
		storeId = 0;
		step = 'staff';
	} else if ( showStoreFront && stores.length > 0 ) {
		// 店舗選択ステップを表示（1 件でもスキップしない）。
		return { step: 'store', storeId: null, staffId: null };
	} else if ( stores.length > 0 ) {
		// OFF: sort_order 最小の店舗を自動選択。
		storeId = stores[ 0 ].id;
		step = 'staff';
	} else {
		// 店舗が 0 件かつ hasUserStores=true（理論上稀）→ システム運用扱い。
		storeId = 0;
		step = 'staff';
	}

	// 担当者ステップの解決。
	const staffForStore =
		storeId && storeId > 0
			? staff.filter( ( s ) => s.store_id === storeId )
			: staff;

	if ( ! hasUserStaff ) {
		staffId = 0;
		const order = getStepOrder( flowOrder );
		const idx = order.indexOf( 'staff' );
		step = order[ idx + 1 ] || 'main';
	} else if ( showStaffFront && staffForStore.length > 0 ) {
		// 担当者選択ステップを表示（1 人でもスキップしない）。
		// 店舗ステップが既に解決済みなのでこのまま 'staff' に進む。
		step = 'staff';
	} else {
		// OFF または 担当者 0 件 → staffId=0（未確定）のままサーバ側自動振り分けに委ねる。
		// availability も staff 統合（capacity 合算）で取得し、reservation 作成時に
		// サーバが sort_order 順に空き担当者を割り当てる。
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
 *   - 'store':  hasUserStores=false / fixedStoreId > 0 / showStoreFront=false ならスキップ
 *   - 'staff':  hasUserStaff=false / showStaffFront=false / 該当店舗の担当者 0 人 ならスキップ
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

	const hasUserStores = state.hasUserStores !== false;
	const hasUserStaff = state.hasUserStaff !== false;
	const { showStore, showStaff } = readVisibilityFlags( state.settings );

	for ( let i = idx - 1; i >= 0; i-- ) {
		const s = order[ i ];
		if ( s === 'store' ) {
			if (
				! hasUserStores ||
				state.fixedStoreId > 0 ||
				! showStore ||
				( state.stores || [] ).length === 0
			) {
				continue;
			}
			return true;
		}
		if ( s === 'staff' ) {
			if ( ! hasUserStaff || ! showStaff ) {
				continue;
			}
			const staffForStore = ( state.staff || [] ).filter(
				( x ) => x.store_id === state.storeId
			);
			if ( staffForStore.length === 0 ) {
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
			if (
				fixedStoreId > 0 &&
				! activeStores.some( ( s ) => s.id === fixedStoreId )
			) {
				const storeLabel =
					( settings && settings.store_label ) || '店舗';
				return {
					...state,
					loading: false,
					error: `指定された${ storeLabel }は現在予約を受け付けていません。`,
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

			const { showStore, showStaff } = readVisibilityFlags( settings );

			const { step, storeId, staffId } = resolveInitialStep( {
				fixedStoreId,
				flowOrder: settings.flow_order,
				stores: activeStores,
				staff: activeStaff,
				hasUserStores,
				hasUserStaff,
				showStoreFront: showStore,
				showStaffFront: showStaff,
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
			const hasUserStaff = state.hasUserStaff !== false;
			const { showStaff } = readVisibilityFlags( state.settings );
			const order = getStepOrder( state.settings.flow_order );
			const idx = order.indexOf( 'staff' );
			const stepAfterStaff = order[ idx + 1 ] || 'main';

			// システム担当者運用: 担当者ステップ完全スキップ。
			if ( ! hasUserStaff ) {
				return {
					...state,
					storeId,
					staffId: 0,
					step: stepAfterStaff,
				};
			}

			// 担当者選択 ON かつ該当店舗に担当者がいる → 担当者ステップ表示。
			if ( showStaff && staffForStore.length > 0 ) {
				return { ...state, storeId, staffId: null, step: 'staff' };
			}

			// 担当者選択 OFF または 該当店舗の担当者 0 件 → staffId=0 のままスキップし、
			// サーバ側で capacity 合算 + 自動割当 にゆだねる。
			return {
				...state,
				storeId,
				staffId: 0,
				step: stepAfterStaff,
			};
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
			const hasUserStores = state.hasUserStores !== false;
			const hasUserStaff = state.hasUserStaff !== false;
			const { showStore, showStaff } = readVisibilityFlags( state.settings );

			let target = idx - 1;
			while ( target >= 0 ) {
				const candidate = order[ target ];
				if ( candidate === 'store' ) {
					if (
						! hasUserStores ||
						state.fixedStoreId > 0 ||
						! showStore ||
						state.stores.length === 0
					) {
						target -= 1;
						continue;
					}
				}
				if ( candidate === 'staff' ) {
					if ( ! hasUserStaff || ! showStaff ) {
						target -= 1;
						continue;
					}
					const staffForStore = state.staff.filter(
						( s ) => s.store_id === state.storeId
					);
					if ( staffForStore.length === 0 ) {
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
