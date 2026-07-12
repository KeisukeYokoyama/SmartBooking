<?php
/**
 * Red reproduction (Step 1) for v0.2.3 BUG-1/2 (copy scope leak) + BUG-4 (missing UNIQUE) + orphan invariant.
 *
 * READ-ONLY against product source. Exercises the REAL REST code paths
 * (Smart_Booking_REST_Schedules::copy_schedules / create_item) via rest_do_request(),
 * and asserts via direct DB queries. Run with:
 *   npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/red/bug124-red.php
 *
 * Each scenario asserts the CORRECT (post-fix) behavior. On current (unfixed) code
 * these assertions are violated -> "BUG REPRODUCED". This is the intended Red.
 */

global $wpdb;
wp_set_current_user( 1 ); // admin -> passes permission_check (manage_options).
rest_get_server();        // force rest_api_init so /schedules routes are registered.

$SCHED  = $wpdb->prefix . 'smart_booking_schedules';
$STORES = $wpdb->prefix . 'smart_booking_stores';
$STAFF  = $wpdb->prefix . 'smart_booking_staff';
$RESV   = $wpdb->prefix . 'smart_booking_reservations';

$fail = 0;
$pass = 0;
function assert_eq( $label, $expected, $actual, &$fail, &$pass ) {
	if ( (string) $expected === (string) $actual ) {
		echo "  [PASS] {$label}: expected={$expected} actual={$actual}\n";
		$pass++;
	} else {
		echo "  [FAIL][BUG REPRODUCED] {$label}: expected={$expected} actual={$actual}\n";
		$fail++;
	}
}

$now = current_time( 'mysql' );

// ---- test data ids/dates (far future to avoid colliding with real data) ----
$DATES = array(
	'2099-03-01','2099-03-02','2099-03-03','2099-03-04',
	'2099-03-10','2099-03-11','2099-03-12','2099-03-13',
);

// insert helpers -------------------------------------------------------------
function ins_store( $wpdb, $STORES, $name, $now ) {
	$wpdb->insert( $STORES, array(
		'name' => $name, 'is_active' => 1, 'is_system' => 0, 'sort_order' => 0,
		'created_at' => $now, 'updated_at' => $now,
	) );
	return (int) $wpdb->insert_id;
}
function ins_staff( $wpdb, $STAFF, $store_id, $name, $now ) {
	$wpdb->insert( $STAFF, array(
		'store_id' => $store_id, 'name' => $name, 'is_active' => 1, 'is_system' => 0, 'sort_order' => 0,
		'created_at' => $now, 'updated_at' => $now,
	) );
	return (int) $wpdb->insert_id;
}
function ins_sched( $wpdb, $SCHED, $store, $staff, $date, $start, $end, $cap, $booked, $now ) {
	$wpdb->insert( $SCHED, array(
		'store_id' => $store, 'staff_id' => $staff, 'schedule_date' => $date,
		'start_time' => $start, 'end_time' => $end, 'capacity' => $cap,
		'booked_count' => $booked, 'is_active' => 1, 'created_at' => $now, 'updated_at' => $now,
	) );
	return (int) $wpdb->insert_id;
}
function ins_resv( $wpdb, $RESV, $store, $staff, $sched_id, $date, $time, $status, $now ) {
	$wpdb->insert( $RESV, array(
		'store_id' => $store, 'staff_id' => $staff, 'schedule_id' => $sched_id,
		'schedule_date' => $date, 'schedule_time' => $time,
		'customer_name' => 'Test', 'customer_email' => 't@example.com', 'customer_phone' => '0',
		'status' => $status, 'created_at' => $now, 'updated_at' => $now,
	) );
	return (int) $wpdb->insert_id;
}
function cnt( $wpdb, $sql ) { return (int) $wpdb->get_var( $sql ); }

function do_copy( $source_date, $store_id, $staff_id, $targets, $overwrite ) {
	$req = new WP_REST_Request( 'POST', '/smart-booking/v1/schedules/copy' );
	$req->set_header( 'Content-Type', 'application/json' );
	$body = array(
		'source_date'  => $source_date,
		'store_id'     => $store_id,
		'staff_id'     => $staff_id,
		'target_dates' => $targets,
		'overwrite'    => $overwrite,
	);
	$req->set_body( wp_json_encode( $body ) );
	$res = rest_do_request( $req );
	return $res->get_data();
}

// ---- clean any prior test rows on these dates + prior test stores/staff ----
$in_dates = "'" . implode( "','", $DATES ) . "'";
$wpdb->query( "DELETE FROM {$RESV} WHERE schedule_date IN ({$in_dates})" );
$wpdb->query( "DELETE FROM {$SCHED} WHERE schedule_date IN ({$in_dates})" );
$wpdb->query( "DELETE FROM {$STAFF} WHERE name LIKE 'REDTEST-%'" );
$wpdb->query( "DELETE FROM {$STORES} WHERE name LIKE 'REDTEST-%'" );

