/**
 * 選択済み情報バー（店舗・担当者）。
 *
 * 仕様:
 *   - 店舗選択 / 担当者選択ステップが表示されたあと、後続ステップ上部に
 *     「店舗名 / 担当者名」を控えめなバーで常時表示する。
 *   - 設定 show_store_front / show_staff_front が OFF の場合は対応する項目を表示しない
 *     （ステップが出ていない要素はバーにも出さない）。
 *   - スキップされた要素（店舗固定指定 / hasUserStores=false 等）は表示しない。
 *   - 店舗・担当者の両方がスキップされた場合は何も描画しない。
 *   - v1 では表示のみ（タップして選び直す機能は持たせない）。
 */
import { useMemo } from 'react';

/**
 * バー表示に必要な情報を計算する。
 *
 * @param {Object} state フォーム全体の state
 * @return {{ store: ?Object, staff: ?Object, showStore: boolean, showStaff: boolean }}
 */
function pickSelectionInfo(state) {
	const stores = Array.isArray(state.stores) ? state.stores : [];
	const allStaff = Array.isArray(state.staff) ? state.staff : [];
	const hasUserStores = state.hasUserStores !== false;
	const hasUserStaff = state.hasUserStaff !== false;
	const settings = state.settings || {};
	const showStoreSetting = settings.show_store_front === true;
	const showStaffSetting = settings.show_staff_front === true;

	// 店舗ステップが実際にユーザーに表示されたかどうか:
	//   - 設定で OFF → 非表示
	//   - hasUserStores=false → ステップ自体が無いので非表示
	//   - ショートコードで店舗固定 → 非表示
	//   - 有効な店舗が 0 件 → 表示しても意味がないので非表示
	const storeStepWasShown =
		showStoreSetting &&
		hasUserStores &&
		(!state.fixedStoreId || state.fixedStoreId <= 0) &&
		stores.length > 0;

	// 担当者ステップが実際にユーザーに表示されたかどうか:
	//   - 設定で OFF → 非表示
	//   - hasUserStaff=false → ステップ自体が無いので非表示
	//   - 該当店舗の担当者が 0 人 → 非表示
	const staffForStore = state.storeId
		? allStaff.filter((s) => s.store_id === state.storeId)
		: allStaff;
	const staffStepWasShown =
		showStaffSetting && hasUserStaff && staffForStore.length > 0;

	const store = stores.find((s) => s.id === state.storeId) || null;
	const staffMember = allStaff.find((s) => s.id === state.staffId) || null;

	return {
		store,
		staff: staffMember,
		showStore: storeStepWasShown && !!store,
		showStaff: staffStepWasShown && !!staffMember,
	};
}

export default function SelectionBar({ state }) {
	const info = useMemo(() => pickSelectionInfo(state), [state]);

	if (!info.showStore && !info.showStaff) {
		return null;
	}

	return (
		<div
			className="smb-front-selection-bar"
			role="status"
			aria-label="選択中の店舗と担当者"
		>
			{info.showStore && (
				<span className="smb-front-selection-bar__item">
					<span className="smb-front-selection-bar__label">店舗</span>
					<span className="smb-front-selection-bar__value">{info.store.name}</span>
				</span>
			)}
			{info.showStore && info.showStaff && (
				<span className="smb-front-selection-bar__sep" aria-hidden="true">/</span>
			)}
			{info.showStaff && (
				<span className="smb-front-selection-bar__item">
					<span className="smb-front-selection-bar__label">担当者</span>
					<span className="smb-front-selection-bar__value">{info.staff.name}</span>
				</span>
			)}
		</div>
	);
}
