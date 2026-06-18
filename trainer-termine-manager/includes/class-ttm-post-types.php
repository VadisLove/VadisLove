<?php
/**
 * Post type registration.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Post_Types {
	/**
	 * Register plugin post types.
	 *
	 * @return void
	 */
	public static function register() {
		register_post_type(
			'ttm_event',
			array(
				'labels'          => array(
					'name'               => __('Trainer-Termine', 'trainer-termine-manager'),
					'singular_name'      => __('Trainer-Termin', 'trainer-termine-manager'),
					'add_new'            => __('Neu hinzufügen', 'trainer-termine-manager'),
					'add_new_item'       => __('Termin anlegen', 'trainer-termine-manager'),
					'edit_item'          => __('Termin bearbeiten', 'trainer-termine-manager'),
					'new_item'           => __('Neuer Termin', 'trainer-termine-manager'),
					'view_item'          => __('Termin ansehen', 'trainer-termine-manager'),
					'search_items'       => __('Termine durchsuchen', 'trainer-termine-manager'),
					'not_found'          => __('Keine Termine gefunden', 'trainer-termine-manager'),
					'not_found_in_trash' => __('Keine Termine im Papierkorb', 'trainer-termine-manager'),
					'menu_name'          => __('Trainer-Termine', 'trainer-termine-manager'),
				),
				'public'          => false,
				'show_ui'         => true,
				'show_in_menu'    => true,
				'menu_position'   => 26,
				'menu_icon'       => 'dashicons-calendar-alt',
				'supports'        => array('title', 'editor', 'author'),
				'capability_type' => 'post',
				'map_meta_cap'    => true,
				'rewrite'         => false,
				'has_archive'     => false,
			)
		);
	}
}
