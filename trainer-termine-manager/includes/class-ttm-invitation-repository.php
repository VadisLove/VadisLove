<?php
/**
 * Invitation and application data access layer.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Invitation_Repository {
	/**
	 * DB table name.
	 *
	 * @var string
	 */
	private $table_name;

	/**
	 * Constructor.
	 */
	public function __construct() {
		global $wpdb;
		$this->table_name = $wpdb->prefix . 'ttm_invitations';
	}

	/**
	 * Create random token.
	 *
	 * @return string
	 */
	public function generate_token() {
		return wp_generate_password(48, false, false);
	}

	/**
	 * Get default token expiry.
	 *
	 * @return string
	 */
	public function get_default_expiry() {
		return gmdate('Y-m-d H:i:s', strtotime('+14 days'));
	}

	/**
	 * Get invitation by ID.
	 *
	 * @param int $invitation_id Invitation ID.
	 * @return array|null
	 */
	public function get($invitation_id) {
		global $wpdb;

		return $wpdb->get_row(
			$wpdb->prepare("SELECT * FROM {$this->table_name} WHERE id = %d", (int) $invitation_id),
			ARRAY_A
		);
	}

	/**
	 * Get invitation by token pair.
	 *
	 * @param int    $invitation_id Invitation ID.
	 * @param string $token Token.
	 * @return array|null
	 */
	public function get_by_token($invitation_id, $token) {
		global $wpdb;

		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name} WHERE id = %d AND token = %s",
				(int) $invitation_id,
				$token
			),
			ARRAY_A
		);
	}

	/**
	 * Get all entries for an event.
	 *
	 * @param int         $event_id Event ID.
	 * @param string|null $request_type Optional type.
	 * @return array
	 */
	public function get_by_event($event_id, $request_type = null) {
		global $wpdb;

		if ($request_type) {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT * FROM {$this->table_name} WHERE event_id = %d AND request_type = %s ORDER BY created_at DESC",
					(int) $event_id,
					$request_type
				),
				ARRAY_A
			);
		}

		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name} WHERE event_id = %d ORDER BY created_at DESC",
				(int) $event_id
			),
			ARRAY_A
		);
	}

	/**
	 * Insert invitation or application.
	 *
	 * @param array $data Entry data.
	 * @return int|false
	 */
	public function insert($data) {
		global $wpdb;

		$now = current_time('mysql', true);

		$inserted = $wpdb->insert(
			$this->table_name,
			array(
				'event_id'               => (int) $data['event_id'],
				'user_id'                => null,
				'name'                   => sanitize_text_field($data['name']),
				'email'                  => sanitize_email($data['email']),
				'response_status'        => ! empty($data['response_status']) ? sanitize_key($data['response_status']) : 'offen',
				'token'                  => ! empty($data['token']) ? sanitize_text_field($data['token']) : $this->generate_token(),
				'token_expires_at'       => ! empty($data['token_expires_at']) ? gmdate('Y-m-d H:i:s', strtotime($data['token_expires_at'])) : $this->get_default_expiry(),
				'responded_at'           => ! empty($data['responded_at']) ? gmdate('Y-m-d H:i:s', strtotime($data['responded_at'])) : null,
				'comment'                => isset($data['comment']) ? sanitize_textarea_field($data['comment']) : '',
				'honorarium'             => isset($data['honorarium']) ? (float) $data['honorarium'] : 0,
				'request_type'           => ! empty($data['request_type']) ? sanitize_key($data['request_type']) : 'invite',
				'trainer_qualification'  => ! empty($data['trainer_qualification']) ? 1 : 0,
				'club_member'            => ! empty($data['club_member']) ? 1 : 0,
				'club_name'              => ! empty($data['club_name']) ? sanitize_text_field($data['club_name']) : '',
				'mail_status'            => ! empty($data['mail_status']) ? sanitize_key($data['mail_status']) : 'pending',
				'mail_sent_at'           => ! empty($data['mail_sent_at']) ? gmdate('Y-m-d H:i:s', strtotime($data['mail_sent_at'])) : null,
				'created_at'             => $now,
				'updated_at'             => $now,
			),
			array('%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%f', '%s', '%d', '%d', '%s', '%s', '%s', '%s', '%s')
		);

		if (! $inserted && ! empty($wpdb->last_error)) {
			update_option('ttm_last_db_error', $wpdb->last_error, false);
		}

		if ($inserted) {
			delete_option('ttm_last_db_error');
		}

		return $inserted ? (int) $wpdb->insert_id : false;
	}

	/**
	 * Update entry.
	 *
	 * @param int   $invitation_id Invitation ID.
	 * @param array $data Data.
	 * @return bool
	 */
	public function update($invitation_id, $data) {
		global $wpdb;

		$prepared = array('updated_at' => current_time('mysql', true));

		foreach ($data as $key => $value) {
			switch ($key) {
				case 'event_id':
				case 'user_id':
				case 'trainer_qualification':
				case 'club_member':
					$prepared[ $key ] = (int) $value;
					break;
				case 'name':
				case 'club_name':
					$prepared[ $key ] = sanitize_text_field($value);
					break;
				case 'email':
					$prepared[ $key ] = sanitize_email($value);
					break;
				case 'response_status':
				case 'mail_status':
				case 'request_type':
					$prepared[ $key ] = sanitize_key($value);
					break;
				case 'token':
					$prepared[ $key ] = sanitize_text_field($value);
					break;
				case 'token_expires_at':
				case 'responded_at':
				case 'mail_sent_at':
					$prepared[ $key ] = ! empty($value) ? gmdate('Y-m-d H:i:s', strtotime($value)) : null;
					break;
				case 'comment':
					$prepared[ $key ] = sanitize_textarea_field($value);
					break;
				case 'honorarium':
					$prepared[ $key ] = (float) $value;
					break;
			}
		}

		$updated = $wpdb->update($this->table_name, $prepared, array('id' => (int) $invitation_id));

		if (false === $updated && ! empty($wpdb->last_error)) {
			update_option('ttm_last_db_error', $wpdb->last_error, false);
		}

		if (false !== $updated) {
			delete_option('ttm_last_db_error');
		}

		return false !== $updated;
	}

	/**
	 * Delete entry.
	 *
	 * @param int $invitation_id Invitation ID.
	 * @return bool
	 */
	public function delete($invitation_id) {
		global $wpdb;

		return false !== $wpdb->delete($this->table_name, array('id' => (int) $invitation_id), array('%d'));
	}

	/**
	 * Sync manual invites against submitted participants.
	 *
	 * @param int   $event_id Event ID.
	 * @param array $people Manual participants.
	 * @return void
	 */
	public function sync_event_invitations($event_id, $people) {
		$existing        = $this->get_by_event($event_id, 'invite');
		$existing_lookup = array();
		$desired_lookup  = array();

		foreach ($existing as $entry) {
			$existing_lookup[ $this->build_lookup_key($entry['email']) ] = $entry;
		}

		foreach ($people as $person) {
			$key = $this->build_lookup_key($person['email']);

			$desired_lookup[ $key ] = true;

			if (isset($existing_lookup[ $key ])) {
				$this->update(
					(int) $existing_lookup[ $key ]['id'],
					array(
						'name'       => $person['name'],
						'email'      => $person['email'],
						'honorarium' => isset($person['honorarium']) ? (float) $person['honorarium'] : (float) $existing_lookup[ $key ]['honorarium'],
					)
				);
				continue;
			}

			$this->insert(
				array(
					'event_id'    => $event_id,
					'name'        => $person['name'],
					'email'       => $person['email'],
					'honorarium'  => isset($person['honorarium']) ? (float) $person['honorarium'] : 0,
					'request_type'=> 'invite',
				)
			);
		}

		foreach ($existing as $entry) {
			$key = $this->build_lookup_key($entry['email']);

			if (! isset($desired_lookup[ $key ])) {
				$this->delete((int) $entry['id']);
			}
		}
	}

	/**
	 * Create trainer application.
	 *
	 * @param array $data Application data.
	 * @return int|false
	 */
	public function create_application($data) {
		$existing = $this->get_application_for_event_email((int) $data['event_id'], $data['email']);

		if ($existing) {
			$this->update(
				(int) $existing['id'],
				array(
					'name'                  => $data['name'],
					'trainer_qualification' => ! empty($data['trainer_qualification']) ? 1 : 0,
					'club_member'           => ! empty($data['club_member']) ? 1 : 0,
					'club_name'             => ! empty($data['club_name']) ? $data['club_name'] : '',
					'response_status'       => 'bewerbung',
					'comment'               => '',
				)
			);

			return (int) $existing['id'];
		}

		return $this->insert(
			array(
				'event_id'               => (int) $data['event_id'],
				'name'                   => $data['name'],
				'email'                  => $data['email'],
				'request_type'           => 'application',
				'response_status'        => 'bewerbung',
				'trainer_qualification'  => ! empty($data['trainer_qualification']) ? 1 : 0,
				'club_member'            => ! empty($data['club_member']) ? 1 : 0,
				'club_name'              => ! empty($data['club_name']) ? $data['club_name'] : '',
			)
		);
	}

	/**
	 * Get one application by event and email.
	 *
	 * @param int    $event_id Event ID.
	 * @param string $email Email.
	 * @return array|null
	 */
	public function get_application_for_event_email($event_id, $email) {
		global $wpdb;

		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name}
				WHERE event_id = %d AND LOWER(email) = %s AND request_type = 'application'
				ORDER BY id DESC LIMIT 1",
				(int) $event_id,
				strtolower(sanitize_email($email))
			),
			ARRAY_A
		);
	}

	/**
	 * Get applications for an event.
	 *
	 * @param int         $event_id Event ID.
	 * @param string|null $status Optional status.
	 * @return array
	 */
	public function get_applications_by_event($event_id, $status = null) {
		global $wpdb;

		if ($status) {
			return $wpdb->get_results(
				$wpdb->prepare(
					"SELECT * FROM {$this->table_name}
					WHERE event_id = %d AND request_type = 'application' AND response_status = %s
					ORDER BY created_at DESC",
					(int) $event_id,
					$status
				),
				ARRAY_A
			);
		}

		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name}
				WHERE event_id = %d AND request_type = 'application'
				ORDER BY created_at DESC",
				(int) $event_id
			),
			ARRAY_A
		);
	}

	/**
	 * Get pending applications with event data.
	 *
	 * @return array
	 */
	public function get_pending_applications() {
		$items   = $this->get_all_with_events();
		$pending = array();

		foreach ($items as $item) {
			if ('application' === $item['request_type'] && 'bewerbung' === $item['response_status']) {
				$pending[] = $item;
			}
		}

		return $pending;
	}

	/**
	 * Get one event data record.
	 *
	 * @param int $event_id Event ID.
	 * @return array|null
	 */
	public function get_event_data($event_id) {
		$post = get_post((int) $event_id);

		if (! $post || 'ttm_event' !== $post->post_type) {
			return null;
		}

		return $this->build_event_data($post);
	}

	/**
	 * Update response after email link or admin decision.
	 *
	 * @param int         $invitation_id Entry ID.
	 * @param string      $status Status.
	 * @param string|null $comment Comment.
	 * @return bool
	 */
	public function record_response($invitation_id, $status, $comment = null) {
		return $this->update(
			$invitation_id,
			array(
				'response_status' => $status,
				'responded_at'    => current_time('mysql', true),
				'comment'         => null !== $comment ? $comment : '',
			)
		);
	}

	/**
	 * Reset response and refresh token.
	 *
	 * @param int $invitation_id Entry ID.
	 * @return bool
	 */
	public function reset_response($invitation_id) {
		return $this->update(
			$invitation_id,
			array(
				'response_status'  => 'offen',
				'responded_at'     => null,
				'comment'          => '',
				'token'            => $this->generate_token(),
				'token_expires_at' => $this->get_default_expiry(),
			)
		);
	}

	/**
	 * Mark mail state.
	 *
	 * @param int    $invitation_id Entry ID.
	 * @param string $status Mail status.
	 * @return bool
	 */
	public function mark_mail_status($invitation_id, $status) {
		return $this->update(
			$invitation_id,
			array(
				'mail_status'  => $status,
				'mail_sent_at' => 'sent' === $status ? current_time('mysql', true) : null,
			)
		);
	}

	/**
	 * Get entries for logged in user by email match.
	 *
	 * @param WP_User $user User.
	 * @return array
	 */
	public function get_for_user($user) {
		global $wpdb;

		$email = strtolower(sanitize_email($user->user_email));
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$this->table_name}
				WHERE LOWER(email) = %s
				ORDER BY created_at DESC",
				$email
			),
			ARRAY_A
		);

		return $this->attach_event_data($rows);
	}

	/**
	 * Get all entries with event data.
	 *
	 * @return array
	 */
	public function get_all_with_events() {
		global $wpdb;

		$rows = $wpdb->get_results("SELECT * FROM {$this->table_name} ORDER BY created_at DESC", ARRAY_A);

		return $this->attach_event_data($rows);
	}

	/**
	 * Check access by email.
	 *
	 * @param array   $invitation Entry.
	 * @param WP_User $user User.
	 * @return bool
	 */
	public function user_can_access($invitation, $user) {
		if (empty($invitation) || empty($user->user_email)) {
			return false;
		}

		return strtolower((string) $invitation['email']) === strtolower((string) $user->user_email);
	}

	/**
	 * Count confirmed places.
	 *
	 * @param int $event_id Event ID.
	 * @param int $exclude_invitation_id Optional excluded ID.
	 * @return int
	 */
	public function count_confirmed_for_event($event_id, $exclude_invitation_id = 0) {
		global $wpdb;

		$sql  = "SELECT COUNT(*) FROM {$this->table_name} WHERE event_id = %d AND response_status = %s";
		$args = array((int) $event_id, 'zugesagt');

		if ($exclude_invitation_id > 0) {
			$sql   .= ' AND id != %d';
			$args[] = (int) $exclude_invitation_id;
		}

		return (int) $wpdb->get_var($wpdb->prepare($sql, $args));
	}

	/**
	 * Capacity of an event.
	 *
	 * @param int $event_id Event ID.
	 * @return int
	 */
	public function get_event_capacity($event_id) {
		return max(0, (int) get_post_meta($event_id, '_ttm_event_capacity', true));
	}

	/**
	 * Remaining places for event.
	 *
	 * @param int $event_id Event ID.
	 * @return int|null
	 */
	public function get_available_slots($event_id) {
		$capacity = $this->get_event_capacity($event_id);

		if ($capacity <= 0) {
			return null;
		}

		return max(0, $capacity - $this->count_confirmed_for_event($event_id));
	}

	/**
	 * Is event full.
	 *
	 * @param int $event_id Event ID.
	 * @param int $exclude_invitation_id Excluded entry.
	 * @return bool
	 */
	public function is_event_full($event_id, $exclude_invitation_id = 0) {
		$capacity = $this->get_event_capacity($event_id);

		if ($capacity <= 0) {
			return false;
		}

		return $this->count_confirmed_for_event($event_id, $exclude_invitation_id) >= $capacity;
	}

	/**
	 * Get accepted participant names.
	 *
	 * @param int $event_id Event ID.
	 * @return array
	 */
	public function get_confirmed_names_by_event($event_id) {
		$rows  = $this->get_by_event($event_id);
		$names = array();

		foreach ($rows as $row) {
			if ('zugesagt' === $row['response_status']) {
				$names[] = $row['name'];
			}
		}

		return $names;
	}

	/**
	 * Get confirmed attendees for an event.
	 *
	 * @param int $event_id Event ID.
	 * @return array
	 */
	public function get_confirmed_attendees_by_event($event_id) {
		$rows      = $this->get_by_event($event_id);
		$confirmed = array();

		foreach ($rows as $row) {
			if ('zugesagt' === $row['response_status']) {
				$confirmed[] = $row;
			}
		}

		return $confirmed;
	}

	/**
	 * Get all events enriched for calendars.
	 *
	 * @param bool $only_active Only active events.
	 * @return array
	 */
	public function get_events_for_calendar($only_active = true) {
		$posts = get_posts(
			array(
				'post_type'      => 'ttm_event',
				'post_status'    => array('publish', 'draft', 'private', 'future', 'pending'),
				'posts_per_page' => -1,
				'orderby'        => 'meta_value',
				'meta_key'       => '_ttm_event_date',
				'order'          => 'ASC',
			)
		);

		$items = array();

		foreach ($posts as $post) {
			$status = get_post_meta($post->ID, '_ttm_event_status', true);

			if ($only_active && 'abgesagt' === $status) {
				continue;
			}

			$items[] = $this->build_event_data($post);
		}

		return $items;
	}

	/**
	 * Attach event data to entry rows.
	 *
	 * @param array $rows Entry rows.
	 * @return array
	 */
	private function attach_event_data($rows) {
		$results = array();

		foreach ($rows as $row) {
			$event = get_post((int) $row['event_id']);

			if (! $event || 'ttm_event' !== $event->post_type || in_array($event->post_status, array('trash', 'auto-draft', 'inherit'), true)) {
				continue;
			}

			$row['post_title']        = $event->post_title;
			$row['post_content']      = $event->post_content;
			$row['event_post_status'] = $event->post_status;
			$row['event_date']        = get_post_meta($event->ID, '_ttm_event_date', true);
			$row['event_time']        = get_post_meta($event->ID, '_ttm_event_time', true);
			$row['event_end_time']    = get_post_meta($event->ID, '_ttm_event_end_time', true);
			$row['event_location']    = get_post_meta($event->ID, '_ttm_event_location', true);
			$row['event_capacity']    = get_post_meta($event->ID, '_ttm_event_capacity', true);
			$row['event_status']      = get_post_meta($event->ID, '_ttm_event_status', true);

			$results[] = $row;
		}

		usort(
			$results,
			static function ( $a, $b ) {
				$a_stamp = strtotime(($a['event_date'] ?: '1970-01-01') . ' ' . ($a['event_time'] ?: '00:00'));
				$b_stamp = strtotime(($b['event_date'] ?: '1970-01-01') . ' ' . ($b['event_time'] ?: '00:00'));
				return $a_stamp <=> $b_stamp;
			}
		);

		return $results;
	}

	/**
	 * Build stable event data record.
	 *
	 * @param WP_Post $post Event post.
	 * @return array
	 */
	private function build_event_data($post) {
		$capacity        = $this->get_event_capacity($post->ID);
		$confirmed_count = $this->count_confirmed_for_event($post->ID);
		$confirmed_names = $this->get_confirmed_names_by_event($post->ID);
		$event_date      = get_post_meta($post->ID, '_ttm_event_date', true);

		return array(
			'event_id'         => (int) $post->ID,
			'post_title'       => $post->post_title,
			'post_content'     => $post->post_content,
			'event_date'       => $event_date,
			'event_time'       => get_post_meta($post->ID, '_ttm_event_time', true),
			'event_end_time'   => get_post_meta($post->ID, '_ttm_event_end_time', true),
			'event_location'   => get_post_meta($post->ID, '_ttm_event_location', true),
			'event_status'     => get_post_meta($post->ID, '_ttm_event_status', true),
			'event_price'      => (float) get_post_meta($post->ID, '_ttm_event_price', true),
			'capacity'         => $capacity,
			'confirmed_count'  => $confirmed_count,
			'available_slots'  => $capacity > 0 ? max(0, $capacity - $confirmed_count) : null,
			'confirmed_names'  => $confirmed_names,
			'calendar_day'     => ! empty($event_date) ? (int) gmdate('j', strtotime($event_date)) : 0,
			'calendar_month'   => ! empty($event_date) ? (int) gmdate('n', strtotime($event_date)) : 0,
			'calendar_year'    => ! empty($event_date) ? (int) gmdate('Y', strtotime($event_date)) : 0,
		);
	}

	/**
	 * Build email lookup key.
	 *
	 * @param string $email Email.
	 * @return string
	 */
	private function build_lookup_key($email) {
		return 'email:' . strtolower(sanitize_email($email));
	}
		/**
		 * Delete all invitations for an event.
	 *
	 * @param int $event_id Event ID.
	 * @return int Number of deleted rows.
	 */
	public function delete_by_event($event_id) {
		global $wpdb;
		$table = $wpdb->prefix . 'ttm_invitations';
		return $wpdb->delete($table, array('event_id' => (int) $event_id), array('%d'));
	}
}
