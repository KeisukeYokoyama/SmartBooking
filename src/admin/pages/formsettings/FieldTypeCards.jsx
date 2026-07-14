/**
 * フィールドタイプ選択カード。
 *
 * 各カードは **タイプ名 + 説明文 + 追加ボタン** で構成する。
 * クリックでフィールド追加モーダルを開き、選択されたタイプをプリセットする。
 */
import Button from '../../components/Button';

export const FIELD_TYPES = [
	{
		type: 'text',
		label: '1行テキスト',
		description: '短文の自由入力。会社名や役職など。',
	},
	{
		type: 'email',
		label: 'メールアドレス',
		description: 'メール形式のバリデーション付き。',
	},
	{
		type: 'tel',
		label: '電話番号',
		description: '数字・ハイフンのみを想定した入力欄。',
	},
	{
		type: 'textarea',
		label: '複数行テキスト',
		description: '要望や質問などの長文入力に最適。',
	},
	{
		type: 'select',
		label: 'セレクトボックス',
		description: '用意した選択肢から1つだけ選ぶ。',
	},
	{
		type: 'radio',
		label: 'ラジオボタン',
		description: '択一選択を横並びのボタンで表示。',
	},
	{
		type: 'checkbox',
		label: 'チェックボックス',
		description: '複数選択を許可するチェック式。',
	},
	{
		type: 'address',
		label: '住所（郵便番号）',
		description: '郵便番号を入力すると住所を自動補完。番地は手入力。',
	},
];

export function fieldTypeLabel(type) {
	const found = FIELD_TYPES.find((t) => t.type === type);
	return found ? found.label : type;
}

export default function FieldTypeCards({ onSelect }) {
	return (
		<div className="smb-field-type-cards">
			{FIELD_TYPES.map((ft) => (
				<div key={ft.type} className="smb-field-type-card" role="listitem">
					<div className="smb-field-type-card__body">
						<h3 className="smb-field-type-card__title">{ft.label}</h3>
						<p className="smb-field-type-card__desc">{ft.description}</p>
					</div>
					<Button
						variant="secondary"
						size="sm"
						onClick={() => onSelect(ft.type)}
						aria-label={`${ft.label} を追加`}
					>
						＋ 追加
					</Button>
				</div>
			))}
		</div>
	);
}
