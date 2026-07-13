<?php
/**
 * Step3 GREEN verification for BUG-3 (i) 送信失敗の可視化.
 * READ-ONLY against product source. Drives real paths and asserts POST-FIX behavior.
 * Covers A: Red-(a) transient, Red-(b) GET /mail-error, success-clear, T1/T2 record,
 * T3 non-record, DELETE /mail-error, authorization. Plus D: /settings contract intact.
 *
 * Run: npx wp-env run cli wp eval-file wp-content/plugins/smart-booking/tests/red/bug3-mail-green-verify.php
 */
global $wpdb;
wp_set_current_user( 1 );
rest_get_server();

$STORES = $wpdb->prefix . 'smart_booking_stores';
$STAFF  = $wpdb->prefix . 'smart_booking_staff';
$SCHED  = $wpdb->prefix . 'smart_booking_schedules';
$RESV   = $wpdb->prefix . 'smart_booking_reservations';
$KEY    = 'smart_booking_last_mail_error';

$pass = 0; $fail = 0;
function ok( $label, $cond, &$pass, &$fail ) {
	if ( $cond ) { echo "  [PASS] {$label}\n"; $pass++; }
	else { echo "  [FAIL] {$label}\n"; $fail++; }
}

$now = current_time( 'mysql' );
$DATE = '2099-06-02';

$MAIL_KEYS = array(
	'smart_booking_mail_receipt_user_subject','smart_booking_mail_receipt_user_body',
	'smart_booking_mail_receipt_admin_subject','smart_booking_mail_receipt_admin_body',
	'smart_booking_mail_admin_notify_enabled','smart_booking_mail_from_email','smart_booking_mail_from_name',
);
$orig = array();
foreach ( $MAIL_KEYS as $k ) { $orig[ $k ] = get_option( $k, '___MISSING___' ); }

update_option( 'smart_booking_mail_receipt_user_subject', '[GREEN] 受付 {customer_name}' );
update_option( 'smart_booking_mail_receipt_user_body', '{customer_name} 様 {schedule_date} {schedule_time}' );
update_option( 'smart_booking_mail_receipt_admin_subject', '[GREEN] 通知 #{reservation_id}' );
update_option( 'smart_booking_mail_receipt_admin_body', '予約 #{reservation_id} {store_name}' );
update_option( 'smart_booking_mail_admin_notify_enabled', 1 );
update_option( 'smart_booking_mail_from_email', 'from@example.com' );
update_option( 'smart_booking_mail_from_name', 'Green' );

$wpdb->query( "DELETE FROM {$RESV}  WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$SCHED} WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$STAFF} WHERE name LIKE 'GREENMAIL-%'" );
$wpdb->query( "DELETE FROM {$STORES} WHERE name LIKE 'GREENMAIL-%'" );
delete_transient( $KEY );

$wpdb->insert( $STORES, array( 'name'=>'GREENMAIL-Store','email'=>'store@example.com','is_active'=>1,'is_system'=>0,'sort_order'=>0,'created_at'=>$now,'updated_at'=>$now ) );
$store = (int) $wpdb->insert_id;
$wpdb->insert( $STAFF, array( 'store_id'=>$store,'name'=>'GREENMAIL-Staff','email'=>'staff@example.com','is_active'=>1,'is_system'=>0,'sort_order'=>0,'created_at'=>$now,'updated_at'=>$now ) );
$staff = (int) $wpdb->insert_id;
$wpdb->insert( $SCHED, array( 'store_id'=>$store,'staff_id'=>$staff,'schedule_date'=>$DATE,'start_time'=>'10:00:00','end_time'=>'11:00:00','capacity'=>1,'booked_count'=>1,'is_active'=>1,'created_at'=>$now,'updated_at'=>$now ) );
$sched = (int) $wpdb->insert_id;
$wpdb->insert( $RESV, array( 'store_id'=>$store,'staff_id'=>$staff,'schedule_id'=>$sched,'schedule_date'=>$DATE,'schedule_time'=>'10:00:00','customer_name'=>'GreenCustomer','customer_email'=>'customer@example.com','customer_phone'=>'000','status'=>'pending','created_at'=>$now,'updated_at'=>$now ) );
$resv = (int) $wpdb->insert_id;

$GLOBALS['gm_inject_fail'] = true;
add_action( 'phpmailer_init', function ( $pm ) {
	if ( empty( $GLOBALS['gm_inject_fail'] ) ) { return; }
	$pm->Mailer='smtp'; $pm->Host='127.0.0.1'; $pm->Port=2; $pm->Timeout=2; $pm->SMTPAutoTLS=false; $pm->SMTPKeepAlive=false;
} );

