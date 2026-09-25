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
