<?php
/**
 * Main plugin bootstrap.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Plugin {
	/**
	 * Instance.
	 *
	 * @var TTM_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Repository.
	 *
	 * @var TTM_Invitation_Repository
	 */
	private $repository;

	/**
	 * Mailer.
	 *
	 * @var TTM_Mailer
	 */
	private $mailer;

	/**
	 * Security.
	 *
	 * @var TTM_Security
	 */
	private $security;

	/**
	 * Admin.
	 *
	 * @var TTM_Admin
	 */
	private $admin;

	/**
	 * Public.
	 *
	 * @var TTM_Public
	 */
	private $public;

	/**
	 * Singleton.
	 *
	 * @return TTM_Plugin
	 */
	public static function instance() {
		if (null === self::$instance) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->repository = new TTM_Invitation_Repository();
		$this->mailer     = new TTM_Mailer($this->repository);
		$this->security   = new TTM_Security();
		$this->admin      = new TTM_Admin($this->repository, $this->mailer);
		$this->public     = new TTM_Public($this->repository);

		add_action('plugins_loaded', array($this, 'maybe_upgrade'));
		add_action('init', array('TTM_Post_Types', 'register'));
		add_action('init', array($this, 'register_query_vars'));
		add_filter('query_vars', array($this, 'add_query_vars'));
	}

	/**
	 * Upgrade DB schema when plugin version changes.
	 *
	 * @return void
	 */
	public function maybe_upgrade() {
		$current_version = get_option('ttm_db_version', '');

		if (TTM_VERSION !== $current_version) {
			TTM_Activator::maybe_upgrade();
		}
	}

	/**
	 * Register query vars bootstrap.
	 *
	 * @return void
	 */
	public function register_query_vars() {
		// Intentionally empty. The method keeps the init hook explicit and extensible.
	}

	/**
	 * Add custom query vars.
	 *
	 * @param array $vars Query vars.
	 * @return array
	 */
	public function add_query_vars($vars) {
		$vars[] = 'ttm_invite';
		$vars[] = 'ttm_action';
		$vars[] = 'ttm_token';
		return $vars;
	}

	/**
	 * Expose mailer instance.
	 *
	 * @return TTM_Mailer
	 */
	public function get_mailer() {
		return $this->mailer;
	}

	/**
	 * Expose security instance.
	 *
	 * @return TTM_Security
	 */
	public function get_security() {
		return $this->security;
	}
}
