/**
 * Smart Booking フロント予約フォーム React エントリーポイント。
 *
 * ショートコード `[smart_booking]` が出力する
 * `<div id="smart-booking-app" data-store-id="0"></div>` をマウント先とする。
 *
 * data-store-id が 0 以外のときはその店舗で固定し、店舗選択ステップをスキップする。
 */
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/frontend.css';

function bootstrap() {
	const container = document.getElementById('smart-booking-app');
	if (!container) return;
	const fixedStoreId = parseInt(container.getAttribute('data-store-id') || '0', 10) || 0;
	const root = createRoot(container);
	root.render(<App fixedStoreId={fixedStoreId} />);
}

if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', bootstrap);
} else {
	bootstrap();
}
