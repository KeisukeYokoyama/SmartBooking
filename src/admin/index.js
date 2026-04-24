/**
 * Smart Booking 管理画面 React エントリーポイント。
 *
 * `<div id="smart-booking-admin-app" data-page="...">` をマウント先とし、
 * data-page 属性から描画するページを決定する。
 */
import { createRoot } from 'react-dom/client';
import App from './App';
import './admin.scss';

function bootstrap() {
	const container = document.getElementById('smart-booking-admin-app');
	if (!container) return;
	const page = container.getAttribute('data-page') || 'schedule';
	const root = createRoot(container);
	root.render(<App page={page} />);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', bootstrap);
} else {
	bootstrap();
}
