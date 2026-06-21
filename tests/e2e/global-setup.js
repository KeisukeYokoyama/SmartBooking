/**
 * Playwright globalSetup。
 *
 * wp-env の CLI コンテナは並列呼び出しで race condition を起こすため、
 * DB スナップショットを 1 回だけ取得してファイルに書き出し、各テストで読む。
 */
const fs = require( 'node:fs' );
const path = require( 'node:path' );
const { listSmbTables, countRows, countSmbOptions } = require( './helpers' );

const SNAPSHOT_PATH = path.resolve( __dirname, '.db-snapshot.json' );

module.exports = async () => {
	const snapshot = {
		capturedAt: new Date().toISOString(),
		tables: listSmbTables(),
		storesCount: countRows( 'wp_smabo_stores' ),
		staffCount: countRows( 'wp_smabo_staff' ),
		customFieldsCount: countRows( 'wp_smabo_custom_fields' ),
		smbOptionsCount: countSmbOptions(),
	};
	fs.writeFileSync( SNAPSHOT_PATH, JSON.stringify( snapshot, null, 2 ) );
	// eslint-disable-next-line no-console
	console.log( '[globalSetup] DB snapshot written:', snapshot );
};

module.exports.SNAPSHOT_PATH = SNAPSHOT_PATH;
