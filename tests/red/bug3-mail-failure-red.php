<?php
/**
 * Red reproduction (Step 1) for v0.2.3 BUG-3 (i): 送信失敗の可視化.
 *
 * READ-ONLY against product source. Injects a REAL wp_mail failure (unreachable SMTP
 * in phpmailer_init -> PHPMailer::send() throws -> WP core fires wp_mail_failed and
 * wp_mail() returns false), then drives the REAL reservation_received code path
 * (Smart_Booking_Integrations::on_received -> Smart_Booking_Email::send_receipt -> wp_mail),
 * and asserts the product records / surfaces the failure.
 *
 * Each red_expect() asserts the CORRECT (post-fix) behavior. On current (unfixed) code
 * these are violated -> "[FAIL][BUG REPRODUCED]". This is the intended Red.
 *
 * Run:
 *   npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/red/bug3-mail-failure-red.php
 *
 * The probe seeds mail templates, injects verification-only hooks, and RESTORES every
 * option + DELETEs every row it created. No product source is modified.
 */

global $wpdb;
wp_set_current_user( 1 );   // admin -> passes settings permission_check (manage_options).
rest_get_server();          // force rest_api_init so /settings route is registered.

$STORES = $wpdb->prefix . 'smart_booking_stores';
$STAFF  = $wpdb->prefix . 'smart_booking_staff';
$SCHED  = $wpdb->prefix . 'smart_booking_schedules';
$RESV   = $wpdb->prefix . 'smart_booking_reservations';

$fail = 0;
$pass = 0;
$info = 0;

function red_expect( $label, $cond, &$pass, &$fail ) {
	if ( $cond ) {
		echo "  [PASS] {$label}\n";
		$pass++;
	} else {
		echo "  [FAIL][BUG REPRODUCED] {$label}\n";
		$fail++;
	}
}
function env_check( $label, $cond, &$pass, &$fail ) {
	if ( $cond ) {
		echo "  [ENV-OK] {$label}\n";
		$pass++;
	} else {
		echo "  [ENV-FAIL] {$label}\n";
		$fail++;
	}
}
function note( $label, &$info ) {
	echo "  [INFO] {$label}\n";
	$info++;
}

$now  = current_time( 'mysql' );
$DATE = '2099-06-01';

// ---- capture original option state (sentinel distinguishes absent vs present) ----
$MAIL_KEYS = array(
	'smart_booking_mail_receipt_user_subject',
	'smart_booking_mail_receipt_user_body',
	'smart_booking_mail_receipt_admin_subject',
	'smart_booking_mail_receipt_admin_body',
	'smart_booking_mail_approval_user_subject',
	'smart_booking_mail_approval_user_body',
	'smart_booking_mail_admin_notify_enabled',
	'smart_booking_mail_from_email',
	'smart_booking_mail_from_name',
);
$orig = array();
foreach ( $MAIL_KEYS as $k ) {
	$orig[ $k ] = get_option( $k, '___MISSING___' );
}

// ---- seed NON-EMPTY templates so send() reaches wp_mail (not the :173 skip) ----
update_option( 'smart_booking_mail_receipt_user_subject', '[REDTEST] 受付 {customer_name}' );
update_option( 'smart_booking_mail_receipt_user_body', '{customer_name} 様 / {schedule_date} {schedule_time} を受け付けました。' );
update_option( 'smart_booking_mail_receipt_admin_subject', '[REDTEST] 管理者通知 #{reservation_id}' );
update_option( 'smart_booking_mail_receipt_admin_body', '予約 #{reservation_id} {store_name} {staff_name}' );
update_option( 'smart_booking_mail_admin_notify_enabled', 1 );
update_option( 'smart_booking_mail_from_email', 'from@example.com' );
update_option( 'smart_booking_mail_from_name', 'RedTest' );

// ---- clean any prior probe rows ----
$wpdb->query( "DELETE FROM {$RESV}  WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$SCHED} WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$STAFF} WHERE name LIKE 'REDMAIL-%'" );
$wpdb->query( "DELETE FROM {$STORES} WHERE name LIKE 'REDMAIL-%'" );
delete_transient( 'smart_booking_last_mail_error' );
delete_option( 'smart_booking_last_mail_error' );

