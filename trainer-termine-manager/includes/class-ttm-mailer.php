<?php
/**
 * Mailer.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Mailer {
	/**
	 * Repository.
	 *
	 * @var TTM_Invitation_Repository
	 */
	private $repository;

	/**
	 * Last mail error message.
	 *
	 * @var string
	 */
	private $last_error = '';

	/**
	 * Constructor.
	 *
	 * @param TTM_Invitation_Repository $repository Repository.
	 */
	public function __construct($repository) {
		$this->repository = $repository;
	}

	/**
	 * Send all event invitations.
	 *
	 * @param int $event_id Event ID.
	 * @return int Number of sent messages.
	 */
	public function send_event_invitations($event_id) {
		$sent_count   = 0;
		$invitations  = $this->repository->get_by_event($event_id, 'invite');

		foreach ($invitations as $invitation) {
			if ($this->send_invitation($event_id, $invitation)) {
				++$sent_count;
			}
		}

		return $sent_count;
	}

	/**
	 * Send one invitation.
	 *
	 * @param int   $event_id Event ID.
	 * @param array $invitation Invitation row.
	 * @return bool
	 */
	public function send_invitation($event_id, $invitation) {
		$event = get_post($event_id);

		if (! $event || 'ttm_event' !== $event->post_type) {
			return false;
		}

		if (empty($invitation['email']) || ! is_email($invitation['email'])) {
			$this->last_error = __('Ungueltige Empfaengeradresse.', 'trainer-termine-manager');
			$this->repository->mark_mail_status((int) $invitation['id'], 'failed');
			return false;
		}

		$token   = $this->repository->generate_token();
		$expires = $this->repository->get_default_expiry();

		$this->repository->update(
			(int) $invitation['id'],
			array(
				'token'            => $token,
				'token_expires_at' => $expires,
			)
		);

		$updated_invitation = $this->repository->get((int) $invitation['id']);

		$accept_url = add_query_arg(
			array(
				'ttm_invite' => (int) $updated_invitation['id'],
				'ttm_action' => 'accept',
				'ttm_token'  => $updated_invitation['token'],
			),
			home_url('/')
		);

		$decline_url = add_query_arg(
			array(
				'ttm_invite' => (int) $updated_invitation['id'],
				'ttm_action' => 'decline',
				'ttm_token'  => $updated_invitation['token'],
			),
			home_url('/')
		);

		$subject = sprintf(
			/* translators: %s: Event title. */
			__('Einladung: %s', 'trainer-termine-manager'),
			$event->post_title
		);

		$html = $this->render_email_template(
			$event,
			$updated_invitation,
			$accept_url,
			$decline_url
		);

		$sent = $this->send_html_mail($updated_invitation['email'], $subject, $html);

		$this->repository->mark_mail_status((int) $updated_invitation['id'], $sent ? 'sent' : 'failed');

		if (! $sent && ! empty($this->last_error)) {
			update_option('ttm_last_mail_error', $this->last_error, false);
		}

		return $sent;
	}

	/**
	 * Send confirmation email for acceptance.
	 *
	 * @param int $event_id Event ID.
	 * @param array $invitation Invitation row.
	 * @return bool
	 */
	public function send_acceptance_confirmation($event_id, $invitation) {
		$event = get_post($event_id);

		if (! $event || 'ttm_event' !== $event->post_type) {
			return false;
		}

		if (empty($invitation['email']) || ! is_email($invitation['email'])) {
			return false;
		}

		$subject = sprintf(
			/* translators: %s: Event title. */
			__('Bestätigung: Du hast zugesagt zu %s', 'trainer-termine-manager'),
			$event->post_title
		);

		$html = $this->render_acceptance_confirmation_template($event, $invitation);

		return $this->send_html_mail($invitation['email'], $subject, $html);
	}

	/**
	 * Send confirmation email for decline.
	 *
	 * @param int $event_id Event ID.
	 * @param array $invitation Invitation row.
	 * @return bool
	 */
	public function send_decline_confirmation($event_id, $invitation) {
		$event = get_post($event_id);

		if (! $event || 'ttm_event' !== $event->post_type) {
			return false;
		}

		if (empty($invitation['email']) || ! is_email($invitation['email'])) {
			return false;
		}

		$subject = sprintf(
			/* translators: %s: Event title. */
			__('Bestätigung: Du hast abgesagt zu %s', 'trainer-termine-manager'),
			$event->post_title
		);

		$html = $this->render_decline_confirmation_template($event, $invitation);

		return $this->send_html_mail($invitation['email'], $subject, $html);
	}

	/**
	 * Capture wp_mail errors for debugging.
	 *
	 * @param WP_Error $error Mail error.
	 * @return void
	 */
	public function capture_mail_error($error) {
		if ($error instanceof WP_Error) {
			$this->last_error = $error->get_error_message();
		}
	}

	/**
	 * Send a HTML mail with shared sender configuration and error capture.
	 *
	 * @param string $to Recipient email.
	 * @param string $subject Mail subject.
	 * @param string $html Mail body.
	 * @return bool
	 */
	private function send_html_mail($to, $subject, $html) {
		$headers = array(
			'Content-Type: text/html; charset=UTF-8',
			'Reply-To: ' . $this->get_from_name() . ' <' . $this->get_from_address() . '>',
		);

		$this->last_error = '';
		add_filter('wp_mail_from', array($this, 'filter_mail_from'));
		add_filter('wp_mail_from_name', array($this, 'filter_mail_from_name'));
		add_action('wp_mail_failed', array($this, 'capture_mail_error'));

		$sent = wp_mail($to, $subject, $html, $headers);

		remove_filter('wp_mail_from', array($this, 'filter_mail_from'));
		remove_filter('wp_mail_from_name', array($this, 'filter_mail_from_name'));
		remove_action('wp_mail_failed', array($this, 'capture_mail_error'));

		if ($sent) {
			delete_option('ttm_last_mail_error');
			return true;
		}

		if (empty($this->last_error)) {
			$this->last_error = __('Unbekannter Mailfehler beim Versand.', 'trainer-termine-manager');
		}

		update_option('ttm_last_mail_error', $this->last_error, false);
		return false;
	}

	/**
	 * Force sender address.
	 *
	 * @return string
	 */
	public function filter_mail_from() {
		return $this->get_from_address();
	}

	/**
	 * Force sender name.
	 *
	 * @return string
	 */
	public function filter_mail_from_name() {
		return $this->get_from_name();
	}

	/**
	 * Get sender address.
	 *
	 * @return string
	 */
	private function get_from_address() {
		$admin_email = get_option('admin_email');
		return is_email($admin_email) ? $admin_email : 'wordpress@' . wp_parse_url(home_url(), PHP_URL_HOST);
	}

	/**
	 * Get sender name.
	 *
	 * @return string
	 */
	private function get_from_name() {
		return wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES);
	}

	/**
	 * Build formatted event time label.
	 *
	 * @param int $event_id Event ID.
	 * @return string
	 */
	private function get_event_time_label($event_id) {
		$start_time = get_post_meta($event_id, '_ttm_event_time', true);
		$end_time   = get_post_meta($event_id, '_ttm_event_end_time', true);

		if (! empty($start_time) && ! empty($end_time)) {
			return $start_time . ' - ' . $end_time;
		}

		if (! empty($start_time)) {
			return $start_time;
		}

		return __('Uhrzeit folgt', 'trainer-termine-manager');
	}

	/**
	 * Render email template.
	 *
	 * @param WP_Post $event Event object.
	 * @param array   $invitation Invitation row.
	 * @param string  $accept_url Accept URL.
	 * @param string  $decline_url Decline URL.
	 * @return string
	 */
	private function render_email_template($event, $invitation, $accept_url, $decline_url) {
		$event_date = get_post_meta($event->ID, '_ttm_event_date', true);
		$event_time = $this->get_event_time_label($event->ID);
		$location   = get_post_meta($event->ID, '_ttm_event_location', true);
		$capacity   = (int) get_post_meta($event->ID, '_ttm_event_capacity', true);
		$event_price = (float) get_post_meta($event->ID, '_ttm_event_price', true);
		$available_slots = $this->repository->get_available_slots($event->ID);
		$logo_url   = TTM_URL . 'assets/images/skateboard-bayern-cat.png';

		ob_start();
		include TTM_PATH . 'templates/email-invitation.php';
		return (string) ob_get_clean();
	}

	/**
	 * Render acceptance confirmation template.
	 *
	 * @param WP_Post $event Event object.
	 * @param array   $invitation Invitation row.
	 * @return string
	 */
	private function render_acceptance_confirmation_template($event, $invitation) {
		$event_date = get_post_meta($event->ID, '_ttm_event_date', true);
		$event_time = $this->get_event_time_label($event->ID);
		$location   = get_post_meta($event->ID, '_ttm_event_location', true);
		$event_price = (float) get_post_meta($event->ID, '_ttm_event_price', true);
		$logo_url   = TTM_URL . 'assets/images/skateboard-bayern-cat.png';
		$formatted_date = ! empty($event_date) ? wp_date(get_option('date_format'), strtotime($event_date)) : __('Datum folgt', 'trainer-termine-manager');
		$formatted_time = $event_time;

		ob_start();
		?>
<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title><?php echo esc_html($event->post_title); ?></title>
</head>
<body style="margin:0;padding:24px;background:#eef2f7;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;color:#0f172a;">
	<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">
		<!-- Header -->
		<div style="padding:32px 32px;background:linear-gradient(135deg,#10b981,#059669);color:#ffffff;">
			<p style="margin:0 0 20px;">
				<img src="<?php echo esc_url($logo_url); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>" style="display:block;max-width:140px;height:auto;" />
			</p>
			<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.9;font-weight:700;"><?php esc_html_e('Bestätigung', 'trainer-termine-manager'); ?></p>
			<h1 style="margin:0;font-size:32px;line-height:1.2;font-weight:700;"><?php esc_html_e('Du hast zugesagt!', 'trainer-termine-manager'); ?></h1>
		</div>

		<!-- Content -->
		<div style="padding:40px 32px;">
			<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
				<?php echo esc_html(sprintf(__('Hallo %s,', 'trainer-termine-manager'), $invitation['name'])); ?>
			</p>

			<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
				<?php esc_html_e('vielen Dank für deine Zusage! Wir haben deine Anmeldung erhalten und freuen uns auf deine Teilnahme.', 'trainer-termine-manager'); ?>
			</p>

			<!-- Event Details Box -->
			<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;background:#f0fdf4;border-radius:12px;padding:20px;border-left:4px solid #10b981;">
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Termin', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($event->post_title); ?></span>
					</td>
				</tr>
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Datum', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($formatted_date); ?></span>
					</td>
				</tr>
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Uhrzeit', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($formatted_time); ?></span>
					</td>
				</tr>
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Ort', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($location ?: __('Noch offen', 'trainer-termine-manager')); ?></span>
					</td>
				</tr>
				<?php if (! empty($event_price)) : ?>
					<tr>
						<td style="padding:8px 0;font-size:15px;line-height:1.6;">
							<strong style="color:#0f172a;"><?php esc_html_e('Vergütung', 'trainer-termine-manager'); ?>:</strong><br/>
							<span style="color:#475569;"><?php echo esc_html(number_format_i18n($event_price, 2)); ?> €</span>
						</td>
					</tr>
				<?php endif; ?>
				<?php if (! empty($invitation['honorarium'])) : ?>
					<tr>
						<td style="padding:8px 0;font-size:15px;line-height:1.6;">
							<strong style="color:#0f172a;"><?php esc_html_e('Honorar', 'trainer-termine-manager'); ?>:</strong><br/>
							<span style="color:#475569;"><?php echo esc_html(number_format_i18n((float) $invitation['honorarium'], 2)); ?> €</span>
						</td>
					</tr>
				<?php endif; ?>
			</table>

			<?php if (! empty($event->post_content)) : ?>
				<div style="font-size:15px;line-height:1.7;color:#475569;margin:24px 0;">
					<?php echo wp_kses_post(wpautop($event->post_content)); ?>
				</div>
			<?php endif; ?>

			<!-- Important Note -->
			<p style="font-size:14px;line-height:1.6;color:#64748b;margin:24px 0;padding:14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;">
				<strong><?php esc_html_e('Wichtig:', 'trainer-termine-manager'); ?></strong><br/>
				<?php esc_html_e('Falls sich etwas ändert und du doch nicht teilnehmen kannst, melde dich bitte rechtzeitig ab.', 'trainer-termine-manager'); ?>
			</p>

			<!-- Footer -->
			<p style="font-size:12px;color:#94a3b8;margin:24px 0 0;padding-top:24px;border-top:1px solid #e2e8f0;">
				<?php echo esc_html(sprintf(__('Bei Fragen: %s', 'trainer-termine-manager'), antispambot(get_option('admin_email')))); ?>
			</p>
		</div>
	</div>
</body>
</html>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * Render decline confirmation template.
	 *
	 * @param WP_Post $event Event object.
	 * @param array   $invitation Invitation row.
	 * @return string
	 */
	private function render_decline_confirmation_template($event, $invitation) {
		$event_date = get_post_meta($event->ID, '_ttm_event_date', true);
		$event_time = $this->get_event_time_label($event->ID);
		$location   = get_post_meta($event->ID, '_ttm_event_location', true);
		$logo_url   = TTM_URL . 'assets/images/skateboard-bayern-cat.png';
		$formatted_date = ! empty($event_date) ? wp_date(get_option('date_format'), strtotime($event_date)) : __('Datum folgt', 'trainer-termine-manager');
		$formatted_time = $event_time;

		ob_start();
		?>
<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title><?php echo esc_html($event->post_title); ?></title>
</head>
<body style="margin:0;padding:24px;background:#eef2f7;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;color:#0f172a;">
	<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">
		<!-- Header -->
		<div style="padding:32px 32px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#ffffff;">
			<p style="margin:0 0 20px;">
				<img src="<?php echo esc_url($logo_url); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>" style="display:block;max-width:140px;height:auto;" />
			</p>
			<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.9;font-weight:700;"><?php esc_html_e('Bestätigung', 'trainer-termine-manager'); ?></p>
			<h1 style="margin:0;font-size:32px;line-height:1.2;font-weight:700;"><?php esc_html_e('Du hast abgesagt', 'trainer-termine-manager'); ?></h1>
		</div>

		<!-- Content -->
		<div style="padding:40px 32px;">
			<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
				<?php echo esc_html(sprintf(__('Hallo %s,', 'trainer-termine-manager'), $invitation['name'])); ?>
			</p>

			<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
				<?php esc_html_e('wir haben deine Absage erhalten. Deine Anmeldung zu folgendem Termin wurde storniert:', 'trainer-termine-manager'); ?>
			</p>

			<!-- Event Details Box -->
			<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;background:#fef2f2;border-radius:12px;padding:20px;border-left:4px solid #ef4444;">
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Termin', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($event->post_title); ?></span>
					</td>
				</tr>
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Datum', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($formatted_date); ?></span>
					</td>
				</tr>
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Uhrzeit', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($formatted_time); ?></span>
					</td>
				</tr>
				<tr>
					<td style="padding:8px 0;font-size:15px;line-height:1.6;">
						<strong style="color:#0f172a;"><?php esc_html_e('Ort', 'trainer-termine-manager'); ?>:</strong><br/>
						<span style="color:#475569;"><?php echo esc_html($location ?: __('Noch offen', 'trainer-termine-manager')); ?></span>
					</td>
				</tr>
			</table>

			<!-- Re-register info -->
			<p style="font-size:14px;line-height:1.6;color:#64748b;margin:24px 0;padding:14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;">
				<?php esc_html_e('Falls du doch noch teilnehmen möchtest, kannst du dich erneut anmelden oder kontaktiere uns direkt.', 'trainer-termine-manager'); ?>
			</p>

			<!-- Footer -->
			<p style="font-size:12px;color:#94a3b8;margin:24px 0 0;padding-top:24px;border-top:1px solid #e2e8f0;">
				<?php echo esc_html(sprintf(__('Bei Fragen: %s', 'trainer-termine-manager'), antispambot(get_option('admin_email')))); ?>
			</p>
		</div>
	</div>
</body>
</html>
		<?php
		return (string) ob_get_clean();
	}
		/**
		 * Send event cancellation notification to all confirmed attendees.
	 *
	 * @param int    $event_id Event ID.
	 * @param string $cancellation_reason Reason for cancellation.
	 * @return int Number of emails sent.
	 */
	public function send_event_cancellation_notifications($event_id, $cancellation_reason = '') {
		$event = get_post($event_id);

		if (! $event || 'ttm_event' !== $event->post_type) {
			return 0;
		}

		// Get all confirmed attendees by response status, regardless of invite/application type.
		$confirmed = $this->repository->get_confirmed_attendees_by_event($event_id);
		
		if (empty($confirmed)) {
			return 0;
		}

		$sent_count = 0;

		foreach ($confirmed as $attendee) {
			if (empty($attendee['email']) || ! is_email($attendee['email'])) {
				continue;
			}

			$subject = sprintf(
				__('Wichtig: Termin abgesagt - %s', 'trainer-termine-manager'),
				$event->post_title
			);

			$html = $this->render_cancellation_email_template($event, $attendee, $cancellation_reason);

			if ($this->send_html_mail($attendee['email'], $subject, $html)) {
				++$sent_count;
			}
		}

		return $sent_count;
	}

	/**
	 * Render event cancellation email template.
	 *
	 * @param WP_Post $event Event object.
	 * @param array   $attendee Attendee data.
	 * @param string  $cancellation_reason Cancellation reason.
	 * @return string
	 */
	private function render_cancellation_email_template($event, $attendee, $cancellation_reason = '') {
		$event_date = get_post_meta($event->ID, '_ttm_event_date', true);
		$event_time = $this->get_event_time_label($event->ID);
		$location   = get_post_meta($event->ID, '_ttm_event_location', true);
		$logo_url   = TTM_URL . 'assets/images/skateboard-bayern-cat.png';
		$formatted_date = ! empty($event_date) ? wp_date(get_option('date_format'), strtotime($event_date)) : __('Datum folgt', 'trainer-termine-manager');
		$formatted_time = $event_time;

		ob_start();
		?>
<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title><?php echo esc_html($event->post_title); ?></title>
</head>
<body style="margin:0;padding:24px;background:#eef2f7;font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif;color:#0f172a;">
	<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);">
		<div style="padding:32px 32px;background:linear-gradient(135deg,#ef4444,#dc2626);color:#ffffff;">
			<p style="margin:0 0 20px;">
				<img src="<?php echo esc_url($logo_url); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>" style="display:block;max-width:140px;height:auto;" />
			</p>
			<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.9;font-weight:700;"><?php esc_html_e('Wichtige Mitteilung', 'trainer-termine-manager'); ?></p>
			<h1 style="margin:0;font-size:32px;line-height:1.2;font-weight:700;"><?php esc_html_e('Termin wurde abgesagt', 'trainer-termine-manager'); ?></h1>
		</div>
		<div style="padding:40px 32px;">
			<p style="margin:0 0 16px;font-size:16px;line-height:1.6;">
				<?php echo esc_html(sprintf(__('Hallo %s,', 'trainer-termine-manager'), $attendee['name'])); ?>
			</p>
			<p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#475569;">
				<?php esc_html_e('leider müssen wir dir mitteilen, dass der folgende Termin abgesagt werden musste:', 'trainer-termine-manager'); ?>
			</p>
			<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:28px 0;background:#fef2f2;border-radius:12px;padding:20px;border-left:4px solid #ef4444;">
				<tr><td style="padding:8px 0;"><strong style="color:#0f172a;"><?php esc_html_e('Termin', 'trainer-termine-manager'); ?>:</strong><br/><span style="color:#475569;"><?php echo esc_html($event->post_title); ?></span></td></tr>
				<tr><td style="padding:8px 0;"><strong style="color:#0f172a;"><?php esc_html_e('Datum', 'trainer-termine-manager'); ?>:</strong><br/><span style="color:#475569;"><?php echo esc_html($formatted_date); ?></span></td></tr>
				<tr><td style="padding:8px 0;"><strong style="color:#0f172a;"><?php esc_html_e('Uhrzeit', 'trainer-termine-manager'); ?>:</strong><br/><span style="color:#475569;"><?php echo esc_html($formatted_time); ?></span></td></tr>
				<tr><td style="padding:8px 0;"><strong style="color:#0f172a;"><?php esc_html_e('Ort', 'trainer-termine-manager'); ?>:</strong><br/><span style="color:#475569;"><?php echo esc_html($location ?: __('Noch offen', 'trainer-termine-manager')); ?></span></td></tr>
			</table>
			<?php if (! empty($cancellation_reason)) : ?>
				<p style="font-size:15px;line-height:1.7;color:#475569;margin:20px 0;"><strong><?php esc_html_e('Grund:', 'trainer-termine-manager'); ?></strong><br/><?php echo esc_html($cancellation_reason); ?></p>
			<?php endif; ?>
			<p style="font-size:14px;line-height:1.6;color:#64748b;margin:24px 0;padding:14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:8px;"><strong><?php esc_html_e('Entschuldigung!', 'trainer-termine-manager'); ?></strong><br/><?php esc_html_e('Wir entschuldigen uns für die Unannehmlichkeiten. Deine Anmeldung wird automatisch storniert.', 'trainer-termine-manager'); ?></p>
			<p style="font-size:12px;color:#94a3b8;margin:24px 0 0;padding-top:24px;border-top:1px solid #e2e8f0;">
				<?php echo esc_html(sprintf(__('Bei Fragen: %s', 'trainer-termine-manager'), antispambot(get_option('admin_email')))); ?>
			</p>
		</div>
	</div>
</body>
</html>
		<?php
		return (string) ob_get_clean();
	}
}
