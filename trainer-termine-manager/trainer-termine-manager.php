<?php
/**
 * Plugin Name: Trainer Termine Manager
 * Description: MVP-Plugin fuer Vereins-Termine mit Einladungen, E-Mail-Antworten und Frontend-Dashboard.
 * Version: 0.3.1
 * Author: VladikH
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: trainer-termine-manager
 */

if (! defined('ABSPATH')) {
	exit;
}

define('TTM_VERSION', '0.3.1');
define('TTM_FILE', __FILE__);
define('TTM_PATH', plugin_dir_path(__FILE__));
define('TTM_URL', plugin_dir_url(__FILE__));
define('TTM_BASENAME', plugin_basename(__FILE__));

require_once TTM_PATH . 'includes/class-ttm-activator.php';
require_once TTM_PATH . 'includes/class-ttm-invitation-repository.php';
require_once TTM_PATH . 'includes/class-ttm-post-types.php';
require_once TTM_PATH . 'includes/class-ttm-mailer.php';
require_once TTM_PATH . 'includes/class-ttm-security.php';
require_once TTM_PATH . 'admin/class-ttm-admin.php';
require_once TTM_PATH . 'public/class-ttm-public.php';
require_once TTM_PATH . 'includes/class-ttm-plugin.php';

register_activation_hook(TTM_FILE, array('TTM_Activator', 'activate'));

TTM_Plugin::instance();
