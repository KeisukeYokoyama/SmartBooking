/**
 * Smart Booking フロント予約フォームの状態管理。
 *
 * ステップ制の予約フォームに必要な最小限の state を useReducer で保持する。
 *
 * ステップ一覧:
 *   'loading'  — 初期データ取得中
 *   'error'    — 初期データ取得失敗
 *   'store'    — 店舗選択
 *   'staff'    — 担当者選択
 *   'date'     — 日付選択 (Gen-B)
 *   'time'     — 時間選択 (Gen-B)
 *   'form'     — フォーム入力 (Gen-C)
 *   'confirm'  — 確認画面 (Gen-C)
 *   'done'     — 完了画面 (Gen-C)
 *
 * 表示順序（flow_order）:
 *   'A' (default): store → staff → date → time → form → confirm → done
 *   'B'          : store → staff → form → date → time → confirm → done
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

	// 選択値。
	storeId: null,
	staffId: null,
	date: null,
	time: null,
	scheduleId: null,
	formValues: {},
};

/**
 * flow_order を反映したステップの順序。
 *
 * @param {string} flowOrder
 * @returns {string[]}
 */
export function getStepOrder(flowOrder) {
	if (flowOrder === 'B') {
		return ['store', 'staff', 'form', 'date', 'time', 'confirm', 'done'];
	}
	return ['store', 'staff', 'date', 'time', 'form', 'confirm', 'done'];
}

/**
 * スキップルールを適用して「最初に表示するステップ」を決定する。
 *
 * @param {object} params
 * @param {number} params.storeCount
 * @param {number} params.staffCountForResolvedStore
 * @param {number} params.fixedStoreId  ショートコードで指定された店舗 ID
 * @param {string} params.flowOrder
 * @returns {{ step: string, storeId: number|null, staffId: number|null }}
 */
export function resolveInitialStep({
	storeCount,
	staffCountForResolvedStore,
	fixedStoreId,
	flowOrder,
	stores,
	staff,
}) {
	let storeId = null;
	let staffId = null;
	let step = 'store';

	// ショートコード属性で店舗固定の場合、store ステップをスキップ。
	if (fixedStoreId > 0) {
		storeId = fixedStoreId;
		step = 'staff';
	} else if (storeCount === 1) {
		storeId = stores[0].id;
		step = 'staff';
	} else {
		return { step: 'store', storeId: null, staffId: null };
	}

	// 担当者が 1 人なら staff ステップをスキップ。
	if (staffCountForResolvedStore === 1) {
		const single = staff.find((s) => s.store_id === storeId) || staff[0];
		if (single) {
			staffId = single.id;
			// flow_order を考慮して次のステップを決定する。
			const order = getStepOrder(flowOrder);
			const idx = order.indexOf('staff');
			step = order[idx + 1] || 'date';
		}
	}

	return { step, storeId, staffId };
}

/**
 * reducer。
 *
 * @param {object} state
 * @param {{type: string, payload?: any}} action
 */
export function reducer(state, action) {
	switch (action.type) {
		case 'INIT_START':
			return { ...state, loading: true, error: null, step: 'loading' };

		case 'INIT_SUCCESS': {
			const { settings, stores, staff, customFields, fixedStoreId } = action.payload;
			const activeStores = stores;
			const activeStaff = staff;

			// 予約可能な店舗が 0 件（ショートコード指定店舗が無効な場合含む）。
			if (activeStores.length === 0) {
				return {
					...state,
					loading: false,
					error: '現在、予約可能な店舗がありません。',
					step: 'error',
					settings,
					stores: activeStores,
					staff: activeStaff,
					customFields,
					fixedStoreId,
				};
			}

			if (fixedStoreId > 0 && !activeStores.some((s) => s.id === fixedStoreId)) {
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
				};
			}

			const resolvedStoreId = fixedStoreId > 0 ? fixedStoreId : activeStores[0].id;
			const staffForResolved = activeStaff.filter((s) => s.store_id === resolvedStoreId);
			const staffCountForResolved = staffForResolved.length;

			const { step, storeId, staffId } = resolveInitialStep({
				storeCount: activeStores.length,
				staffCountForResolvedStore: staffCountForResolved,
				fixedStoreId,
				flowOrder: settings.flow_order,
				stores: activeStores,
				staff: staffForResolved,
			});

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
			const staffForStore = state.staff.filter((s) => s.store_id === storeId);
			// 担当者が 1 人なら staff をスキップ。
			if (staffForStore.length === 1) {
				const order = getStepOrder(state.settings.flow_order);
				const idx = order.indexOf('staff');
				return {
					...state,
					storeId,
					staffId: staffForStore[0].id,
					step: order[idx + 1] || 'date',
				};
			}
			if (staffForStore.length === 0) {
				return {
					...state,
					storeId,
					staffId: null,
					step: 'error',
					error: 'この店舗には予約可能な担当者がいません。',
				};
			}
			return { ...state, storeId, staffId: null, step: 'staff' };
		}

		case 'SET_STAFF': {
			const order = getStepOrder(state.settings.flow_order);
			const idx = order.indexOf('staff');
			return {
				...state,
				staffId: action.payload,
				step: order[idx + 1] || 'date',
			};
		}

		case 'SET_DATE':
			return {
				...state,
				date: action.payload.date,
				scheduleId: action.payload.scheduleId || null,
				time: null,
			};

		case 'SET_TIME':
			return { ...state, time: action.payload };

		case 'SET_FORM_VALUES':
			return { ...state, formValues: { ...state.formValues, ...action.payload } };

		case 'GO_TO_STEP':
			return { ...state, step: action.payload };

		case 'GO_BACK': {
			const order = getStepOrder(state.settings ? state.settings.flow_order : 'A');
			const idx = order.indexOf(state.step);
			if (idx <= 0) return state;
			let prev = order[idx - 1];
			// スキップされる step を飛ばす。
			if (prev === 'store' && (state.fixedStoreId > 0 || state.stores.length <= 1)) {
				prev = order[idx - 2] || state.step;
			}
			if (prev === 'staff') {
				const staffForStore = state.staff.filter((s) => s.store_id === state.storeId);
				if (staffForStore.length <= 1) {
					prev = order[idx - 2] || state.step;
				}
			}
			return { ...state, step: prev };
		}

		case 'RESET':
			return { ...INITIAL_STATE, step: 'loading' };

		default:
			return state;
	}
}
