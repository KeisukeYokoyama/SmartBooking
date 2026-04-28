/**
 * 設定ページ - サポートタブ。
 *
 * spec 4.7 に従い、控えめで自然な導線のみ配置する。
 * - 使い方ガイド（リンク）
 * - よくある質問（リンク）
 * - カスタマイズ相談（自社サイトへの CTA）
 */
import Button from '../../components/Button';

const SUPPORT_SITE = 'https://www.wp-smart-booking.com/';
const GUIDE_URL = `${SUPPORT_SITE}help/`;
const FAQ_URL = `${SUPPORT_SITE}#faq`;
const CONTACT_URL = `${SUPPORT_SITE}contact/`;

export default function SupportTab() {
	return (
		<div className="smb-settings-form">
			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">ヘルプ</h3>
					<p className="smb-settings-section__lead">
						Smart Booking の使い方や、よくある質問にお困りの際はご参照ください。
					</p>
				</div>

				<div className="smb-support-links">
					<a
						className="smb-support-card"
						href={GUIDE_URL}
						target="_blank"
						rel="noopener noreferrer"
					>
						<div className="smb-support-card__icon" aria-hidden="true">
							📘
						</div>
						<div className="smb-support-card__body">
							<div className="smb-support-card__title">使い方ガイド</div>
							<p className="smb-support-card__desc">
								基本的な設定方法、予約フロー、カスタムフィールドの使い方を解説しています。
							</p>
						</div>
					</a>
					<a
						className="smb-support-card"
						href={FAQ_URL}
						target="_blank"
						rel="noopener noreferrer"
					>
						<div className="smb-support-card__icon" aria-hidden="true">
							💡
						</div>
						<div className="smb-support-card__body">
							<div className="smb-support-card__title">よくある質問</div>
							<p className="smb-support-card__desc">
								メールが届かない、予約が重複してしまう等、よくあるトラブルの解決方法。
							</p>
						</div>
					</a>
				</div>
			</div>

			<div className="smb-settings-section">
				<div className="smb-settings-section__header">
					<h3 className="smb-settings-section__title">カスタマイズ相談</h3>
					<p className="smb-settings-section__lead">
						機能追加・独自カスタマイズ・導入支援などのご相談は、
						開発元の株式会社リベルダージがお受けしています。お困りの際はお気軽にご相談ください。
					</p>
				</div>
				<div className="smb-support-cta">
					<div className="smb-support-cta__text">
						<p>
							Smart Booking は、株式会社リベルダージが開発・提供する完全無料のWordPress予約プラグインです。
						</p>
						<p>
							「この機能を追加したい」「自社に合わせた調整をしたい」といったご要望があれば、
							個別のカスタマイズ案件としてお手伝いできます。
						</p>
					</div>
					<div className="smb-support-cta__actions">
						<Button
							variant="primary"
							onClick={() => {
								window.open(CONTACT_URL, '_blank', 'noopener,noreferrer');
							}}
						>
							公式サイトで相談する
						</Button>
					</div>
				</div>

				<p className="smb-support-note">
					開発元：株式会社リベルダージ（<a
						href="https://www.liberdade-inc.com/"
						target="_blank"
						rel="noopener noreferrer"
					>
						liberdade-inc.com
					</a>
					）／サービスサイト：
					<a href={SUPPORT_SITE} target="_blank" rel="noopener noreferrer">
						wp-smart-booking.com
					</a>
				</p>
			</div>
		</div>
	);
}
