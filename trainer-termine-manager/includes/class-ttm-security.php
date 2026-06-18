<?php
/**
 * Security & DSGVO Compliance Module.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Security {
	/**
	 * reCAPTCHA Site Key (from WordPress option).
	 *
	 * @var string
	 */
	private $recaptcha_site_key = '';

	/**
	 * reCAPTCHA Secret Key (from WordPress option).
	 *
	 * @var string
	 */
	private $recaptcha_secret_key = '';

	/**
	 * Constructor.
	 */
	public function __construct() {
		$this->recaptcha_site_key    = get_option('ttm_recaptcha_site_key', '');
		$this->recaptcha_secret_key  = get_option('ttm_recaptcha_secret_key', '');

		// Register settings
		add_action('admin_init', array($this, 'register_settings'));
		add_action('admin_menu', array($this, 'add_settings_page'));

		// Enqueue reCAPTCHA script on frontend
		add_action('wp_enqueue_scripts', array($this, 'enqueue_recaptcha'));
	}

	/**
	 * Register security settings.
	 *
	 * @return void
	 */
	public function register_settings() {
		register_setting('ttm_security_settings', 'ttm_recaptcha_site_key', array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
		));

		register_setting('ttm_security_settings', 'ttm_recaptcha_secret_key', array(
			'type'              => 'string',
			'sanitize_callback' => 'sanitize_text_field',
		));

		add_settings_section(
			'ttm_recaptcha_section',
			__('reCAPTCHA v3 Konfiguration', 'trainer-termine-manager'),
			array($this, 'render_recaptcha_section'),
			'ttm_security_settings'
		);

		add_settings_field(
			'ttm_recaptcha_site_key',
			__('Site Key', 'trainer-termine-manager'),
			array($this, 'render_recaptcha_site_key_field'),
			'ttm_security_settings',
			'ttm_recaptcha_section'
		);

		add_settings_field(
			'ttm_recaptcha_secret_key',
			__('Secret Key', 'trainer-termine-manager'),
			array($this, 'render_recaptcha_secret_key_field'),
			'ttm_security_settings',
			'ttm_recaptcha_section'
		);
	}

	/**
	 * Add settings page to admin menu.
	 *
	 * @return void
	 */
	public function add_settings_page() {
		add_submenu_page(
			'edit.php?post_type=ttm_event',
			__('TTM Sicherheit', 'trainer-termine-manager'),
			__('Sicherheit', 'trainer-termine-manager'),
			'manage_options',
			'ttm-security',
			array($this, 'render_settings_page')
		);
	}

	/**
	 * Render settings page.
	 *
	 * @return void
	 */
	public function render_settings_page() {
		?>
		<div class="wrap">
			<h1><?php esc_html_e('Trainer Termine Manager - Sicherheit & DSGVO', 'trainer-termine-manager'); ?></h1>
			<form method="post" action="options.php">
				<?php settings_fields('ttm_security_settings'); ?>
				<?php do_settings_sections('ttm_security_settings'); ?>
				<?php submit_button(); ?>
			</form>
			<div style="margin-top: 40px; padding: 20px; background: #f8f9fa; border-radius: 8px;">
				<h2><?php esc_html_e('reCAPTCHA v3 Setup', 'trainer-termine-manager'); ?></h2>
				<ol>
					<li><?php echo wp_kses_post(sprintf(__('Gehe zu <a href="%s" target="_blank">Google reCAPTCHA Admin Konsole</a>', 'trainer-termine-manager'), 'https://www.google.com/recaptcha/admin')); ?></li>
					<li><?php esc_html_e('Erstelle ein neues Projekt oder verwende einen bestehenden.', 'trainer-termine-manager'); ?></li>
					<li><?php esc_html_e('Wähle reCAPTCHA v3 als Typ.', 'trainer-termine-manager'); ?></li>
					<li><?php esc_html_e('Kopiere die Site Key und Secret Key in die Felder unten.', 'trainer-termine-manager'); ?></li>
				</ol>
			</div>
		</div>
		<?php
	}

	/**
	 * Render reCAPTCHA section.
	 *
	 * @return void
	 */
	public function render_recaptcha_section() {
		echo wp_kses_post(wpautop(__('reCAPTCHA v3 schützt dein Plugin vor Bot-Angriffen und Spam. Konfiguriere hier deine API-Schlüssel.', 'trainer-termine-manager')));
	}

	/**
	 * Render Site Key field.
	 *
	 * @return void
	 */
	public function render_recaptcha_site_key_field() {
		$value = get_option('ttm_recaptcha_site_key', '');
		?>
		<input type="text" id="ttm_recaptcha_site_key" name="ttm_recaptcha_site_key" value="<?php echo esc_attr($value); ?>" size="60" />
		<p class="description"><?php esc_html_e('Öffentlicher Schlüssel von Google reCAPTCHA', 'trainer-termine-manager'); ?></p>
		<?php
	}

	/**
	 * Render Secret Key field.
	 *
	 * @return void
	 */
	public function render_recaptcha_secret_key_field() {
		$value = get_option('ttm_recaptcha_secret_key', '');
		?>
		<input type="password" id="ttm_recaptcha_secret_key" name="ttm_recaptcha_secret_key" value="<?php echo esc_attr($value); ?>" size="60" />
		<p class="description"><?php esc_html_e('Privater Schlüssel von Google reCAPTCHA (nicht öffentlich machen!)', 'trainer-termine-manager'); ?></p>
		<?php
	}

	/**
	 * Enqueue reCAPTCHA script.
	 *
	 * @return void
	 */
	public function enqueue_recaptcha() {
		if (empty($this->recaptcha_site_key)) {
			return;
		}

		wp_enqueue_script(
			'ttm-recaptcha',
			'https://www.google.com/recaptcha/api.js?render=' . esc_attr($this->recaptcha_site_key),
			array(),
			false,
			true
		);

		wp_add_inline_script(
			'ttm-recaptcha',
			sprintf(
				'window.TTM_RECAPTCHA_SITE_KEY = "%s";',
				esc_attr($this->recaptcha_site_key)
			)
		);
	}

	/**
	 * Verify reCAPTCHA token.
	 *
	 * @param string $token reCAPTCHA token from frontend.
	 * @return bool|array Returns array with score on success, false on failure.
	 */
	public function verify_recaptcha_token($token) {
		if (empty($this->recaptcha_secret_key) || empty($token)) {
			return false;
		}

		$response = wp_remote_post(
			'https://www.google.com/recaptcha/api/siteverify',
			array(
				'body' => array(
					'secret'   => $this->recaptcha_secret_key,
					'response' => $token,
				),
			)
		);

		if (is_wp_error($response)) {
			return false;
		}

		$body = wp_remote_retrieve_body($response);
		$data = json_decode($body, true);

		if (empty($data['success']) || $data['score'] < 0.5) {
			return false;
		}

		return array(
			'success' => true,
			'score'   => $data['score'],
			'action'  => $data['action'] ?? '',
		);
	}

	/**
	 * Get reCAPTCHA site key.
	 *
	 * @return string
	 */
	public function get_recaptcha_site_key() {
		return $this->recaptcha_site_key;
	}

	/**
	 * Log security event for audit trail.
	 *
	 * @param string $event_type Type of event.
	 * @param int    $event_id Event ID.
	 * @param string $user_email User email or identifier.
	 * @param string $action Action performed.
	 * @param array  $details Additional details.
	 * @return bool
	 */
	public static function log_security_event($event_type, $event_id, $user_email, $action, $details = array()) {
		$log_entry = array(
			'timestamp'  => current_time('mysql', true),
			'event_type' => sanitize_text_field($event_type),
			'event_id'   => absint($event_id),
			'user_email' => sanitize_email($user_email),
			'action'     => sanitize_text_field($action),
			'ip_address' => self::get_client_ip(),
			'user_agent' => sanitize_text_field($_SERVER['HTTP_USER_AGENT'] ?? ''),
			'details'    => wp_json_encode($details),
		);

		return wp_insert_post(
			array(
				'post_type'    => 'ttm_security_log',
				'post_title'   => sprintf('[%s] %s', $log_entry['event_type'], $action),
				'post_content' => wp_json_encode($log_entry),
				'post_status'  => 'publish',
			)
		);
	}

	/**
	 * Get client IP address (DSGVO safe).
	 *
	 * @return string
	 */
	public static function get_client_ip() {
		// Get IP from CloudFlare if available
		if (! empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
			$ip = sanitize_text_field($_SERVER['HTTP_CF_CONNECTING_IP']);
		} elseif (! empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
			$ip = sanitize_text_field(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'])[0]);
		} elseif (! empty($_SERVER['REMOTE_ADDR'])) {
			$ip = sanitize_text_field($_SERVER['REMOTE_ADDR']);
		} else {
			$ip = '';
		}

		// Anonymize IP (DSGVO compliant) - last octet
		if (strpos($ip, ':') !== false) {
			// IPv6
			$ip = preg_replace('/:[0-9a-f]+$/', ':0000', $ip);
		} else {
			// IPv4
			$parts = explode('.', $ip);
			if (count($parts) === 4) {
				$parts[3] = '0';
				$ip       = implode('.', $parts);
			}
		}

		return $ip;
	}

	/**
	 * Check rate limiting (anti-spam).
	 *
	 * @param string $identifier Unique identifier (email, IP, etc).
	 * @param int    $max_attempts Max attempts allowed.
	 * @param int    $window_seconds Time window in seconds.
	 * @return bool True if within limits, false if rate limited.
	 */
	public static function check_rate_limit($identifier, $max_attempts = 5, $window_seconds = 3600) {
		$cache_key = 'ttm_ratelimit_' . md5($identifier);
		$attempts  = (int) wp_cache_get($cache_key);

		if ($attempts >= $max_attempts) {
			return false;
		}

		wp_cache_set($cache_key, $attempts + 1, '', $window_seconds);
		return true;
	}

	/**
	 * Sanitize user data for storage.
	 *
	 * @param array $data User data.
	 * @return array Sanitized data.
	 */
	public static function sanitize_application_data($data) {
		return array(
			'name'                  => sanitize_text_field($data['name'] ?? ''),
			'email'                 => sanitize_email($data['email'] ?? ''),
			'trainer_qualification' => ! empty($data['trainer_qualification']) ? 1 : 0,
			'club_member'           => ! empty($data['club_member']) ? 1 : 0,
			'club_name'             => sanitize_text_field($data['club_name'] ?? ''),
		);
	}

	/**
	 * Check data deletion request (DSGVO Right to be forgotten).
	 *
	 * @param string $email Email address.
	 * @return int Number of records deleted.
	 */
	public static function delete_user_data($email) {
		global $wpdb;

		$sanitized_email = sanitize_email($email);
		$deleted_count   = 0;

		// Delete from custom table
		$table = $wpdb->prefix . 'ttm_invitations';
		$deleted_count += $wpdb->delete(
			$table,
			array('email' => $sanitized_email),
			array('%s')
		);

		// Log the deletion
		self::log_security_event(
			'data_deletion',
			0,
			$sanitized_email,
			'User data deleted per DSGVO request',
			array('records_deleted' => $deleted_count)
		);

		return $deleted_count;
	}
}
