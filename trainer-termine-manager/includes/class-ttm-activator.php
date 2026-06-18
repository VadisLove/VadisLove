<?php
/**
 * Activation logic.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Activator {
	/**
	 * Create database tables and flush rewrite rules.
	 *
	 * @return void
	 */
	public static function activate() {
		self::maybe_upgrade();
		TTM_Post_Types::register();
		flush_rewrite_rules();
	}

	/**
	 * Run schema upgrades when needed.
	 *
	 * @return void
	 */
	public static function maybe_upgrade() {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table_name      = $wpdb->prefix . 'ttm_invitations';
		$charset_collate = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table_name} (
			id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
			event_id BIGINT(20) UNSIGNED NOT NULL,
			user_id BIGINT(20) UNSIGNED NULL,
			name VARCHAR(191) NOT NULL,
			email VARCHAR(191) NOT NULL,
			response_status VARCHAR(20) NOT NULL DEFAULT 'offen',
			token VARCHAR(191) NOT NULL,
			token_expires_at DATETIME NOT NULL,
			responded_at DATETIME NULL,
			comment TEXT NULL,
			honorarium DECIMAL(10,2) NOT NULL DEFAULT 0.00,
			request_type VARCHAR(20) NOT NULL DEFAULT 'invite',
			trainer_qualification TINYINT(1) NOT NULL DEFAULT 0,
			club_member TINYINT(1) NOT NULL DEFAULT 0,
			club_name VARCHAR(191) NOT NULL DEFAULT '',
			mail_status VARCHAR(20) NOT NULL DEFAULT 'pending',
			mail_sent_at DATETIME NULL,
			created_at DATETIME NOT NULL,
			updated_at DATETIME NOT NULL,
			PRIMARY KEY  (id),
			KEY event_id (event_id),
			KEY user_id (user_id),
			KEY email (email),
			KEY token (token)
		) {$charset_collate};";

		dbDelta($sql);
		update_option('ttm_db_version', TTM_VERSION, false);
	}
}
