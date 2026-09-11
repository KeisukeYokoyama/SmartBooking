=== Smart Booking ===
Contributors: liberdadeinc
Tags: booking, reservation, appointment, calendar, schedule
Requires at least: 6.0
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.5.6
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Free, full-featured WordPress booking plugin. Built for consultation-style appointments with a 3-step flow (input, confirm, done).

== Description ==

Smart Booking is a completely free WordPress booking plugin built specifically for consultation-style appointments tied to a person (a staff member). It is designed for use cases such as lawyers, certified professionals, marriage agencies, chiropractic clinics, and tutoring schools.

= Key Features =

* **Completely free, no limits** — There is no Pro version, no paid add-ons, and no license activation. Every feature is free.
* **Ready in 5 minutes** — Activating the plugin auto-creates a default store, staff member, and the three core fields (name, email, phone). Just paste the `[smart_booking]` shortcode into a post or page to display the booking form.
* **Optimized for the Japanese booking flow** — A 3-step flow ("input → confirmation → done") that lets the customer review their entries on a dedicated confirmation screen before finalizing the booking.
* **Multi-store / multi-staff management** — Manage schedules per store and per staff member. Whether the store-select and staff-select steps are shown to customers is automatically decided by how many active records exist (skipped when there is only one).
* **Flexible schedule configuration** — Time slots in 30 / 60 / 90 / 120-minute units, capacity per slot, weekday-pattern bulk copy, and an option to overwrite existing schedules.
* **Calendar display modes** — Choose between day view (horizontal scroll), month view (calendar grid), or a toggle between both, configurable from the admin screen.
* **Custom fields** — In addition to the three built-in fields (name, email, phone), administrators can add text, email, phone, textarea, select, radio, and checkbox fields.
* **Email notifications** — Automatic emails are sent to the customer and the administrator when a booking is received, and a confirmation email is sent to the customer on approval. All templates are editable from the admin screen.
* **Design customization** — Button color, date-selection color, time-slot color, required-mark color, and focus color are all configurable from the admin screen.
* **Concurrent booking protection** — Capacity is enforced through a single atomic SQL UPDATE, preventing double-bookings when multiple users submit at the same moment.
* **Google Tag Manager (GTM) integration** — Each booking step (`store_select`, `staff_select`, `date_select`, `time_select`, `form_input`, `confirm`, `complete`) is automatically pushed to `window.dataLayer`, so you can wire up GA4 funnels and Google Ads conversion tags through GTM without writing any code. The GTM container tag itself must be installed separately on your site.
* **WordPress.org guideline compliant** — No external CDN scripts/styles, no PHP sessions, all queries use `$wpdb->prepare()`, all output is escaped, and every REST endpoint enforces nonce + `current_user_can('manage_options')`.

= Supported booking flow =

[Store Select] → [Staff Select] → [Date Select] → [Time Select] → [Form Input] → [Confirmation] → [Done]

The store-select and staff-select steps are shown only when more than one active store / staff record exists. With a single store and a single staff member, the customer starts directly from date selection.

= Optional integrations (off by default) =

The following external integrations are **off by default**. They only initiate any outbound traffic after an administrator explicitly enables them on the "Integrations" tab and provides the required credentials (API key, etc.).

* **Google Calendar integration** — Creates a calendar event when a booking is received and deletes it on cancellation.
* **ChatWork notifications** — Posts a notification message to a designated ChatWork room when a booking is received.

See the "External services" section below for full details.

= Customization & feature requests =

