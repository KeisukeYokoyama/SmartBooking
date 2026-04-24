/**
 * カスタムフィールド一覧。
 *
 * sort_order 順にリスト表示し、↑↓ で並び替え、編集・削除を行う。
 * 初期フィールド（氏名・メール・電話）は `is_protected: true` で返ってくるため、
 * 削除不可にしてロックアイコンを表示する。
 */
import Button from '../../components/Button';
import EmptyState from '../../components/EmptyState';
import { fieldTypeLabel } from './FieldTypeCards';

function TypeBadge({ type }) {
	return <span className={`smb-type-badge smb-type-badge--${type}`}>{fieldTypeLabel(type)}</span>;
}

export default function CustomFieldList({ fields, onEdit, onDelete, onMove }) {
	if (!fields || fields.length === 0) {
		return (
			<EmptyState
				icon="📝"
				title="フィールドがまだ登録されていません"
				description="上のカードから追加するフィールドタイプを選んでください。"
			/>
		);
	}

	return (
		<div className="smb-field-list" role="list" aria-label="カスタムフィールド一覧">
			<div className="smb-field-list__head" aria-hidden="true">
				<span className="smb-field-list__col-order">並び順</span>
				<span className="smb-field-list__col-label">ラベル / キー</span>
				<span className="smb-field-list__col-type">タイプ</span>
				<span className="smb-field-list__col-required">必須</span>
				<span className="smb-field-list__col-actions">操作</span>
			</div>
			{fields.map((field, i) => {
				const isProtected = !!field.is_protected;
				return (
					<div
						key={field.id}
						className={`smb-field-list__row ${isProtected ? 'is-protected' : ''}`}
						role="listitem"
					>
						<div className="smb-field-list__order">
							<button
								type="button"
								className="smb-field-list__reorder-btn"
								aria-label="上へ移動"
								onClick={() => onMove(i, -1)}
								disabled={i === 0}
							>
								↑
							</button>
							<button
								type="button"
								className="smb-field-list__reorder-btn"
								aria-label="下へ移動"
								onClick={() => onMove(i, 1)}
								disabled={i === fields.length - 1}
							>
								↓
							</button>
						</div>
						<div className="smb-field-list__label">
							<div className="smb-field-list__label-text">
								{field.field_label}
								{isProtected && (
									<span
										className="smb-field-list__lock"
										aria-label="初期フィールド（保護）"
										title="氏名・メール・電話は予約システムの基本項目のため削除できません"
									>
										🔒
									</span>
								)}
							</div>
							<code className="smb-field-list__key">{field.field_key}</code>
						</div>
						<div className="smb-field-list__type">
							<TypeBadge type={field.field_type} />
						</div>
						<div className="smb-field-list__required">
							{field.is_required ? (
								<span className="smb-badge smb-badge--required">必須</span>
							) : (
								<span className="smb-badge smb-badge--optional">任意</span>
							)}
						</div>
						<div className="smb-field-list__actions">
							<Button variant="secondary" size="sm" onClick={() => onEdit(field)}>
								編集
							</Button>
							<Button
								variant="ghost"
								size="sm"
								onClick={() => onDelete(field)}
								disabled={isProtected}
								title={
									isProtected
										? '初期フィールドは削除できません'
										: undefined
								}
							>
								削除
							</Button>
						</div>
					</div>
				);
			})}
		</div>
	);
}