// ---- test data (valid emails so the send path executes) ----
$wpdb->insert( $STORES, array(
	'name' => 'REDMAIL-Store', 'email' => 'store@example.com', 'is_active' => 1, 'is_system' => 0,
	'sort_order' => 0, 'created_at' => $now, 'updated_at' => $now,
) );
$store = (int) $wpdb->insert_id;
$wpdb->insert( $STAFF, array(
	'store_id' => $store, 'name' => 'REDMAIL-Staff', 'email' => 'staff@example.com', 'is_active' => 1,
	'is_system' => 0, 'sort_order' => 0, 'created_at' => $now, 'updated_at' => $now,
) );
$staff = (int) $wpdb->insert_id;
$wpdb->insert( $SCHED, array(
	'store_id' => $store, 'staff_id' => $staff, 'schedule_date' => $DATE,
	'start_time' => '10:00:00', 'end_time' => '11:00:00', 'capacity' => 1, 'booked_count' => 1,
	'is_active' => 1, 'created_at' => $now, 'updated_at' => $now,
) );
$sched = (int) $wpdb->insert_id;
$wpdb->insert( $RESV, array(
	'store_id' => $store, 'staff_id' => $staff, 'schedule_id' => $sched,
	'schedule_date' => $DATE, 'schedule_time' => '10:00:00',
	'customer_name' => 'RedCustomer', 'customer_email' => 'customer@example.com', 'customer_phone' => '000',
	'status' => 'pending', 'created_at' => $now, 'updated_at' => $now,
) );
$resv = (int) $wpdb->insert_id;

echo "SETUP store={$store} staff={$staff} sched={$sched} resv={$resv}\n";
echo str_repeat( '=', 72 ) . "\n";

// ---- verification-only hooks (removed automatically when this process ends) ----
$GLOBALS['redmail_mail_count']   = 0;   // wp_mail() invocations that reached transport.
$GLOBALS['redmail_failed_count'] = 0;   // wp_mail_failed action firings.
$GLOBALS['redmail_inject_fail']  = true;

add_filter( 'wp_mail', function ( $args ) {
	$GLOBALS['redmail_mail_count']++;
	return $args;
}, 10, 1 );

add_action( 'wp_mail_failed', function ( $err ) {
	$GLOBALS['redmail_failed_count']++;
}, 10, 1 );

// Force PHPMailer::send() to throw -> WP core catch fires wp_mail_failed, wp_mail() returns false.
add_action( 'phpmailer_init', function ( $phpmailer ) {
	if ( empty( $GLOBALS['redmail_inject_fail'] ) ) {
		return;
	}
	$phpmailer->Mailer      = 'smtp';
	$phpmailer->Host        = '127.0.0.1';
	$phpmailer->Port        = 2;      // nothing listening -> connection refused (instant).
	$phpmailer->Timeout     = 2;
	$phpmailer->SMTPAutoTLS = false;
	$phpmailer->SMTPKeepAlive = false;
} );

// =====================================================================
echo "[STEP 1] Drive REAL reservation_received path with wp_mail failing.\n";
// =====================================================================
$GLOBALS['redmail_mail_count']   = 0;
$GLOBALS['redmail_failed_count'] = 0;
do_action( 'smart_booking_reservation_received', $resv );

$attempts = (int) $GLOBALS['redmail_mail_count'];
$failed   = (int) $GLOBALS['redmail_failed_count'];
echo "  wp_mail attempts={$attempts}  wp_mail_failed fired={$failed}\n";

// ENV proof: the failure IS observable (info exists) — product just ignores it.
env_check( "ENV: wp_mail reached transport at least once (attempts={$attempts})", $attempts >= 1, $pass, $fail );
env_check( "ENV: wp_mail_failed fired -> failure is catchable (failed={$failed})", $failed >= 1, $pass, $fail );

// ---- Red-(a): product must RECORD the last mail failure ----
$rec_transient = get_transient( 'smart_booking_last_mail_error' );
$rec_option    = get_option( 'smart_booking_last_mail_error', '___MISSING___' );
echo "  smart_booking_last_mail_error: transient=" . var_export( $rec_transient, true )
	. "  option=" . var_export( $rec_option, true ) . "\n";
red_expect( "Red-(a) transient|option 'smart_booking_last_mail_error' is recorded after a failed send",
	( false !== $rec_transient ) || ( '___MISSING___' !== $rec_option ),
	$pass, $fail );

// ---- Red-(b): admin surface moved to new /mail-error route ----
$req = new WP_REST_Request( 'GET', '/smart-booking/v1/mail-error' );
$res = rest_do_request( $req );
$data = $res->get_data();
$surfaced = ( 200 === $res->get_status() ) && is_array( $data ) && array_key_exists( 'error', $data ) && is_array( $data['error'] );
echo "  GET /mail-error status=" . $res->get_status() . " data=" . var_export( $data, true ) . "
";
red_expect( "Red-(b) GET /mail-error surfaces a recorded mail failure (error != null)",
	$surfaced, $pass, $fail );

// ---- item 4: success-clear expectation (布石; N/A pre-fix, spec note only) ----
note( "EXPECT (post-fix, Step3 Green): a SUCCESSFUL send must clear/absent 'smart_booking_last_mail_error'.", $info );
note( "  -> pre-fix N/A: no recording mechanism exists, so nothing to clear yet.", $info );

// =====================================================================
echo str_repeat( '=', 72 ) . "\n";
echo "[STEP 2] Silent-skip triage: skips do NOT reach wp_mail -> invisible to wp_mail_failed.\n";
// =====================================================================
$email = new Smart_Booking_Email();

