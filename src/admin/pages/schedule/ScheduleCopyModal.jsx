/**
 * スケジュールコピー モーダル。
 *
 * 仕様（smart-booking-spec.md 4.2 スケジュールコピー）+ 参考スクショ2枚:
 *   - admin-schedule-copy-individual.png（日付個別モード）
 *   - admin-schedule-copy-pattern.png（曜日パターンモード）
 *
 * コピー元:
 *   呼び出し側（SchedulePage）から props.source で
 *   { date, store_id, staff_id, storeName, staffName, slots:[...] } を渡す。
 *   モーダルではプレビュー表示のみ。
 *
 * コピー先:
 *   - モード1: 日付を個別選択。日付ピッカー + 「日付を追加」でチップ配列に push。
 *   - モード2: 曜日（日〜土）チェックボックス + 期間（開始〜終了）でプレビュー生成。
 *
 * 上書きオプション: チェック時 overwrite=true を送信。
 * 送信: POST /schedules/copy { source_date, target_dates, overwrite, store_id, staff_id }
 */
import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button';
import Modal from '../../components/Modal';
import { Field } from '../../components/Input';
import { addDays, formatFullDate, formatMonthDay, fromYmd, toYmd, WEEKDAY_LABELS } from './dateUtils';

/**
 * 期間 + 曜日セットから対象日付配列を生成する。
 */
function expandPattern(fromYmdStr, toYmdStr, weekdaySet, excludeYmd) {
	const from = fromYmd(fromYmdStr);
	const to = fromYmd(toYmdStr);
	if (!from || !to || from > to) return [];
	const out = [];
	for (let d = from; d <= to; d = addDays(d, 1)) {
		if (weekdaySet.has(d.getDay())) {
			const ymd = toYmd(d);
			if (ymd !== excludeYmd) out.push(ymd);
		}
	}
	return out;
}

