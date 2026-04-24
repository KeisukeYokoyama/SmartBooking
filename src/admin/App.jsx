/**
 * Smart Booking 管理画面ルートコンポーネント。
 *
 * URL クエリ `page=...` の値（サーバが data-page 属性にセット）を受け取り、
 * 対応するページコンポーネントを描画する。SPA ルーティングは使わない。
 */
import { ToastProvider } from './components/ToastContainer';
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
	const version = (typeof window !== 'undefined' && window.smartBookingAdmin?.version) || '';

	return (
		<ToastProvider>
			<div className="smb-app">
				<header className="smb-app__header">
					<div className="smb-app__brand">
						<span className="smb-app__brand-mark" aria-hidden="true" />
						<span className="smb-app__brand-name">Smart Booking</span>
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
