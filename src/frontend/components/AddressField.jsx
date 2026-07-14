/**
 * 住所フィールド (v0.3.0 機能④) の入力 UI。
 *
 * 郵便番号 + 住所の複合入力。郵便番号が7桁になった時点で（自動入力 ON の場合のみ）
 * zipcloud に問い合わせ、住所欄が未入力 or 前回自動補完した値のままなら候補で自動更新する。
 * ユーザーが住所欄を手で編集した後は上書きしない。
 * 通信失敗時は何もしない（フェイルソフト。エラー表示・ログ出力は行わない）。
 */
import { useEffect, useRef } from 'react';
import { lookupAddress, normalizeZip } from '../addressLookup';

const DEBOUNCE_MS = 500;

export default function AddressField({ field, value, onChange, error, id }) {
	const zip = value && typeof value === 'object' && value.zip ? value.zip : '';
	const address = value && typeof value === 'object' && value.address ? value.address : '';

	const autofillEnabled = !!field && field.autofill !== false;

	// 自動補完で最後に住所欄へ入れた値。ユーザーが手で編集したかどうかの判定に使う。
	const lastAutoFilledRef = useRef('');
	const timerRef = useRef(null);
	// 直前の debounce/fetch の結果を無効化するためのトークン（zip 変更・アンマウントで進める）。
	const requestTokenRef = useRef(0);
	// 最新の住所欄の値を非同期コールバックから参照するための ref（クロージャの古い値対策）。
	const addressRef = useRef(address);
	addressRef.current = address;

	useEffect(() => {
		return () => {
			if (timerRef.current) {
				clearTimeout(timerRef.current);
				timerRef.current = null;
			}
			// アンマウント後に届いた結果は反映させない。
			requestTokenRef.current += 1;
		};
	}, []);

	const zipId = id ? id + '-zip' : undefined;
	const addressId = id ? id + '-address' : undefined;
	// エラーメッセージ本文は呼び出し側 (FormInput) が id + '-err' で1つだけ表示する前提。
	// ここでは aria-describedby でその要素を指し示すだけ。
	const errId = id ? id + '-err' : undefined;

	const zipError = error && typeof error === 'object' ? error.zip : error;
	const addressError = error && typeof error === 'object' ? error.address : error;

	const scheduleLookup = (rawZip) => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		// 新しい入力が来たので、前回までの debounce/fetch の結果は無視する。
		requestTokenRef.current += 1;

		if (!autofillEnabled) {
			return;
		}

		const digits = normalizeZip(rawZip);
		if (digits.length !== 7) {
			return;
		}

		const myToken = requestTokenRef.current;
		timerRef.current = setTimeout(() => {
			lookupAddress(digits).then((candidate) => {
				// 別の入力・アンマウントで無効化されていれば結果を捨てる。
				if (requestTokenRef.current !== myToken || !candidate) {
					return;
				}
				const current = addressRef.current;
				// ユーザーが手で編集済み（前回の自動補完値と異なり、かつ空でない）なら上書きしない。
				const untouched = current === '' || current === lastAutoFilledRef.current;
				if (!untouched) {
					return;
				}
				lastAutoFilledRef.current = candidate;
				onChange({ zip: rawZip, address: candidate });
			});
		}, DEBOUNCE_MS);
	};

	const handleZipChange = (e) => {
		const nextZip = e.target.value;
		onChange({ zip: nextZip, address });
		scheduleLookup(nextZip);
	};

	const handleAddressChange = (e) => {
		onChange({ zip, address: e.target.value });
	};

	// 新しい CSS クラスを追加せず、既存の smb-front-form__* を再利用して見た目を統一する。
	// 2つのサブ入力を縦に並べるための余白のみインラインスタイルで補う。
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
			<div className="smb-front-form__row">
				<label htmlFor={zipId} className="smb-front-form__label smb-front-label">
					郵便番号
				</label>
				<input
					id={zipId}
					type="text"
					inputMode="numeric"
					autoComplete="postal-code"
					className={
						'smb-front-form__input smb-front-input' + (zipError ? ' has-error is-error' : '')
					}
					placeholder="1234567"
					value={zip}
					onChange={handleZipChange}
					aria-invalid={zipError ? 'true' : 'false'}
					aria-describedby={zipError ? errId : undefined}
				/>
			</div>
			<div className="smb-front-form__row">
				<label htmlFor={addressId} className="smb-front-form__label smb-front-label">
					住所
				</label>
				<input
					id={addressId}
					type="text"
					autoComplete="address-line1"
					className={
						'smb-front-form__input smb-front-input' + (addressError ? ' has-error is-error' : '')
					}
					placeholder="東京都渋谷区渋谷1-2-3"
					value={address}
					onChange={handleAddressChange}
					aria-invalid={addressError ? 'true' : 'false'}
					aria-describedby={addressError ? errId : undefined}
				/>
			</div>
		</div>
	);
}
