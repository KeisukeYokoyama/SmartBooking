/**
 * Smart Booking webpack 設定。
 *
 * @wordpress/scripts の既定設定を拡張し、admin / frontend の 2 エントリーポイントをビルドする。
 * 依存パッケージ（React, @wordpress/* など）は .asset.php 経由で WP に渡され、
 * CDN 読み込みは行わない（WordPress.org 審査ルール）。
 */
const defaultConfig = require( '@wordpress/scripts/config/webpack.config' );
const path = require( 'path' );

module.exports = {
	...defaultConfig,
	entry: {
		admin: path.resolve( __dirname, 'src/admin/index.js' ),
		frontend: path.resolve( __dirname, 'src/frontend/index.js' ),
	},
	output: {
		...defaultConfig.output,
		path: path.resolve( __dirname, 'build' ),
		filename: '[name].js',
	},
};
