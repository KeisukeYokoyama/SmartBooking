/**
 * カスタムフィールドの「表示条件」判定ユーティリティ (v0.3.0 機能③).
 *
 * radio / select の親フィールドの選択値に応じて、子フィールドの表示/非表示を判定する。
 * 「条件は1つのみ・親は radio/select のみ・ネスト禁止（1段のみ）」という制約は
 * 管理画面 (CustomFieldModal) 側で担保するため、ここでは単純な一致判定のみを行う。
 *
 * 注意: ここでの判定はあくまで UI 表示用。POST /public/reservations 送信時は
 * サーバー側が送信された親フィールドの値から同一ロジックで再判定するため、
 * フロントの判定結果をサーバーは信用しない（フェイルセーフ）。
 */

/**
 * フィールドが現在の入力値の下で表示対象かどうかを判定する。
 *
 * @param {Object} field      カスタムフィールド定義 (condition_field_key / condition_value を持つ)
 * @param {Object} formValues 現在の入力値 ( { field_key: value } )
 * @return {boolean} 表示するなら true
 */
export function isFieldVisible( field, formValues ) {
	const parentKey = field && field.condition_field_key;
	// null/空 = 常時表示
	if ( ! parentKey ) {
		return true;
	}

	const parentVal = formValues ? formValues[ parentKey ] : undefined;
	const current =
		parentVal === undefined || parentVal === null
			? ''
			: String( parentVal );
	const expected =
		field &&
		field.condition_value !== undefined &&
		field.condition_value !== null
			? String( field.condition_value )
			: '';
	return current === expected;
}

/**
 * フィールド配列のうち、現在の入力値の下で表示対象のものだけを返す。
 *
 * @param {Array}  fields     カスタムフィールド定義の配列
 * @param {Object} formValues 現在の入力値 ( { field_key: value } )
 * @return {Array} 表示対象のフィールドのみを含む配列
 */
export function visibleFields( fields, formValues ) {
	const list = Array.isArray( fields ) ? fields : [];
	return list.filter( ( f ) => isFieldVisible( f, formValues ) );
}
