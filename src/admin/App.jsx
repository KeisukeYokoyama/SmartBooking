/**
 * Smart Booking 管理画面ルートコンポーネント。
 *
 * URL クエリ `page=...` の値（サーバが data-page 属性にセット）を受け取り、
 * 対応するページコンポーネントを描画する。SPA ルーティングは使わない。
 */
import { ToastProvider } from './components/ToastContainer';
import logoSrc from './images/SmartBookingLogo.svg';
import FormSettingsPage from './pages/FormSettingsPage';
import ReservationsPage from './pages/ReservationsPage';
import SchedulePage from './pages/SchedulePage';
import SettingsPage from './pages/SettingsPage';
import StoresPage from './pages/StoresPage';

const PAGE_COMPONENTS = {
	schedule: SchedulePage,
	reservations: ReservationsPage,
	stores: StoresPage,
	'form-settings': FormSettingsPage,
	settings: SettingsPage,
};

export default function App({ page }) {
	const Component = PAGE_COMPONENTS[page] || SchedulePage;
	const adminCtx = (typeof window !== 'undefined' && window.smartBookingAdmin) || {};
	const version = adminCtx.version || '';

	return (
		<ToastProvider>
			<div className="smb-app">
				<header className="smb-app__header">
					<div className="smb-app__brand" aria-label="Smart Booking">
						<img
							src={logoSrc}
							alt="Smart Booking"
							className="smb-app__brand-logo"
						/>
					</div>
					{version && (
						<span className="smb-app__version" aria-label="プラグインバージョン">
							v{version}
						</span>
					)}
				</header>
				<main className="smb-app__main">
					<Component />
				</main>
			</div>
		</ToastProvider>
	);
}