// ---- setup stores/staff ----
$storeA = ins_store( $wpdb, $STORES, 'REDTEST-StoreA', $now );
$storeB = ins_store( $wpdb, $STORES, 'REDTEST-StoreB', $now );
$staffA = ins_staff( $wpdb, $STAFF, $storeA, 'REDTEST-StaffA', $now );
$staffB = ins_staff( $wpdb, $STAFF, $storeB, 'REDTEST-StaffB', $now );
$staffY = ins_staff( $wpdb, $STAFF, $storeA, 'REDTEST-StaffY', $now ); // 2nd staff of store A

echo "SETUP storeA={$storeA} storeB={$storeB} staffA={$staffA} staffB={$staffB} staffY={$staffY}\n";
echo str_repeat( '=', 70 ) . "\n";

/* ============================================================
 * Red-A : overwrite=ON, store isolation
 *   TGT already has Store B's UNBOOKED slot; copy Store A into TGT.
 *   Correct: Store B's slot must survive.
 * ============================================================ */
echo "[Red-A] overwrite=ON store isolation\n";
$srcA = '2099-03-01'; $tgtA = '2099-03-10';
ins_sched( $wpdb, $SCHED, $storeA, $staffA, $srcA, '10:00:00', '11:00:00', 1, 0, $now ); // source
ins_sched( $wpdb, $SCHED, $storeB, $staffB, $tgtA, '14:00:00', '15:00:00', 1, 0, $now ); // other-store slot on target
$b_before = cnt( $wpdb, "SELECT COUNT(*) FROM {$SCHED} WHERE store_id={$storeB} AND staff_id={$staffB} AND schedule_date='{$tgtA}'" );
$resp = do_copy( $srcA, $storeA, $staffA, array( $tgtA ), true );
$b_after = cnt( $wpdb, "SELECT COUNT(*) FROM {$SCHED} WHERE store_id={$storeB} AND staff_id={$staffB} AND schedule_date='{$tgtA}'" );
echo '  copy resp=' . wp_json_encode( $resp ) . "  (B before={$b_before})\n";
assert_eq( 'StoreB unbooked slot on target survives overwrite', 1, $b_after, $fail, $pass );

/* ============================================================
 * Red-B : overwrite=OFF, store isolation
 *   TGT already has Store A's slot; copy Store B into TGT with overwrite=false.
 *   Correct: Store B's slot IS created (its own scope was empty on target).
 * ============================================================ */
echo "[Red-B] overwrite=OFF store isolation\n";
$srcB = '2099-03-02'; $tgtB = '2099-03-11';
ins_sched( $wpdb, $SCHED, $storeB, $staffB, $srcB, '09:00:00', '10:00:00', 1, 0, $now ); // source (store B)
ins_sched( $wpdb, $SCHED, $storeA, $staffA, $tgtB, '13:00:00', '14:00:00', 1, 0, $now ); // other-store slot on target
$resp = do_copy( $srcB, $storeB, $staffB, array( $tgtB ), false );
$b_created = cnt( $wpdb, "SELECT COUNT(*) FROM {$SCHED} WHERE store_id={$storeB} AND staff_id={$staffB} AND schedule_date='{$tgtB}'" );
echo '  copy resp=' . wp_json_encode( $resp ) . "\n";
assert_eq( 'StoreB slot IS created on target despite other-store row (overwrite=off)', 1, $b_created, $fail, $pass );

/* ============================================================
 * Staff version : single store A, staff X(=staffA) vs Y(=staffY), overwrite=ON
 *   TGT has Staff Y's unbooked slot; copy Staff X into TGT overwrite=true.
 *   Correct: Staff Y's slot must survive.
 * ============================================================ */
echo "[Red-Staff] single store, overwrite=ON staff isolation\n";
$srcS = '2099-03-03'; $tgtS = '2099-03-12';
ins_sched( $wpdb, $SCHED, $storeA, $staffA, $srcS, '10:00:00', '11:00:00', 1, 0, $now ); // source staff X
ins_sched( $wpdb, $SCHED, $storeA, $staffY, $tgtS, '16:00:00', '17:00:00', 1, 0, $now ); // staff Y slot on target
$resp = do_copy( $srcS, $storeA, $staffA, array( $tgtS ), true );
$y_after = cnt( $wpdb, "SELECT COUNT(*) FROM {$SCHED} WHERE store_id={$storeA} AND staff_id={$staffY} AND schedule_date='{$tgtS}'" );
echo '  copy resp=' . wp_json_encode( $resp ) . "\n";
assert_eq( 'StaffY unbooked slot survives StaffX overwrite copy', 1, $y_after, $fail, $pass );

/* ============================================================
 * BUG-4 : duplicate (store,staff,date,start_time) created via copy over a booked slot
 *   TGT has Store A/Staff A BOOKED slot 10:00 (protected). Copy A's 10:00 source with overwrite=ON.
 *   overwrite DELETE only removes booked_count=0 -> booked slot stays, source re-inserted
 *   -> TWO rows for identical key. Correct: exactly 1 row per key.
 * ============================================================ */
