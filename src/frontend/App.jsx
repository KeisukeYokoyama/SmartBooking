/**
 * Smart Booking フロント予約フォーム ルートコンポーネント。
 *
 * 状態機構:
 *   マウント時に `/public/stores`, `/public/staff`, `/public/settings`, `/public/custom-fields` を
 *   並列取得し、スキップルールを適用して初期ステップを決定する。
 *
 * ステップ (Gen-C 完了時点):
 *   - store:   StoreSelect
 *   - staff:   StaffSelect
 *   - date:    DateSelect + TimeSelect（一体表示）
 *   - time:    DateSelect + TimeSelect へフォールバック
 *   - form:    FormInput
 *   - confirm: ConfirmPage
 *   - done:    DonePage
 *
 * 表示順序（flow_order）は `state.js` の getStepOrder() に集約。
 */
import { useEffect, useReducer } from 'react';
import { publicAPI } from './api';
import ErrorMessage from './components/ErrorMessage';
import Spinner from './components/Spinner';
import { canGoBack, INITIAL_STATE, reducer } from './state';
import ConfirmPage from './steps/ConfirmPage';
import DateSelect from './steps/DateSelect';
import DonePage from './steps/DonePage';
import FormInput from './steps/FormInput';
import StaffSelect from './steps/StaffSelect';
import StoreSelect from './steps/StoreSelect';
import TimeSelect from './steps/TimeSelect';

export default function App({ fixedStoreId = 0 }) {
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
					publicAPI.customFields(),
				]);
				if (cancelled) return;
				dispatch({
					type: 'INIT_SUCCESS',
					payload: {
						stores: Array.isArray(stores) ? stores : [],
						staff: Array.isArray(staff) ? staff : [],
						customFields: Array.isArray(customFields) ? customFields : [],
						settings: settings || {},
						fixedStoreId,
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
	}, [fixedStoreId]);

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
					onSelect={(storeId) => dispatch({ type: 'SET_STORE', payload: storeId })}
				/>
			)}

			{state.step === 'staff' && (
				<StaffSelect
					staff={state.staff}
					storeId={state.storeId}
					onSelect={(staffId) => dispatch({ type: 'SET_STAFF', payload: staffId })}
					onBack={
						// 戻れる先のステップが存在する場合だけ「戻る」を出す。
						canGoBack(state) ? () => dispatch({ type: 'GO_BACK' }) : undefined
					}
				/>
			)}

			{/*
			  日付選択ステップ:
			    DateSelect の内側に TimeSelect をネストする。
			    日付が未選択なら時間枠は非表示、選択されたらカレンダー下部に並ぶ。
			  仕様 3.4「日付を選択すると、カレンダーの下に空き時間枠がボタン形式で表示される」。
			*/}
			{state.step === 'date' && (
				<DateSelect
					state={state}
					dispatch={dispatch}
					onBack={
						canGoBack(state) ? () => dispatch({ type: 'GO_BACK' }) : undefined
					}
				>
					<TimeSelect state={state} dispatch={dispatch} />
				</DateSelect>
			)}

			{/* time ステップは現状使わない（SET_TIME で直接 form へ遷移）。
			    ただし flow_order 切替等のために状態としては存在するので、
			    明示的に DateSelect+TimeSelect を表示して安全側にフォールバック。 */}
			{state.step === 'time' && (
				<DateSelect
					state={state}
					dispatch={dispatch}
					onBack={
						canGoBack(state) ? () => dispatch({ type: 'GO_BACK' }) : undefined
					}
				>
					<TimeSelect state={state} dispatch={dispatch} />
				</DateSelect>
			)}

			{state.step === 'form' && (
				<FormInput
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
