/**
 * 予約ステータスのバッジ表示。
 *
 * 色だけに依存しない (a11y 配慮): アイコン + ラベル + role="status" を付与する。
 *
 * status: 'pending' | 'approved' | 'cancelled'
 */

const STATUS_META = {
	pending: {
		label: '承認待ち',
		modifier: 'pending',
		icon: '○',
	},
	approved: {
		label: '承認済み',
		modifier: 'approved',
		icon: '●',
	},
	cancelled: {
		label: 'キャンセル',
		modifier: 'cancelled',
		icon: '✕',
	},
};

export const STATUS_LABELS = Object.fromEntries(
	Object.entries(STATUS_META).map(([k, v]) => [k, v.label])
);

export const STATUS_OPTIONS = [
	{ value: 'pending', label: '承認待ち' },
	{ value: 'approved', label: '承認済み' },
	{ value: 'cancelled', label: 'キャンセル' },
];

export default function StatusBadge({ status, className = '' }) {
	const meta = STATUS_META[status] || {
		label: status || '不明',
		modifier: 'unknown',
		icon: '?',
	};
	return (
		<span
			className={`smb-status-badge smb-status-badge--${meta.modifier} ${className}`}
			role="status"
			aria-label={`ステータス: ${meta.label}`}
		>
			<span className="smb-status-badge__icon" aria-hidden="true">
				{meta.icon}
			</span>
			<span className="smb-status-badge__label">{meta.label}</span>
		</span>
	);
}
