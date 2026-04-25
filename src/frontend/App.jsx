/**
 * Smart Booking フロント予約フォーム ルートコンポーネント。
 *
 * 状態機構:
 *   マウント時に `/public/stores`, `/public/staff`, `/public/settings`, `/public/custom-fields` を
 *   並列取得し、スキップルールを適用して初期ステップを決定する。
 *
 * 本フェーズ (Gen-A) で実装するステップ:
 *   - store: StoreSelect
 *   - staff: StaffSelect
 *   - date/time/form/confirm/done はプレースホルダーのみ（Gen-B/C で実装）
 *
 * 表示順序（flow_order）は `state.js` の getStepOrder() に集約。
 */
import { useEffect, useReducer } from 'react';
import { publicAPI } from './api';
import ErrorMessage from './components/ErrorMessage';
import Spinner from './components/Spinner';
import StepHeader from './components/StepHeader';
import { INITIAL_STATE, reducer } from './state';
import StaffSelect from './steps/StaffSelect';
import StoreSelect from './steps/StoreSelect';

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

	// CSS カスタムプロパティで色設定を適用（Gen-D で本格的に拡充）。
	useEffect(() => {
		if (!state.settings) return;
		const root = document.getElementById('smart-booking-app');
		if (!root) return;
		const map = {
			'--smb-front-color-button': state.settings.color_button,
			'--smb-front-color-date-selected': state.settings.color_date_selected,
			'--smb-front-color-time-selected': state.settings.color_time_selected,
			'--smb-front-color-required': state.settings.color_required_mark,
			'--smb-front-color-focus': state.settings.color_focus,
		};
		Object.entries(map).forEach(([prop, val]) => {
			if (val && typeof val === 'string' && val.length > 0) {
				root.style.setProperty(prop, val);
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
						// 店舗選択ステップがスキップされていない場合だけ戻るボタンを出す。
						state.fixedStoreId > 0 || state.stores.length <= 1
							? undefined
							: () => dispatch({ type: 'GO_BACK' })
					}
				/>
			)}

			{/* Gen-B/C で実装予定のプレースホルダー。 */}
			{['date', 'time', 'form', 'confirm', 'done'].includes(state.step) && (
				<div className="smb-front-step">
					<StepHeader
						title={placeholderTitle(state.step)}
						subtitle="この画面は次のフェーズで実装されます。"
						onBack={() => dispatch({ type: 'GO_BACK' })}
					/>
					<div className="smb-front-placeholder">
						<p>現在のステップ: <code>{state.step}</code></p>
						<dl className="smb-front-placeholder__dl">
							<dt>店舗 ID</dt>
							<dd>{state.storeId ?? '-'}</dd>
							<dt>担当者 ID</dt>
							<dd>{state.staffId ?? '-'}</dd>
							<dt>flow_order</dt>
							<dd>{state.settings?.flow_order ?? '-'}</dd>
						</dl>
					</div>
				</div>
			)}
		</div>
	);
}

function placeholderTitle(step) {
	switch (step) {
		case 'date':
			return '日付を選択';
		case 'time':
			return '時間を選択';
		case 'form':
			return 'お客様情報の入力';
		case 'confirm':
			return '予約内容の確認';
		case 'done':
			return '予約完了';
		default:
			return '';
	}
}