function get_err() {
	$req = new WP_REST_Request( 'GET', '/smart-booking/v1/mail-error' );
	$res = rest_do_request( $req );
	return array( $res->get_status(), $res->get_data() );
}

echo str_repeat( '=', 72 ) . "\n[A-(a)(b)] failure injected -> real reservation_received path\n";
delete_transient( $KEY );
$GLOBALS['gm_inject_fail'] = true;
do_action( 'smart_booking_reservation_received', $resv );
$rec = get_transient( $KEY );
echo "  transient=" . var_export( $rec, true ) . "\n";
ok( "A-(a) transient '{$KEY}' recorded after failed send", is_array( $rec ), $pass, $fail );
ok( "A-(a) category == transport_failed", is_array($rec) && 'transport_failed' === ($rec['category']??''), $pass, $fail );
list( $st, $d ) = get_err();
echo "  GET /mail-error status={$st} data=" . var_export( $d, true ) . "\n";
$e = ( is_array($d) && isset($d['error']) ) ? $d['error'] : '__none__';
ok( "A-(b) GET /mail-error status 200", 200 === $st, $pass, $fail );
ok( "A-(b) GET /mail-error error != null", is_array( $e ), $pass, $fail );
ok( "A-(b) error has time/category/reason/to_type", is_array($e) && isset($e['time'],$e['category'],$e['reason'],$e['to_type']), $pass, $fail );
ok( "A-(b) error.category == transport_failed", is_array($e) && 'transport_failed' === $e['category'], $pass, $fail );

echo str_repeat( '=', 72 ) . "\n[success-clear] wp_mail forced true -> record cleared\n";
$GLOBALS['gm_inject_fail'] = false;
set_transient( $KEY, array('time'=>time(),'category'=>'transport_failed','reason'=>'stale','to_type'=>'user'), 3600 );
add_filter( 'pre_wp_mail', '__return_true', 99 );
update_option( 'smart_booking_mail_admin_notify_enabled', 0 );
$email = new Smart_Booking_Email();
$ctx = Smart_Booking_Reservation_Context::build( $resv );
$ctx['formatted']['store_email'] = ''; // admin OFF + no store -> admin path silent; only user sends & succeeds.
$email->send_receipt( $ctx );
remove_filter( 'pre_wp_mail', '__return_true', 99 );
$rec = get_transient( $KEY );
list( $st, $d ) = get_err();
echo "  after success transient=" . var_export( $rec, true ) . " GET.error=" . var_export( $d['error']??'?', true ) . "\n";
ok( "success clears transient (誤検知防止)", false === $rec, $pass, $fail );
ok( "success -> GET /mail-error error:null", is_array($d) && null === $d['error'], $pass, $fail );
update_option( 'smart_booking_mail_admin_notify_enabled', 1 );

echo str_repeat( '=', 72 ) . "\n[T1] empty template -> skipped_empty_template\n";
delete_transient( $KEY );
update_option( 'smart_booking_mail_admin_notify_enabled', 0 );
update_option( 'smart_booking_mail_receipt_user_subject', '' ); // user subject empty
$ctx = Smart_Booking_Reservation_Context::build( $resv );
$ctx['formatted']['store_email'] = ''; // admin silent
$email->send_receipt( $ctx );
$rec = get_transient( $KEY );
echo "  T1 transient=" . var_export( $rec, true ) . "\n";
ok( "T1 category == skipped_empty_template", is_array($rec) && 'skipped_empty_template' === ($rec['category']??''), $pass, $fail );
update_option( 'smart_booking_mail_receipt_user_subject', '[GREEN] 受付 {customer_name}' );

echo str_repeat( '=', 72 ) . "\n[T2] invalid recipient -> skipped_invalid_recipient\n";
delete_transient( $KEY );
$ctx = Smart_Booking_Reservation_Context::build( $resv );
$ctx['formatted']['customer_email'] = 'not-an-email';
$ctx['formatted']['store_email'] = ''; // admin silent
$email->send_receipt( $ctx );
$rec = get_transient( $KEY );
echo "  T2 transient=" . var_export( $rec, true ) . "\n";
ok( "T2 category == skipped_invalid_recipient", is_array($rec) && 'skipped_invalid_recipient' === ($rec['category']??''), $pass, $fail );