// Baseline: full valid, admin ON, store present -> BOTH user + admin mails attempted.
$GLOBALS['redmail_mail_count']   = 0;
$GLOBALS['redmail_failed_count'] = 0;
$ctx = Smart_Booking_Reservation_Context::build( $resv );
$email->send_receipt( $ctx );
$base_attempts = (int) $GLOBALS['redmail_mail_count'];
echo "  Baseline (user+admin): attempts={$base_attempts} failed={$GLOBALS['redmail_failed_count']}\n";
env_check( "ENV: baseline attempts == 2 (user + admin both sent)", 2 === $base_attempts, $pass, $fail );

// T1 — template empty (:173): blank user subject -> user mail silently skipped.
update_option( 'smart_booking_mail_receipt_user_subject', '' );
$GLOBALS['redmail_mail_count']   = 0;
$GLOBALS['redmail_failed_count'] = 0;
$ctx = Smart_Booking_Reservation_Context::build( $resv );
$email->send_receipt( $ctx );
$t1 = (int) $GLOBALS['redmail_mail_count'];
$t1f = (int) $GLOBALS['redmail_failed_count'];
echo "  T1 template-empty(:173): attempts={$t1} failed={$t1f}  (user dropped)\n";
red_expect( "TRIAGE T1 (:173 template empty): user mail silently dropped -> NOT surfaced by wp_mail_failed (attempts drop 2->1, dropped mail fires 0)",
	1 === $t1, $pass, $fail );
update_option( 'smart_booking_mail_receipt_user_subject', '[REDTEST] 受付 {customer_name}' );

// T2 — invalid recipient (:166 / :165): bad customer_email -> user mail silently skipped.
$GLOBALS['redmail_mail_count']   = 0;
$GLOBALS['redmail_failed_count'] = 0;
$ctx = Smart_Booking_Reservation_Context::build( $resv );
$ctx['formatted']['customer_email'] = 'not-an-email';   // fails is_email() in send().
$email->send_receipt( $ctx );
$t2 = (int) $GLOBALS['redmail_mail_count'];
$t2f = (int) $GLOBALS['redmail_failed_count'];
echo "  T2 invalid-recipient(:166): attempts={$t2} failed={$t2f}  (user dropped)\n";
red_expect( "TRIAGE T2 (:166 invalid recipient): user mail silently dropped -> NOT surfaced by wp_mail_failed (attempts==1)",
	1 === $t2, $pass, $fail );

// T3 — admin OFF x no store (:85): admin notice OFF + empty store email -> admin mail silently skipped.
update_option( 'smart_booking_mail_admin_notify_enabled', 0 );
$GLOBALS['redmail_mail_count']   = 0;
$GLOBALS['redmail_failed_count'] = 0;
$ctx = Smart_Booking_Reservation_Context::build( $resv );
$ctx['formatted']['store_email'] = '';   // no store email + admin OFF -> :85 return.
$email->send_receipt( $ctx );
$t3 = (int) $GLOBALS['redmail_mail_count'];
$t3f = (int) $GLOBALS['redmail_failed_count'];
echo "  T3 adminOFF-noStore(:85): attempts={$t3} failed={$t3f}  (admin dropped)\n";
red_expect( "TRIAGE T3 (:85 admin OFF x no store): admin mail silently dropped -> NOT surfaced by wp_mail_failed (attempts==1, user only)",
	1 === $t3, $pass, $fail );
update_option( 'smart_booking_mail_admin_notify_enabled', 1 );

note( "TRIAGE conclusion: none of the 3 skips reach wp_mail, so a wp_mail_failed-only fix leaves them invisible.", $info );
note( "  -> If skips are in-scope for visibility, Step2 needs a SEPARATE record at each skip point (:85/:166/:173).", $info );

// =====================================================================
// ---- restore & cleanup ----
// =====================================================================
$GLOBALS['redmail_inject_fail'] = false;
$wpdb->query( "DELETE FROM {$RESV}  WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$SCHED} WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$STAFF} WHERE name LIKE 'REDMAIL-%'" );
$wpdb->query( "DELETE FROM {$STORES} WHERE name LIKE 'REDMAIL-%'" );
delete_transient( 'smart_booking_last_mail_error' );
delete_option( 'smart_booking_last_mail_error' );

foreach ( $MAIL_KEYS as $k ) {
	if ( '___MISSING___' === $orig[ $k ] ) {
		delete_option( $k );          // was absent -> restore absence.
	} else {
		update_option( $k, $orig[ $k ] );
	}
}

echo str_repeat( '=', 72 ) . "\n";
echo "RESULT: PASS={$pass} FAIL={$fail} INFO={$info}\n";
echo ( $fail > 0 )
	? "==> BUG-3 (i) REPRODUCED: failure is neither recorded (Red-a) nor surfaced (Red-b).\n"
	: "==> No red assertions failed (post-fix expected).\n";
