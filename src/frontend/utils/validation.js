/**
 * 予約フォームの入力検証 共有モジュール。
 *
 * 従来 FormInput.jsx（validateField・文言を返す）と MainInputPage.jsx
 * （isFieldValid・真偽を返す）に同一ロジックの別コピーが存在した。
 * v0.6.0 で新ルール（入力ルール）を追加するにあたり、判定のドリフトを防ぐため
 * ここへ一本化する。**この一本化では挙動・文言・判定を一切変えていない**
 * （2026-09-25 の差分調査で両者の判定差分ゼロを確認済み。整形はプロジェクトの
 * lint スタイルへ揃えただけで、判定結果は 1 件も変わらない）。
 *
 * サーバー側（class-rest-public.php）は送信ペイロードから独立に再判定する。
 * ここでの判定はあくまで UI 表示用のフェイルセーフ。
 */
import { normalizeZip } from '../addressLookup';
import { isFieldVisible } from '../fieldConditions';

// メール形式（緩め）。サーバーは is_email() を使うため厳密には一致しないが、
// v0.5.6 時点の既存挙動を維持するためフロントはこの正規表現を踏襲する。
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 数字・ハイフン・プラス・括弧・スペースのみ許容（国際形式まで緩めに）。
export const PHONE_RE = /^[0-9+()\-\s]+$/;

/**
 * フィールド種別に応じて生値を正規化する。
 *
 * @param {Object} field カスタムフィールド定義
 * @param {*}      raw   state 上の生値
 * @return {*} checkbox は配列 / address は {zip,address} / 他は文字列
 */
export function normalizeValue( field, raw ) {
	if ( field.field_type === 'checkbox' ) {
		return Array.isArray( raw ) ? raw : [];
	}
	if ( field.field_type === 'address' ) {
		const obj = raw && typeof raw === 'object' ? raw : {};
		return { zip: obj.zip || '', address: obj.address || '' };
	}
	return raw === undefined || raw === null ? '' : String( raw );
}

/**
 * フィールドを検証し、エラー文言（string）または null を返す。
 *
 * @param {Object} field カスタムフィールド定義
 * @param {*}      value normalizeValue 済みの値
 * @return {string|null} エラー文言。妥当なら null
 */
export function validateField( field, value ) {
	const required = !! field.is_required;
	if ( field.field_type === 'checkbox' ) {
		const arr = Array.isArray( value ) ? value : [];
		if ( required && arr.length === 0 ) {
			return 'この項目は必須です。';
		}
		return null;
	}
	if ( field.field_type === 'address' ) {
		const zip = typeof value?.zip === 'string' ? value.zip.trim() : '';
		const address =
			typeof value?.address === 'string' ? value.address.trim() : '';
		if ( required ) {
			// 必須: 郵便番号・住所の両方が非空、かつ郵便番号は正規化後7桁であること。
			if ( zip === '' || address === '' ) {
				return 'この項目は必須です。';
			}
			if ( normalizeZip( zip ).length !== 7 ) {
				return '郵便番号は7桁の数字で入力してください。';
			}
			return null;
		}
		// 任意: 郵便番号が空なら住所欄の内容にかかわらずOK。
		// 郵便番号を入力した場合のみ、7桁かどうかを検証する。
		if ( zip === '' ) {
			return null;
		}
		if ( normalizeZip( zip ).length !== 7 ) {
			return '郵便番号は7桁の数字で入力してください。';
		}
		return null;
	}
	const str = typeof value === 'string' ? value.trim() : '';
	if ( required && str === '' ) {
		return 'この項目は必須です。';
	}
	if ( str === '' ) {
		return null; // 任意項目は空でもOK
	}

	if (
		field.field_key === 'customer_email' ||
		field.field_type === 'email'
	) {
		if ( ! EMAIL_RE.test( str ) ) {
			return 'メールアドレスの形式が正しくありません。';
		}
	}
	if ( field.field_key === 'customer_phone' || field.field_type === 'tel' ) {
		if ( ! PHONE_RE.test( str ) ) {
			return '電話番号は数字・ハイフン・括弧・+ のみで入力してください。';
		}
		// 数字部分だけ抽出して桁数を検証（日本固定 10 桁・携帯 11 桁、E.164 最大 15 桁）。
		const digits = str.replace( /\D/g, '' );
		if ( digits.length < 9 || digits.length > 15 ) {
			return '電話番号の桁数が正しくありません。';
		}
	}
	return null;
}