echo str_repeat( '=', 72 ) . "\n[T3] admin OFF x no store -> NOT recorded (intentional silence)\n";
delete_transient( $KEY );
add_filter( 'pre_wp_mail', '__return_true', 99 ); // make user send succeed deterministically
$ctx = Smart_Booking_Reservation_Context::build( $resv ); // valid user template+email
$ctx['formatted']['store_email'] = ''; // admin OFF (set above) + no store -> :117 return, NO record
$email->send_receipt( $ctx );
remove_filter( 'pre_wp_mail', '__return_true', 99 );
$rec = get_transient( $KEY );
echo "  T3 transient=" . var_export( $rec, true ) . "\n";
ok( "T3 admin-OFF-no-store produced NO admin skip record", false === $rec || 'admin' !== ($rec['to_type']??''), $pass, $fail );
update_option( 'smart_booking_mail_admin_notify_enabled', 1 );

echo str_repeat( '=', 72 ) . "\n[DELETE] dismiss clears record\n";
set_transient( $KEY, array('time'=>time(),'category'=>'transport_failed','reason'=>'x','to_type'=>'user'), 3600 );
$req = new WP_REST_Request( 'DELETE', '/smart-booking/v1/mail-error' );
$res = rest_do_request( $req );
echo "  DELETE status=" . $res->get_status() . " data=" . var_export( $res->get_data(), true ) . "\n";
$ddata = $res->get_data();
ok( "DELETE status 200 & error:null", 200 === $res->get_status() && is_array($ddata) && array_key_exists('error',$ddata) && null === $ddata['error'], $pass, $fail );
list( $st, $d ) = get_err();
ok( "after DELETE GET /mail-error error:null", is_array($d) && null === $d['error'], $pass, $fail );

echo str_repeat( '=', 72 ) . "\n[authz] no manage_options -> 401/403\n";
wp_set_current_user( 0 );
$g = rest_do_request( new WP_REST_Request( 'GET', '/smart-booking/v1/mail-error' ) );
$del = rest_do_request( new WP_REST_Request( 'DELETE', '/smart-booking/v1/mail-error' ) );
echo "  GET status=" . $g->get_status() . " DELETE status=" . $del->get_status() . "\n";
ok( "GET /mail-error unauth -> 401/403", in_array( $g->get_status(), array(401,403), true ), $pass, $fail );
ok( "DELETE /mail-error unauth -> 401/403", in_array( $del->get_status(), array(401,403), true ), $pass, $fail );
wp_set_current_user( 1 );

echo str_repeat( '=', 72 ) . "\n[D] /settings contract intact (no mail_error leakage)\n";
$sreq = rest_do_request( new WP_REST_Request( 'GET', '/smart-booking/v1/settings' ) );
$sdata = $sreq->get_data();
$skeys = ( is_array($sdata) && isset($sdata['settings']) && is_array($sdata['settings']) ) ? array_keys($sdata['settings']) : array();
$leak = false;
foreach ( $skeys as $k ) { if ( false !== stripos($k,'mail_error') || false !== stripos($k,'last_mail') ) { $leak = true; } }
echo "  /settings key count=" . count($skeys) . " status=" . $sreq->get_status() . "\n";
ok( "D /settings status 200 & 'settings' array non-empty", 200 === $sreq->get_status() && count($skeys) > 0, $pass, $fail );
ok( "D /settings does NOT leak mail_error/last_mail key (contract unchanged)", ! $leak, $pass, $fail );
ok( "D /mail-error response shape == { error } only", is_array($d) && array( 'error' ) === array_keys( $d ), $pass, $fail );

// cleanup
$GLOBALS['gm_inject_fail'] = false;
$wpdb->query( "DELETE FROM {$RESV}  WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$SCHED} WHERE schedule_date = '{$DATE}'" );
$wpdb->query( "DELETE FROM {$STAFF} WHERE name LIKE 'GREENMAIL-%'" );
$wpdb->query( "DELETE FROM {$STORES} WHERE name LIKE 'GREENMAIL-%'" );
delete_transient( $KEY );
foreach ( $MAIL_KEYS as $k ) {
	if ( '___MISSING___' === $orig[ $k ] ) { delete_option( $k ); } else { update_option( $k, $orig[ $k ] ); }
}
echo str_repeat( '=', 72 ) . "\nGREEN RESULT: PASS={$pass} FAIL={$fail}\n";
echo ( 0 === $fail ) ? "==> ALL GREEN\n" : "==> {$fail} ASSERTIONS FAILED\n";
