/**
 * メールテンプレートの変数ヘルパー向けに、カスタムフィールド配列から
 * 「使える変数」一覧を組み立てる共有ユーティリティ。
 *
 * 設定 > メール通知（MailSettingsTab）とフォーム設定 > メール（FormMailTab）の
 * 双方で使う。挙動は完全に同一（重複排除のための抽出のみ）。
 */

/**
 * 1フォーム分のカスタムフィールド配列から、メール本文に挿入できる変数一覧を組み立てる。
 *
 * - 保護フィールド（氏名/メール/電話）は固定8変数と重複するため除外する
 * - address タイプは {key}（〒＋住所）/ {key_zip}（郵便番号）/ {key_address}（住所）の3変数に展開する
 * - それ以外は {key} の1変数
 *
 * @param {Array} fields カスタムフィールド配列（API.customFields.list の結果）
 * @return {Array<{key: string, desc: string}>} 変数一覧
 */
export function buildFormVariables( fields ) {
	const list = Array.isArray( fields ) ? fields : [];
	const variables = [];
	for ( const fld of list ) {
		// 保護フィールド（氏名/メール/電話）は固定変数と重複するため除外。
		if ( fld.is_protected ) {
			continue;
		}
		if ( fld.field_type === 'address' ) {
			variables.push( {
				key: `{${ fld.field_key }}`,
				desc: `${ fld.field_label }（〒＋住所）`,
			} );
			variables.push( {
				key: `{${ fld.field_key }_zip}`,
				desc: `${ fld.field_label }（郵便番号）`,
			} );
			variables.push( {
				key: `{${ fld.field_key }_address}`,
				desc: `${ fld.field_label }（住所）`,
			} );
		} else {
			variables.push( {
				key: `{${ fld.field_key }}`,
				desc: fld.field_label,
			} );
		}
	}
	return variables;
}