For feature requests and customization inquiries, please contact the developer, [Liberdade Inc.](https://www.liberdade-inc.com/), or visit our service site at [wp-smart-booking.com](https://www.wp-smart-booking.com/).

= Source code =

The complete source code, including the un-minified JavaScript and CSS sources under `src/`, is publicly available on GitHub:

https://github.com/KeisukeYokoyama/SmartBooking

== External services ==

This plugin may communicate with the following external services. In every case, outbound communication happens **only after the site administrator has explicitly enabled and configured the feature**. Google Calendar integration and ChatWork notifications are off by default and must be enabled on the "Settings > Integrations" tab. The postal code lookup only runs if the administrator adds an "Address" field to a form.

= Google Calendar API =

* **Endpoint**: `https://www.googleapis.com/calendar/v3/`
* **Purpose**: Creates a Google Calendar event when a booking is received, and deletes the event when the booking is cancelled.
* **Data sent**: Booking date and time, customer name, store name, staff name, reservation number.
* **When**: On booking reception (event creation) and on cancellation (event deletion).
* **Authentication**: Service account JSON key, uploaded by the administrator on the settings screen.
* **Default**: Off
* **Terms of service**: [Google APIs Terms of Service](https://developers.google.com/terms)
* **Privacy policy**: [Google Privacy Policy](https://policies.google.com/privacy)

= ChatWork API =

* **Endpoint**: `https://api.chatwork.com/v2/`
* **Purpose**: Posts a notification message to a designated ChatWork room when a booking is received.
* **Data sent**: Customer name, booking date and time, store name, staff name, reservation number.
* **When**: Immediately after the customer submits the booking form.
* **Authentication**: API token, entered by the administrator on the settings screen.
* **Default**: Off
* **Terms of service**: [ChatWork Terms of Service](https://go.chatwork.com/ja/terms/)
* **Privacy policy**: [ChatWork Privacy Policy](https://www.kubell.com/privacy/)

= Postal code lookup API (zipcloud) =

* **Endpoint**: `https://zipcloud.ibsnet.co.jp/api/search`
* **Purpose**: Auto-completes the address (prefecture, city, town) from a postal code entered in the "Address" field of the booking form.
* **Data sent**: Only the postal code that was entered. No personally identifiable information is sent.
* **When**: When a customer enters a 7-digit postal code, provided the administrator has added an "Address" field to the form and postal code auto-completion is enabled (the default).
* **Default**: No communication occurs at all unless an "Address" field is added.
* **Terms of service**: [zipcloud API terms of use](https://zipcloud.ibsnet.co.jp/rule/api)

If none of these integrations are enabled and configured, Smart Booking does not communicate with any external service.

== Screenshots ==

1. Front-end booking form (desktop: horizontally scrolling date picker and time slot selection)
2. Admin — schedule management (month calendar and schedule list)
3. Admin — reservation list (filters, status management, CSV export)
4. Admin — form settings (field type cards and field list)

== Installation ==

1. Upload the plugin ZIP from "Plugins > Add New" in the WordPress admin, or extract the archive to `/wp-content/plugins/smart-booking`.
2. Activate **Smart Booking** from the "Plugins" screen.
3. On activation, one default store, one staff member, and three custom fields (name, email address, phone number) are created automatically.
4. Configure stores, staff, schedules, and form fields from the **Smart Booking** menu in the admin sidebar.
5. Paste the `[smart_booking]` shortcode into a post or page and publish it to display the booking form.

To display a form limited to a specific store, add the `store_id` attribute (for example, `[smart_booking store_id="1"]`).

== Frequently Asked Questions ==

= Is it really completely free? =

Yes. There is no Pro version, no paid add-ons, and no license activation. Every feature is available for free.

= Does the plugin communicate with any external service out of the box? =

No. Out of the box, Smart Booking does not connect to any external service. The Google Calendar integration and ChatWork notifications only send data after the administrator explicitly enables them on the "Integrations" tab and enters the required API credentials.

= Is the booking form mobile friendly? =

Yes. The booking form, confirmation screen, and completion screen are all responsive, and have been verified on smartphone widths (375px) as well as on tablet and desktop.

= What happens if several customers try to book the same time slot at the same moment? =

Remaining capacity is managed with a single atomic SQL UPDATE statement, so bookings beyond the capacity of a slot are never accepted. If the slot fills up between page load and submission, the booking is not created and an error message is shown to the customer.

= Can I set up weekly recurring schedules in bulk? =

Yes. On the schedule management screen, choose "Copy schedule" and then "Pattern", select the days of the week (Sunday to Saturday) and a date range, and the schedule is duplicated to every matching date. You can also choose whether to overwrite existing schedules.

= Can customers cancel their own bookings? =

Not in v1. There is no customer-facing cancellation feature. When you receive a cancellation by phone or email, change the status to "Cancelled" from the reservation list in the admin screen.

= Can I add fields to the booking form? =

Yes. From the "Form settings" screen you can add, reorder, and delete text, email, phone, textarea, select, radio, and checkbox fields.

= Can I export the reservation list? =

Yes. Use the "CSV export" button on the reservation list screen to download the currently filtered reservations as a CSV file.

= What should I do if confirmation emails are not delivered? =

Email deliverability depends on the mail sending environment of your server. For reliable delivery we recommend using an SMTP plugin such as WP Mail SMTP, together with SPF, DKIM, and DMARC records for your sending domain. Recent sending failures can be reviewed on the "Settings > Email notifications" tab.

Note that even when no sending failure is shown, mail can still fail to arrive because the receiving server classified it as spam or rejected it. A typical symptom is that the auto-reply reaches the customer while only the administrator notification goes missing. The same remedy applies: install an SMTP plugin and configure SPF, DKIM, and DMARC.

= What happens to my data when I delete the plugin? =

Running the WordPress "Delete" action removes the seven custom tables created by Smart Booking along with all of its options. If you want to keep your data, deactivate the plugin instead of deleting it.

== Changelog ==

= 0.5.6 – 2026-09-11 =

* Fixed: on the admin screen, the dropdown arrow of a select box that could not be changed was repeated across the whole control instead of being shown once on the right, and the arrow disappeared from a select box that was showing an input error. Both came from the same style rule and are now displayed correctly. This affected appearance only; no saved data or notification email was involved.

= 0.5.5 – 2026-09-11 =

* Fixed: answers to input fields added to a form other than the default one were not shown in the reservation detail dialog on the admin screen. The answers were saved correctly and appeared in the CSV export, but could not be read from the admin screen. The reservation detail now reads the input fields of the form the reservation was actually made through.
* Fixed: with "Email to administrator" turned off and no store email address registered, notifications to the person in charge were skipped without any notice. A warning is now shown on the email settings screen when a person in charge has an email address registered but cannot receive notifications.
* Fixed: the explanations on the email settings screen and on the staff edit screen stated that notifications to the store and the person in charge are always delivered. They now state the actual condition, which is that a store email address must be registered.
* Fixed: changing the type of an existing field to "Address (postal code)" opened it with automatic address lookup turned off, the opposite of the default used when adding one from the address card. It now opens with automatic lookup turned on, matching the default.
* Fixed: the example shown for the {schedule_time} mail variable did not match what is actually inserted. It now reads "14:00〜15:00".
* Fixed: the link to the zipcloud terms of service in this readme used http. It now uses https.

= 0.5.4 – 2026-09-11 =

* Fixed: a radio or dropdown field used as the condition for another field could be changed to a checkbox field afterwards, which silently discarded the dependent field's answer. The dependent field was still shown on the booking form and on the confirmation screen and the booking completed normally, but the answer was never saved and never appeared in the reservation details, the CSV export, or the notification emails. A field that another field depends on can no longer be changed to a type other than radio or dropdown, and while such a setting is still in place the dependent field is no longer displayed at all.
* Note: on sites that used this setting, the dependent field may be blank in past reservations. Those answers were never written to the database and cannot be recovered.

For earlier releases, see the full changelog:
https://github.com/KeisukeYokoyama/SmartBooking/blob/main/CHANGELOG.md
