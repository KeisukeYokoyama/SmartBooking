/**
 * Smart Booking フロント予約フォーム ルートコンポーネント。
 *
 * 状態機構:
 *   マウント時に `/public/stores`, `/public/staff`, `/public/settings`, `/public/custom-fields` を
 *   並列取得し、スキップルールを適用して初期ステップを決定する。
 *
 * ステップ (Gen-A 以降):
 *   - store:   StoreSelect (別画面)
 *   - staff:   StaffSelect (別画面)
 *   - main:    MainInputPage (日付 + 時間 + フォーム入力を 1 画面に統合)
 *   - confirm: ConfirmPage (別画面)
 *   - done:    DonePage (別画面)
 *
 * 表示順序（flow_order）は MainInputPage 内のセクション順序で吸収する。
 */
import { useEffect, useReducer } from 'react';
import { publicAPI } from './api';
import ErrorMessage from './components/ErrorMessage';
import Spinner from './components/Spinner';
import { canGoBack, INITIAL_STATE, reducer } from './state';
import ConfirmPage from './steps/ConfirmPage';
import DonePage from './steps/DonePage';
import MainInputPage from './steps/MainInputPage';
import StaffSelect from './steps/StaffSelect';
import StoreSelect from './steps/StoreSelect';

export default function App({ fixedStoreId = 0, fixedFormId = 0 }) {
	const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

	// 初期データ取得。
	useEffect(() => {
		let cancelled = false;
		async function load() {
			dispatch({ type: 'INIT_START' });
			try {
				const [stores, staff, settings, customFields] = await Promise.all([
					publicAPI.stores(),
					publicAPI.staff(),
					publicAPI.settings(),
					publicAPI.customFields(fixedFormId),
				]);
				if (cancelled) return;
				// ショートコードから localize された hasUserStores / hasUserStaff。
				// API レスポンス（is_system=0 のみ）の長さでも判定できるが、
				// バックエンドが付与した値の方が信頼できる（DB を直接参照しているため）。
				const ctx =
					typeof window !== 'undefined' && window.smartBookingFrontend
						? window.smartBookingFrontend
						: {};
				const apiStores = Array.isArray(stores) ? stores : [];
				const apiStaff = Array.isArray(staff) ? staff : [];
				const hasUserStores =
					typeof ctx.hasUserStores === 'boolean'
						? ctx.hasUserStores
						: apiStores.length > 0;
				const hasUserStaff =
					typeof ctx.hasUserStaff === 'boolean'
						? ctx.hasUserStaff
						: apiStaff.length > 0;
				dispatch({
					type: 'INIT_SUCCESS',
					payload: {
						stores: apiStores,
						staff: apiStaff,
						customFields: Array.isArray(customFields) ? customFields : [],
						settings: settings || {},
						fixedStoreId,
						formId: fixedFormId,
						hasUserStores,
						hasUserStaff,
					},
				});
			} catch (err) {
				if (cancelled) return;
				dispatch({
					type: 'INIT_FAIL',
					payload: err.message || '初期化に失敗しました。',
				});
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, [fixedStoreId, fixedFormId]);

	// CSS カスタムプロパティで色設定を適用（Gen-D で本格反映）。
	// 設定画面デザインタブの5色（button / date_selected / time_selected / required_mark / focus）を
	// root 要素のインライン style に差し込む。空文字/未設定なら CSS 側のデフォルトが使われる。
	useEffect(() => {
		if (!state.settings) return;
		const root = document.getElementById('smart-booking-app');
		if (!root) return;
		// プロパティキー → 設定キー対応。
		// 必須マーク色は CSS 側で `--smb-front-color-required` と
		// `--smb-front-color-required-mark` を両エイリアス対応させているため、両方へ書く。
		const map = [
			['--smb-front-color-button', state.settings.color_button],
			['--smb-front-color-date-selected', state.settings.color_date_selected],
			['--smb-front-color-time-selected', state.settings.color_time_selected],
			['--smb-front-color-required', state.settings.color_required_mark],
			['--smb-front-color-required-mark', state.settings.color_required_mark],
			['--smb-front-color-focus', state.settings.color_focus],
		];
		map.forEach(([prop, val]) => {
			if (val && typeof val === 'string' && val.length > 0) {
				root.style.setProperty(prop, val);
			} else {
				// 設定がクリアされた場合は inline 指定を外して CSS 既定に戻す。
				root.style.removeProperty(prop);
			}
		});
	}, [state.settings]);

	if (state.step === 'loading' || state.loading) {
		return (
			<div className="smb-front-root">
				<div className="smb-front-loading">
					<Spinner size="lg" label="読み込み中…" />
				</div>
			</div>
		);
	}

	if (state.step === 'error') {
		return (
			<div className="smb-front-root">
				<ErrorMessage message={state.error} />
			</div>
		);
	}

	return (
		<div className="smb-front-root">
			{state.step === 'store' && (
				<StoreSelect
					stores={state.stores}
					storeLabel={(state.settings && state.settings.store_label) || '店舗'}
					onSelect={(storeId) => dispatch({ type: 'SET_STORE', payload: storeId })}
				/>
			)}

			{state.step === 'staff' && (
				<StaffSelect
					staff={state.staff}
					storeId={state.storeId}
					staffLabel={(state.settings && state.settings.staff_label) || '担当者'}
					onSelect={(staffId) => dispatch({ type: 'SET_STAFF', payload: staffId })}
					onBack={
						// 戻れる先のステップが存在する場合だけ「戻る」を出す。
						canGoBack(state) ? () => dispatch({ type: 'GO_BACK' }) : undefined
					}
				/>
			)}

			{/*
			  メイン入力ステップ:
			    日付 + 時間 + フォーム入力を 1 画面に統合する (MainInputPage)。
			    flow_order ('A' / 'B') の差はセクションの並び順で吸収する。
			*/}
			{state.step === 'main' && (
				<MainInputPage
					state={state}
					dispatch={dispatch}
					onBack={
						canGoBack(state) ? () => dispatch({ type: 'GO_BACK' }) : undefined
					}
				/>
			)}

			{state.step === 'confirm' && <ConfirmPage state={state} dispatch={dispatch} />}

			{state.step === 'done' && <DonePage state={state} />}
		</div>
	);
}