echo "[Red-BUG4] duplicate key row via copy over booked slot\n";
$srcD = '2099-03-04'; $tgtD = '2099-03-13';
ins_sched( $wpdb, $SCHED, $storeA, $staffA, $srcD, '10:00:00', '11:00:00', 2, 0, $now ); // source (cap 2)
$booked_id = ins_sched( $wpdb, $SCHED, $storeA, $staffA, $tgtD, '10:00:00', '11:00:00', 2, 1, $now ); // pre-existing BOOKED slot on target
ins_resv( $wpdb, $RESV, $storeA, $staffA, $booked_id, $tgtD, '10:00:00', 'confirmed', $now ); // R1 -> booked slot (non-cancelled)
$resp = do_copy( $srcD, $storeA, $staffA, array( $tgtD ), true );
$dup_rows = cnt( $wpdb, "SELECT COUNT(*) FROM {$SCHED} WHERE store_id={$storeA} AND staff_id={$staffA} AND schedule_date='{$tgtD}' AND start_time='10:00:00'" );
echo '  copy resp=' . wp_json_encode( $resp ) . "\n";
assert_eq( 'exactly ONE schedule row per (store,staff,date,start_time)', 1, $dup_rows, $fail, $pass );

// collect the freshly-copied duplicate row id (the booked_count=0 one, id != booked_id)
$copied_id = (int) $wpdb->get_var( "SELECT id FROM {$SCHED} WHERE store_id={$storeA} AND staff_id={$staffA} AND schedule_date='{$tgtD}' AND start_time='10:00:00' AND id<>{$booked_id} ORDER BY id ASC LIMIT 1" );
echo "  booked_slot_id={$booked_id} copied_dup_id={$copied_id}\n";

/* ============================================================
 * Orphan / consistency invariant (補強1)
 *   A booking lands on the phantom duplicate slot (R2 -> copied_id).
 *   Then check post-collapse health invariants that MUST hold in a correct system:
 *     INV-1: no duplicate key groups
 *     INV-2: every schedule row's booked_count == its own non-cancelled reservation count
 *     INV-3: a naive collapse (keep MIN(id) per key) leaves ZERO orphan reservations
 * ============================================================ */
echo "[Red-Orphan] duplicate slot causes booked_count drift + would-orphan on collapse\n";
if ( $copied_id > 0 ) {
	ins_resv( $wpdb, $RESV, $storeA, $staffA, $copied_id, $tgtD, '10:00:00', 'confirmed', $now ); // R2 -> phantom duplicate
}
// INV-1: duplicate key groups across the whole schedules table (should be 0).
$dup_groups = cnt( $wpdb, "SELECT COUNT(*) FROM (SELECT 1 FROM {$SCHED} GROUP BY store_id,staff_id,schedule_date,start_time HAVING COUNT(*)>1) t" );
assert_eq( 'INV-1 duplicate key groups in schedules == 0', 0, $dup_groups, $fail, $pass );

// INV-2: rows whose booked_count != non-cancelled reservation count for that schedule_id (should be 0).
$mismatch = cnt( $wpdb, "SELECT COUNT(*) FROM {$SCHED} s WHERE s.schedule_date='{$tgtD}' AND s.start_time='10:00:00' AND s.booked_count <> ( SELECT COUNT(*) FROM {$RESV} r WHERE r.schedule_id=s.id AND r.status<>'cancelled' )" );
assert_eq( 'INV-2 booked_count matches non-cancelled reservations (target group)', 0, $mismatch, $fail, $pass );

// INV-3: simulate naive collapse keep MIN(id) per key -> count reservations that would point to a removed dup id.
$survivor = (int) $wpdb->get_var( "SELECT MIN(id) FROM {$SCHED} WHERE store_id={$storeA} AND staff_id={$staffA} AND schedule_date='{$tgtD}' AND start_time='10:00:00'" );
$removed_ids = $wpdb->get_col( "SELECT id FROM {$SCHED} WHERE store_id={$storeA} AND staff_id={$staffA} AND schedule_date='{$tgtD}' AND start_time='10:00:00' AND id<>{$survivor}" );
$orphans = 0;
if ( ! empty( $removed_ids ) ) {
	$in = implode( ',', array_map( 'intval', $removed_ids ) );
	$orphans = cnt( $wpdb, "SELECT COUNT(*) FROM {$RESV} WHERE schedule_id IN ({$in})" );
}
assert_eq( 'INV-3 orphan reservations after naive dedup collapse == 0', 0, $orphans, $fail, $pass );

echo str_repeat( '=', 70 ) . "\n";
echo "SUMMARY: PASS={$pass} FAIL(BUG REPRODUCED)={$fail}\n";

// ---- cleanup: restore environment (remove all test data) ----
$wpdb->query( "DELETE FROM {$RESV} WHERE schedule_date IN ({$in_dates})" );
$wpdb->query( "DELETE FROM {$SCHED} WHERE schedule_date IN ({$in_dates})" );
$wpdb->query( "DELETE FROM {$STAFF} WHERE name LIKE 'REDTEST-%'" );
$wpdb->query( "DELETE FROM {$STORES} WHERE name LIKE 'REDTEST-%'" );
echo "CLEANUP done.\n";