/**
 * validateField の真偽版。エラーが無ければ true。
 *
 * @param {Object} field カスタムフィールド定義
 * @param {*}      value normalizeValue 済みの値
 * @return {boolean} 妥当なら true
 */
export function isFieldValid( field, value ) {
	return validateField( field, value ) === null;
}

/* ------------------------------------------------------------------ *
 * v0.6.0 入力ルール（文字種 / 文字数 / 一致する項目）                 *
 *                                                                    *
 * サーバー（class-rest-public.php）の実装とビット等価に保つこと。      *
 * - 文字種の正規表現・全角→半角の変換範囲・文字数のコードポイント数え方・ *
 *   一致判定（双方 trim・大小区別）はサーバーと同一。                 *
 * ------------------------------------------------------------------ */

const RULE_CHARSET_TYPES = [ 'text', 'textarea' ];
const RULE_MATCH_TYPES = [ 'text', 'email', 'tel' ];
const RULE_ALL_TYPES = [ 'text', 'textarea', 'email', 'tel' ];

const CHARSET_LABELS = {
	numeric: '半角数字',
	alpha: '半角英字',
	alnum: '半角英数字',
	katakana: 'カタカナ',
	hiragana: 'ひらがな',
	kana: 'ひらがなまたはカタカナ',
};

// サーバーの charset_regex() と同一（仕様 §4-1 の指示どおり \u 表記で記述）。
// すべて BMP 内の文字のため u フラグは不要。末尾の半角空白（U+0020）はそのまま。
const CHARSET_RE = {
	numeric: /^[0-9]+$/,
	alpha: /^[A-Za-z]+$/,
	alnum: /^[A-Za-z0-9]+$/,
	katakana: /^[\u30A1-\u30F6\u30FC\u30FB\u30FD\u30FE\u3000 ]+$/,
	hiragana: /^[\u3041-\u3096\u309D\u309E\u30FC\u30FB\u3000 ]+$/,
	kana: /^[\u30A1-\u30F6\u3041-\u3096\u30FC\u30FB\u30FD\u30FE\u309D\u309E\u3000 ]+$/,
};

/**
 * 前後の空白（半角空白・タブ・改行・全角空白 U+3000）を除去する（§3）。
 *
 * @param {*} s 入力.
 * @return {string} 前後空白除去後の文字列.
 */
export function trimFull( s ) {
	const str = s === undefined || s === null ? '' : String( s );
	return str.replace( /^[\s\u3000]+|[\s\u3000]+$/g, '' );
}

// 全角英数字（U+FF10-19 / U+FF21-3A / U+FF41-5A）を半角へ。記号・空白は変換しない
// （サーバーの mb_convert_kana 'rn' と同一範囲）。
function zenkakuToHankakuAlnum( s ) {
	return s.replace( /[\uFF10-\uFF19\uFF21-\uFF3A\uFF41-\uFF5A]/g, ( ch ) =>
		String.fromCharCode( ch.charCodeAt( 0 ) - 0xfee0 )
	);
}

/**
 * ルール適用フィールドの値を整形する（§3）。サーバー format_rule_value() と同一。
 *
 * @param {Object} rules validation_rules（charset/min_length/max_length/match_field_key）.
 * @param {*}      value 生値.
 * @return {string} 整形後の値.
 */
export function formatRuleValue( rules, value ) {
	let s = trimFull( value );
	s = s.replace( /\r\n/g, '\n' ).replace( /\r/g, '\n' );
	const cs = rules && rules.charset ? rules.charset : '';
	if ( cs === 'numeric' || cs === 'alpha' || cs === 'alnum' ) {
		s = zenkakuToHankakuAlnum( s );
	}
	return s;
}

function lengthMessage( min, max ) {
	if ( min !== null && max !== null ) {
		return `${ min }〜${ max }文字で入力してください。`;
	}
	if ( min !== null ) {
		return `${ min }文字以上で入力してください。`;
	}
	return `${ max }文字以内で入力してください。`;
}