export default function ScheduleCopyModal({ open, onClose, onSubmit, submitting, source }) {
	const [mode, setMode] = useState('individual');
	const [individualDates, setIndividualDates] = useState([]);
	const [pickerDate, setPickerDate] = useState('');
	const [weekdays, setWeekdays] = useState(new Set()); // Set<number 0..6>
	const [rangeFrom, setRangeFrom] = useState('');
	const [rangeTo, setRangeTo] = useState('');
	const [overwrite, setOverwrite] = useState(false);
	const [error, setError] = useState(null);

	useEffect(() => {
		if (!open || !source) return;
		setMode('individual');
		setIndividualDates([]);
		const base = fromYmd(source.date) || new Date();
		setPickerDate('');
		setWeekdays(new Set());
		setRangeFrom(toYmd(addDays(base, 1)));
		setRangeTo(toYmd(addDays(base, 7)));
		setOverwrite(false);
		setError(null);
	}, [open, source]);

	const patternPreview = useMemo(() => {
		if (mode !== 'pattern') return [];
		return expandPattern(rangeFrom, rangeTo, weekdays, source?.date);
	}, [mode, rangeFrom, rangeTo, weekdays, source]);

	const handlePickerChange = (value) => {
		setPickerDate(value);
		if (!value) return;
		if (source && value === source.date) {
			setError('コピー元と同じ日付は追加できません。');
			return;
		}
		if (individualDates.includes(value)) {
			setError(null);
			return;
		}
		setIndividualDates([...individualDates, value].sort());
		setError(null);
	};

	const handleRemoveIndividual = (d) => {
		setIndividualDates(individualDates.filter((x) => x !== d));
	};

	const toggleWeekday = (day) => {
		const next = new Set(weekdays);
		if (next.has(day)) next.delete(day);
		else next.add(day);
		setWeekdays(next);
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		const targets = mode === 'individual' ? individualDates : patternPreview;
		if (!targets || targets.length === 0) {
			setError('コピー先の日付を1件以上指定してください。');
			return;
		}
		setError(null);
		onSubmit({
			source_date: source.date,
			store_id: source.store_id,
			staff_id: source.staff_id,
			target_dates: targets,
			overwrite,
		});
	};

	if (!source) return null;

	const sourceDate = fromYmd(source.date);

	return (
		<Modal
			open={open}
			onClose={onClose}
			title="スケジュールをコピー"
			size="lg"
			footer={
				<>
					<Button variant="secondary" onClick={onClose} disabled={submitting}>
						キャンセル
					</Button>
					<Button variant="primary" onClick={handleSubmit} loading={submitting}>
						コピーを実行
					</Button>
				</>
			}
		>
			<form className="smb-form smb-copy-form" onSubmit={handleSubmit} noValidate>
				<section className="smb-copy-source">
					<h3 className="smb-copy-source__title">コピー元のスケジュール</h3>
					<dl className="smb-copy-source__list">
						<div>
							<dt>日付</dt>
							<dd>{sourceDate ? formatFullDate(sourceDate) : source.date}</dd>
						</div>
						<div>
							<dt>店舗</dt>
							<dd>{source.storeName || '-'}</dd>
						</div>
						<div>
							<dt>担当者</dt>
							<dd>{source.staffName || '-'}</dd>
						</div>
						<div>
							<dt>時間枠</dt>
							<dd>
								{source.slots && source.slots.length > 0
									? source.slots
											.map(
												(s) =>
													`${(s.start_time || '').slice(0, 5)}（在庫${s.capacity - s.booked_count}/${s.capacity}）`
											)
											.join('、 ')
									: '時間枠なし'}
							</dd>
						</div>
					</dl>
				</section>

				<fieldset className="smb-copy-mode">
					<legend className="smb-field__label">
						<span>コピー先の日付を選択</span>
						<span className="smb-field__required" aria-label="必須">
							*
						</span>
					</legend>
					<div className="smb-copy-mode__radios">
						<label className="smb-copy-mode__radio">
							<input
								type="radio"
								name="smb-copy-mode"
								value="individual"
								checked={mode === 'individual'}
								onChange={() => setMode('individual')}
							/>
							<span>日付を個別選択</span>
						</label>
						<label className="smb-copy-mode__radio">
							<input
								type="radio"
								name="smb-copy-mode"
								value="pattern"
								checked={mode === 'pattern'}
								onChange={() => setMode('pattern')}
							/>
							<span>パターンで選択（毎週〇曜日）</span>
						</label>
					</div>
				</fieldset>

				{mode === 'individual' && (
					<div className="smb-copy-individual">
						<div className="smb-copy-individual__add">
							<input
								type="date"
								className="smb-input"
								value={pickerDate}
								onChange={(e) => handlePickerChange(e.target.value)}
								aria-label="コピー先の日付"
							/>
						</div>
						<p className="smb-field__help">
							日付ピッカーで日付を選ぶと、自動的に下のリストへ追加されます。
						</p>
						{individualDates.length > 0 ? (
							<ul className="smb-chip-list" role="list">
								{individualDates.map((d) => {
									const dateObj = fromYmd(d);
									return (
										<li key={d} className="smb-date-chip">
											<span>{dateObj ? formatMonthDay(dateObj) : d}</span>
											<button
												type="button"
												className="smb-date-chip__remove"
												aria-label={`${d} を削除`}
												onClick={() => handleRemoveIndividual(d)}
											>
												×
											</button>
										</li>
									);
								})}
							</ul>
						) : (
							<p className="smb-copy-individual__empty">
								日付ピッカーで日付を選ぶと、ここにリストとして表示されます。
							</p>
						)}
					</div>
				)}

				{mode === 'pattern' && (
					<div className="smb-copy-pattern">
						<Field label="曜日を選択">
							<div className="smb-weekday-picker">
								{WEEKDAY_LABELS.map((label, idx) => (
									<label key={idx} className="smb-weekday-picker__item">
										<input
											type="checkbox"
											checked={weekdays.has(idx)}
											onChange={() => toggleWeekday(idx)}
										/>
										<span>{label}</span>
									</label>
								))}
							</div>
						</Field>
						<div className="smb-field-group smb-field-group--contact smb-copy-pattern__range">
							<Field label="期間（開始）" htmlFor="smb-range-from">
								<input
									id="smb-range-from"
									type="date"
									className="smb-input"
									value={rangeFrom}
									onChange={(e) => setRangeFrom(e.target.value)}
								/>
							</Field>
							<Field label="期間（終了）" htmlFor="smb-range-to">
								<input
									id="smb-range-to"
									type="date"
									className="smb-input"
									value={rangeTo}
									onChange={(e) => setRangeTo(e.target.value)}
								/>
							</Field>
						</div>
						<div className="smb-copy-pattern__preview">
							<span className="smb-copy-pattern__preview-label">
								対象日（{patternPreview.length}件）:
							</span>
							{patternPreview.length === 0 ? (
								<span className="smb-copy-pattern__preview-empty">
									該当する日付がありません。曜日と期間を見直してください。
								</span>
							) : (
								<ul className="smb-chip-list" role="list">
									{patternPreview.slice(0, 24).map((d) => {
										const dateObj = fromYmd(d);
										return (
											<li key={d} className="smb-date-chip smb-date-chip--readonly">
												<span>{dateObj ? formatMonthDay(dateObj) : d}</span>
											</li>
										);
									})}
									{patternPreview.length > 24 && (
										<li className="smb-date-chip smb-date-chip--readonly">
											<span>他 {patternPreview.length - 24} 件</span>
										</li>
									)}
								</ul>
							)}
						</div>
					</div>
				)}

				<label className="smb-checkbox-line">
					<input
						type="checkbox"
						checked={overwrite}
						onChange={(e) => setOverwrite(e.target.checked)}
					/>
					<span>既存のスケジュールがある日付も上書きする</span>
				</label>
				<p className="smb-field__help">
					チェックを外すと、既存スケジュールがある日付はスキップされます。予約が入っている時間枠は上書きしても保護されます。
				</p>

				{error && <p className="smb-field__error">{error}</p>}

				<button type="submit" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1}>
					送信
				</button>
			</form>
		</Modal>
	);
}