/**
 * 入力ルールを評価する（§2 §4）。最初に失敗したルールの文言（ラベルなし・
 * 既存インラインエラーの書式）を返す。妥当なら null。formattedValue は非空前提。
 *
 * @param {Object} field          カスタムフィールド定義.
 * @param {Object} rules          validation_rules.
 * @param {string} formattedValue 整形後の自フィールド値（非空）.
 * @param {Object} ctx            { fieldsByKey, formValues }.
 * @return {string|null} エラー文言、または null.
 */
export function evaluateRules( field, rules, formattedValue, ctx ) {
	const type = field.field_type;

	// 文字種.
	if ( rules.charset && RULE_CHARSET_TYPES.includes( type ) ) {
		const re = CHARSET_RE[ rules.charset ];
		if ( re && ! re.test( formattedValue ) ) {
			const label = CHARSET_LABELS[ rules.charset ] || '';
			return `${ label }で入力してください。`;
		}
	}

	// 文字数（コードポイント数）.
	if ( RULE_CHARSET_TYPES.includes( type ) ) {
		const min =
			rules.min_length !== undefined && rules.min_length !== null
				? rules.min_length
				: null;
		const max =
			rules.max_length !== undefined && rules.max_length !== null
				? rules.max_length
				: null;
		if ( min !== null || max !== null ) {
			const len = [ ...formattedValue ].length;
			const tooShort = min !== null && len < min;
			const tooLong = max !== null && len > max;
			if ( tooShort || tooLong ) {
				return lengthMessage( min, max );
			}
		}
	}

	// 一致する項目.
	if ( rules.match_field_key && RULE_MATCH_TYPES.includes( type ) ) {
		const targetKey = rules.match_field_key;
		const targetField =
			ctx && ctx.fieldsByKey ? ctx.fieldsByKey[ targetKey ] : null;
		if ( targetField ) {
			const formValues = ctx.formValues || {};
			// 比較先が条件フィールドで非表示ならスキップ。コア項目は常に表示。
			if ( isFieldVisible( targetField, formValues ) ) {
				const targetRaw = formValues[ targetKey ];
				const targetVal = trimFull(
					typeof targetRaw === 'object' ? '' : targetRaw
				);
				const selfVal = trimFull( formattedValue );
				if ( selfVal !== targetVal ) {
					return `${ targetField.field_label || '' }と一致しません。`;
				}
			}
		}
	}

	return null;
}

/**
 * フィールドを検証する（既存チェック＋入力ルール）。整形も行い結果を返す。
 *
 * 手順（§2）: 整形 → 既存チェック（必須・email/tel 形式・住所）→ 文字種 → 文字数 → 一致。
 * ルール未設定・対象外型のフィールドは整形もルール評価も行わず、既存チェックのみ（v0.5.6 と同一）。
 *
 * @param {Object} field           カスタムフィールド定義.
 * @param {*}      normalizedValue normalizeValue 済みの値.
 * @param {Object} [ctx]           { fieldsByKey, formValues }（一致ルール評価に必要）.
 * @return {{ error: (string|null), formatted: * }} エラー文言と整形後の値.
 */
export function validateFieldFull( field, normalizedValue, ctx ) {
	const rules = field.validation_rules;
	const isRuleType = RULE_ALL_TYPES.includes( field.field_type );
	let effective = normalizedValue;
	if ( rules && isRuleType && typeof normalizedValue === 'string' ) {
		effective = formatRuleValue( rules, normalizedValue );
	}

	// 既存チェック（必須・email/tel 形式・住所）。整形後の値に対して行う。
	const baseErr = validateField( field, effective );
	if ( baseErr ) {
		return { error: baseErr, formatted: effective };
	}

	// 入力ルール（整形後が非空のときだけ）。
	if (
		rules &&
		isRuleType &&
		typeof effective === 'string' &&
		effective !== '' &&
		ctx
	) {
		const ruleErr = evaluateRules( field, rules, effective, ctx );
		if ( ruleErr ) {
			return { error: ruleErr, formatted: effective };
		}
	}

	return { error: null, formatted: effective };
}
