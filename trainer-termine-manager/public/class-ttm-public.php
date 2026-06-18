<?php
/**
 * Frontend logic.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Public {
	/**
	 * Repository.
	 *
	 * @var TTM_Invitation_Repository
	 */
	private $repository;

	/**
	 * Constructor.
	 *
	 * @param TTM_Invitation_Repository $repository Repository.
	 */
	public function __construct($repository) {
		$this->repository = $repository;

		add_shortcode('trainer_termine_dashboard', array($this, 'render_trainer_dashboard_shortcode'));
		add_shortcode('trainer_termine_verwaltung', array($this, 'render_management_dashboard_shortcode'));
		add_action('wp_enqueue_scripts', array($this, 'enqueue_assets'));
		add_action('template_redirect', array($this, 'handle_public_token_response'));
		add_action('admin_post_ttm_frontend_response', array($this, 'handle_frontend_response'));
		add_action('admin_post_ttm_submit_application', array($this, 'handle_application_submit'));
		add_action('admin_post_nopriv_ttm_submit_application', array($this, 'handle_application_submit'));
		add_action('admin_post_ttm_manage_application', array($this, 'handle_management_application_action'));
		add_action('admin_post_ttm_frontend_event_save', array($this, 'handle_frontend_event_save'));
		add_action('admin_post_ttm_frontend_send_invites', array($this, 'handle_frontend_send_invites'));
		add_action('admin_post_ttm_frontend_event_delete', array($this, 'handle_frontend_event_delete'));
	}

	/**
	 * Enqueue assets.
	 *
	 * @return void
	 */
	public function enqueue_assets() {
		wp_register_style('ttm-public', TTM_URL . 'assets/css/ttm-public.css', array(), TTM_VERSION);
		wp_register_script('ttm-public', TTM_URL . 'assets/js/ttm-public.js', array(), TTM_VERSION, true);
	}

	/**
	 * Render public trainer dashboard.
	 *
	 * @return string
	 */
	public function render_trainer_dashboard_shortcode() {
		wp_enqueue_style('ttm-public');
		wp_enqueue_script('ttm-public');

		$selected_event_id = isset($_GET['ttm_event']) ? absint($_GET['ttm_event']) : 0;
		$context           = $this->get_calendar_context();
		$current_email     = is_user_logged_in() ? wp_get_current_user()->user_email : '';
		$events            = $this->prepare_event_cards($this->repository->get_events_for_calendar(true), $current_email);
		$selected_event    = $selected_event_id ? $this->find_event_in_collection($events, $selected_event_id) : null;
		$notice            = isset($_GET['ttm_notice']) ? sanitize_key(wp_unslash($_GET['ttm_notice'])) : '';
		$calendar          = $this->build_calendar_markup($events, __('Trainer-Kalender', 'trainer-termine-manager'), $context, $selected_event_id);
		$applications      = is_user_logged_in() ? $this->repository->get_for_user(wp_get_current_user()) : array();

		ob_start();
		include TTM_PATH . 'templates/frontend-dashboard.php';
		return (string) ob_get_clean();
	}

	/**
	 * Render management dashboard.
	 *
	 * @return string
	 */
	public function render_management_dashboard_shortcode() {
		if (! is_user_logged_in() || ! $this->can_access_management_dashboard()) {
			return '';
		}

		wp_enqueue_style('ttm-public');
		wp_enqueue_script('ttm-public');

		$selected_event_id    = isset($_GET['ttm_event']) ? absint($_GET['ttm_event']) : 0;
		$context              = $this->get_calendar_context();
		$app_scope            = $this->get_application_scope($selected_event_id);
		$events               = $this->prepare_event_cards($this->repository->get_events_for_calendar(false));
		$selected_event       = $selected_event_id ? $this->find_event_in_collection($events, $selected_event_id) : null;
		$all_pending          = $this->repository->get_pending_applications();
		$pending_applications = $this->filter_pending_applications($all_pending, $app_scope, $context, $selected_event_id);
		$direct_invites       = $selected_event ? $this->repository->get_by_event($selected_event_id, 'invite') : array();
		$calendar             = $this->build_calendar_markup($events, __('Verwaltungskalender', 'trainer-termine-manager'), $context, $selected_event_id);
		$notice               = isset($_GET['ttm_notice']) ? sanitize_key(wp_unslash($_GET['ttm_notice'])) : '';
		$application_filter_urls = $this->build_application_filter_urls($context, $selected_event_id);

		ob_start();
		include TTM_PATH . 'templates/management-dashboard.php';
		return (string) ob_get_clean();
	}

	/**
	 * Handle public application form.
	 *
	 * @return void
	 */
	public function handle_application_submit() {
		check_admin_referer('ttm_submit_application');

		$event_id = isset($_POST['ttm_event_id']) ? absint($_POST['ttm_event_id']) : 0;
		$redirect = isset($_POST['ttm_redirect']) ? esc_url_raw(wp_unslash($_POST['ttm_redirect'])) : home_url('/');

		$data = array(
			'event_id'              => $event_id,
			'name'                  => sanitize_text_field(wp_unslash($_POST['ttm_name'] ?? '')),
			'email'                 => sanitize_email(wp_unslash($_POST['ttm_email'] ?? '')),
			'trainer_qualification' => ! empty($_POST['ttm_trainer_qualification']) ? 1 : 0,
			'club_member'           => ! empty($_POST['ttm_club_member']) ? 1 : 0,
			'club_name'             => sanitize_text_field(wp_unslash($_POST['ttm_club_name'] ?? '')),
		);

		if (! $event_id || empty($data['name']) || ! is_email($data['email'])) {
			wp_safe_redirect(add_query_arg(array('ttm_notice' => 'invalid_application', 'ttm_event' => $event_id), $redirect));
			exit;
		}

		if ($this->repository->is_event_full($event_id)) {
			wp_safe_redirect(add_query_arg(array('ttm_notice' => 'full', 'ttm_event' => $event_id), $redirect));
			exit;
		}

		$result = $this->repository->create_application($data);

		if (! $result) {
			wp_safe_redirect(add_query_arg(array('ttm_notice' => 'application_failed', 'ttm_event' => $event_id), $redirect));
			exit;
		}

		wp_safe_redirect(add_query_arg(array('ttm_notice' => 'application_sent', 'ttm_event' => $event_id), $redirect));
		exit;
	}

	/**
	 * Handle application decision.
	 *
	 * @return void
	 */
	public function handle_management_application_action() {
		if (! is_user_logged_in() || ! $this->can_access_management_dashboard()) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		check_admin_referer('ttm_manage_application');

		$entry_id = isset($_POST['ttm_invitation_id']) ? absint($_POST['ttm_invitation_id']) : 0;
		$decision = isset($_POST['ttm_decision']) ? sanitize_key(wp_unslash($_POST['ttm_decision'])) : '';
		$redirect = isset($_POST['ttm_redirect']) ? esc_url_raw(wp_unslash($_POST['ttm_redirect'])) : home_url('/');
		$entry    = $this->repository->get($entry_id);

		if (! $entry || 'application' !== $entry['request_type']) {
			wp_safe_redirect(add_query_arg('ttm_notice', 'invalid', $redirect));
			exit;
		}

		if ('approve' === $decision) {
			if ($this->repository->is_event_full((int) $entry['event_id'], $entry_id)) {
				wp_safe_redirect(add_query_arg(array('ttm_notice' => 'full', 'ttm_event' => (int) $entry['event_id']), $redirect));
				exit;
			}

			$this->repository->record_response($entry_id, 'zugesagt');
			
			// Sende Bestätigungsmail
			$mailer = TTM_Plugin::instance()->get_mailer();
			$mailer->send_acceptance_confirmation((int) $entry['event_id'], $entry);
			
			wp_safe_redirect(add_query_arg(array('ttm_notice' => 'application_approved', 'ttm_event' => (int) $entry['event_id']), $redirect));
			exit;
		}

		if ('reject' === $decision) {
			$this->repository->record_response($entry_id, 'abgesagt');
			
			// Sende Bestätigungsmail
			$mailer = TTM_Plugin::instance()->get_mailer();
			$mailer->send_decline_confirmation((int) $entry['event_id'], $entry);
			
			wp_safe_redirect(add_query_arg(array('ttm_notice' => 'application_rejected', 'ttm_event' => (int) $entry['event_id']), $redirect));
			exit;
		}

		wp_safe_redirect(add_query_arg('ttm_notice', 'invalid', $redirect));
		exit;
	}

	/**
	 * Save event in frontend management.
	 *
	 * @return void
	 */
	public function handle_frontend_event_save() {
		if (! is_user_logged_in() || ! $this->can_access_management_dashboard()) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		check_admin_referer('ttm_frontend_event_save');

		$event_id = isset($_POST['ttm_event_id']) ? absint($_POST['ttm_event_id']) : 0;
		$redirect = isset($_POST['ttm_redirect']) ? esc_url_raw(wp_unslash($_POST['ttm_redirect'])) : home_url('/');

		$post_data = array(
			'post_type'    => 'ttm_event',
			'post_title'   => sanitize_text_field(wp_unslash($_POST['ttm_event_title'] ?? '')),
			'post_content' => wp_kses_post(wp_unslash($_POST['ttm_event_description'] ?? '')),
			'post_status'  => 'publish',
		);

		if ($event_id) {
			$post_data['ID'] = $event_id;
			$event_id        = wp_update_post($post_data, true);
		} else {
			$event_id = wp_insert_post($post_data, true);
		}

		if (is_wp_error($event_id) || ! $event_id) {
			wp_safe_redirect(add_query_arg('ttm_notice', 'event_failed', $redirect));
			exit;
		}

		update_post_meta($event_id, '_ttm_event_date', sanitize_text_field(wp_unslash($_POST['ttm_event_date'] ?? '')));
		update_post_meta($event_id, '_ttm_event_time', sanitize_text_field(wp_unslash($_POST['ttm_event_time'] ?? '')));
		update_post_meta($event_id, '_ttm_event_end_time', sanitize_text_field(wp_unslash($_POST['ttm_event_end_time'] ?? '')));
		update_post_meta($event_id, '_ttm_event_location', sanitize_text_field(wp_unslash($_POST['ttm_event_location'] ?? '')));
		update_post_meta($event_id, '_ttm_event_status', sanitize_key(wp_unslash($_POST['ttm_event_status'] ?? 'aktiv')));
		update_post_meta($event_id, '_ttm_event_capacity', max(0, absint($_POST['ttm_event_capacity'] ?? 0)));
		update_post_meta($event_id, '_ttm_event_price', number_format((float) ($_POST['ttm_event_price'] ?? 0), 2, '.', ''));

		if (! empty($_POST['ttm_repeat_weekly'])) {
			$this->create_recurring_events(
				$event_id,
				absint($_POST['ttm_repeat_count'] ?? 0)
			);
		}

		wp_safe_redirect(add_query_arg(array('ttm_notice' => 'event_saved', 'ttm_event' => $event_id), $redirect));
		exit;
	}

	/**
	 * Handle frontend direct invites.
	 *
	 * @return void
	 */
	public function handle_frontend_send_invites() {
		if (! is_user_logged_in() || ! $this->can_access_management_dashboard()) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		check_admin_referer('ttm_frontend_send_invites');

		$event_id   = isset($_POST['ttm_event_id']) ? absint($_POST['ttm_event_id']) : 0;
		$redirect   = isset($_POST['ttm_redirect']) ? esc_url_raw(wp_unslash($_POST['ttm_redirect'])) : home_url('/');
		$names      = isset($_POST['ttm_invite_name']) ? array_map('sanitize_text_field', (array) wp_unslash($_POST['ttm_invite_name'])) : array();
		$emails     = isset($_POST['ttm_invite_email']) ? array_map('sanitize_email', (array) wp_unslash($_POST['ttm_invite_email'])) : array();
		$fees       = isset($_POST['ttm_invite_honorarium']) ? array_map('floatval', (array) wp_unslash($_POST['ttm_invite_honorarium'])) : array();
		$people     = array();

		foreach ($emails as $index => $email) {
			$name = $names[ $index ] ?? '';

			if (empty($name) || empty($email)) {
				continue;
			}

			$people[] = array(
				'name'       => $name,
				'email'      => $email,
				'honorarium' => (float) ($fees[ $index ] ?? 0),
			);
		}

		$this->repository->sync_event_invitations($event_id, $people);

		if (! empty($_POST['ttm_send_now'])) {
			$sent = TTM_Plugin::instance()->get_mailer()->send_event_invitations($event_id);

			if ($sent < 1 && ! empty($people)) {
				wp_safe_redirect(add_query_arg(array('ttm_notice' => 'invite_send_failed', 'ttm_event' => $event_id), $redirect));
				exit;
			}
		}

		wp_safe_redirect(add_query_arg(array('ttm_notice' => 'invites_saved', 'ttm_event' => $event_id), $redirect));
		exit;
	}

	/**
	 * Delete event in frontend management and notify confirmed attendees.
	 *
	 * @return void
	 */
	public function handle_frontend_event_delete() {
		if (! is_user_logged_in() || ! $this->can_access_management_dashboard()) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		check_admin_referer('ttm_frontend_event_delete');

		$event_id = isset($_POST['ttm_event_id']) ? absint($_POST['ttm_event_id']) : 0;
		$redirect = isset($_POST['ttm_redirect']) ? esc_url_raw(wp_unslash($_POST['ttm_redirect'])) : home_url('/');
		$reason   = isset($_POST['ttm_cancellation_reason']) ? sanitize_textarea_field(wp_unslash($_POST['ttm_cancellation_reason'])) : '';

		if (! $event_id || 'ttm_event' !== get_post_type($event_id)) {
			wp_safe_redirect(add_query_arg('ttm_notice', 'event_delete_failed', $redirect));
			exit;
		}

		$confirmed_count = $this->repository->count_confirmed_for_event($event_id);
		$sent_count      = TTM_Plugin::instance()->get_mailer()->send_event_cancellation_notifications($event_id, $reason);
		$this->repository->delete_by_event($event_id);

		$deleted = wp_delete_post($event_id, true);

		if (! $deleted) {
			wp_safe_redirect(add_query_arg('ttm_notice', 'event_delete_failed', $redirect));
			exit;
		}

		wp_safe_redirect(
			add_query_arg(
				array(
					'ttm_notice'    => 'event_deleted',
					'ttm_confirmed' => $confirmed_count,
					'ttm_notified'  => $sent_count,
				),
				$redirect
			)
		);
		exit;
	}

	/**
	 * Handle public token responses.
	 *
	 * @return void
	 */
	public function handle_public_token_response() {
		$invitation_id = absint(get_query_var('ttm_invite'));
		$action        = sanitize_key((string) get_query_var('ttm_action'));
		$token         = sanitize_text_field((string) get_query_var('ttm_token'));

		if (! $invitation_id || ! in_array($action, array('accept', 'decline'), true) || empty($token)) {
			return;
		}

		$entry   = $this->repository->get_by_token($invitation_id, $token);
		$type    = 'error';
		$message = __('Dieser Link ist ungültig oder abgelaufen.', 'trainer-termine-manager');

		if ($entry && strtotime($entry['token_expires_at'] . ' UTC') >= time()) {
			$status = 'accept' === $action ? 'zugesagt' : 'abgesagt';

			if ('accept' === $action && 'zugesagt' !== $entry['response_status'] && $this->repository->is_event_full((int) $entry['event_id'], $invitation_id)) {
				$message = __('Leider sind bereits alle Plätze vergeben.', 'trainer-termine-manager');
			} else {
				$this->repository->record_response($invitation_id, $status);
				
				// Sende Bestätigungsmail
				$mailer = TTM_Plugin::instance()->get_mailer();
				if ('accept' === $action) {
					$mailer->send_acceptance_confirmation((int) $entry['event_id'], $entry);
				} else {
					$mailer->send_decline_confirmation((int) $entry['event_id'], $entry);
				}
				
				$type    = 'success';
				$message = 'accept' === $action ? __('Danke, du hast zugesagt.', 'trainer-termine-manager') : __('Danke, du hast abgesagt.', 'trainer-termine-manager');
			}
		}

		status_header('success' === $type ? 200 : 400);
		nocache_headers();
		include TTM_PATH . 'templates/public-response.php';
		exit;
	}

	/**
	 * Handle logged in response changes.
	 *
	 * @return void
	 */
	public function handle_frontend_response() {
		if (! is_user_logged_in()) {
			wp_safe_redirect(wp_login_url());
			exit;
		}

		check_admin_referer('ttm_frontend_response');

		$invitation_id = isset($_POST['ttm_invitation_id']) ? absint($_POST['ttm_invitation_id']) : 0;
		$status        = isset($_POST['ttm_response']) ? sanitize_key(wp_unslash($_POST['ttm_response'])) : '';
		$redirect      = isset($_POST['ttm_redirect']) ? esc_url_raw(wp_unslash($_POST['ttm_redirect'])) : home_url('/');
		$invitation    = $this->repository->get($invitation_id);

		if (! in_array($status, array('zugesagt', 'abgesagt'), true) || ! $invitation || ! $this->repository->user_can_access($invitation, wp_get_current_user())) {
			wp_safe_redirect(add_query_arg('ttm_notice', 'invalid', $redirect));
			exit;
		}

		if ('zugesagt' === $status && 'zugesagt' !== $invitation['response_status'] && $this->repository->is_event_full((int) $invitation['event_id'], $invitation_id)) {
			wp_safe_redirect(add_query_arg('ttm_notice', 'full', $redirect));
			exit;
		}

		$this->repository->record_response($invitation_id, $status);
		
		// Sende Bestätigungsmail
		$mailer = TTM_Plugin::instance()->get_mailer();
		if ('zugesagt' === $status) {
			$mailer->send_acceptance_confirmation((int) $invitation['event_id'], $invitation);
		} else {
			$mailer->send_decline_confirmation((int) $invitation['event_id'], $invitation);
		}

		wp_safe_redirect(add_query_arg('ttm_notice', 'zugesagt' === $status ? 'accepted' : 'declined', $redirect));
		exit;
	}

	/**
	 * Prepare event records with applicant state.
	 *
	 * @param array       $events Events.
	 * @param string|null $email Email.
	 * @return array
	 */
	private function prepare_event_cards($events, $email = null) {
		$results = array();

		foreach ($events as $event) {
			$existing = $email ? $this->repository->get_application_for_event_email((int) $event['event_id'], $email) : null;
			$event['user_entry']     = $existing;
			$event['can_apply']      = ! $existing && ! $this->repository->is_event_full((int) $event['event_id']);
			$event['display_status'] = $existing ? $existing['response_status'] : 'offen';
			$event['hover_summary']  = $this->build_hover_summary($event);
			$results[]              = $event;
		}

		return $results;
	}

	/**
	 * Build tooltip summary.
	 *
	 * @param array $event Event.
	 * @return string
	 */
	private function build_hover_summary($event) {
		$parts   = array();
		$parts[] = sprintf(__('Zugesagt: %s', 'trainer-termine-manager'), empty($event['confirmed_names']) ? __('Noch niemand', 'trainer-termine-manager') : implode(', ', $event['confirmed_names']));

		if (! empty($event['capacity'])) {
			$parts[] = sprintf(__('%1$d von %2$d Plätzen belegt', 'trainer-termine-manager'), (int) $event['confirmed_count'], (int) $event['capacity']);
		}

		return implode(' | ', $parts);
	}

	/**
	 * Get selected month/year context.
	 *
	 * @return array
	 */
	private function get_calendar_context() {
		$month = isset($_GET['ttm_month']) ? absint($_GET['ttm_month']) : (int) wp_date('n');
		$year  = isset($_GET['ttm_year']) ? absint($_GET['ttm_year']) : (int) wp_date('Y');

		if ($month < 1 || $month > 12) {
			$month = (int) wp_date('n');
		}

		if ($year < 2020 || $year > 2100) {
			$year = (int) wp_date('Y');
		}

		return array(
			'month' => $month,
			'year'  => $year,
		);
	}

	/**
	 * Get current applications filter scope.
	 *
	 * @param int $selected_event_id Selected event.
	 * @return string
	 */
	private function get_application_scope($selected_event_id) {
		$scope = isset($_GET['ttm_app_scope']) ? sanitize_key(wp_unslash($_GET['ttm_app_scope'])) : 'month';

		if (! in_array($scope, array('day', 'month', 'year', 'all'), true)) {
			$scope = 'month';
		}

		if ('day' === $scope && ! $selected_event_id) {
			$scope = 'month';
		}

		return $scope;
	}

	/**
	 * Filter pending applications by selected scope.
	 *
	 * @param array  $applications Applications.
	 * @param string $scope Scope.
	 * @param array  $context Month/year context.
	 * @param int    $selected_event_id Event ID.
	 * @return array
	 */
	private function filter_pending_applications($applications, $scope, $context, $selected_event_id) {
		$results = array();

		foreach ($applications as $application) {
			$event_month = ! empty($application['event_date']) ? (int) wp_date('n', strtotime($application['event_date'])) : 0;
			$event_year  = ! empty($application['event_date']) ? (int) wp_date('Y', strtotime($application['event_date'])) : 0;

			if ('day' === $scope && (int) $application['event_id'] !== (int) $selected_event_id) {
				continue;
			}

			if ('month' === $scope && ($event_month !== (int) $context['month'] || $event_year !== (int) $context['year'])) {
				continue;
			}

			if ('year' === $scope && $event_year !== (int) $context['year']) {
				continue;
			}

			$results[] = $application;
		}

		return $results;
	}

	/**
	 * Build URLs for application filters.
	 *
	 * @param array $context Month/year context.
	 * @param int   $selected_event_id Event ID.
	 * @return array
	 */
	private function build_application_filter_urls($context, $selected_event_id) {
		$base_url = get_permalink();
		$common   = array(
			'ttm_month' => (int) $context['month'],
			'ttm_year'  => (int) $context['year'],
		);

		if ($selected_event_id) {
			$common['ttm_event'] = (int) $selected_event_id;
		}

		return array(
			'day'   => $selected_event_id ? add_query_arg(array_merge($common, array('ttm_app_scope' => 'day')), $base_url) : '',
			'month' => add_query_arg(array_merge($common, array('ttm_app_scope' => 'month')), $base_url),
			'year'  => add_query_arg(array_merge($common, array('ttm_app_scope' => 'year')), $base_url),
			'all'   => add_query_arg(array_merge($common, array('ttm_app_scope' => 'all')), $base_url),
		);
	}

	/**
	 * Build calendar HTML.
	 *
	 * @param array  $events Events.
	 * @param string $title Title.
	 * @param array  $context Month context.
	 * @param int    $selected_event_id Selected event.
	 * @return string
	 */
	private function build_calendar_markup($events, $title, $context, $selected_event_id = 0) {
		$current_month = (int) $context['month'];
		$current_year  = (int) $context['year'];
		$days_in_month = (int) wp_date('t', strtotime($current_year . '-' . $current_month . '-01'));
		$first_weekday = (int) wp_date('N', strtotime($current_year . '-' . $current_month . '-01'));
		$event_map     = array();
		$prev_stamp    = strtotime($current_year . '-' . $current_month . '-01 -1 month');
		$next_stamp    = strtotime($current_year . '-' . $current_month . '-01 +1 month');
		$base_url      = get_permalink();
		$prev_url      = add_query_arg(
			array(
				'ttm_month' => (int) wp_date('n', $prev_stamp),
				'ttm_year'  => (int) wp_date('Y', $prev_stamp),
				'ttm_event' => $selected_event_id,
			),
			$base_url
		);
		$next_url      = add_query_arg(
			array(
				'ttm_month' => (int) wp_date('n', $next_stamp),
				'ttm_year'  => (int) wp_date('Y', $next_stamp),
				'ttm_event' => $selected_event_id,
			),
			$base_url
		);

		foreach ($events as $event) {
			if ((int) $event['calendar_month'] === $current_month && (int) $event['calendar_year'] === $current_year) {
				$event['detail_url'] = add_query_arg(
					array(
						'ttm_month' => $current_month,
						'ttm_year'  => $current_year,
						'ttm_event' => (int) $event['event_id'],
					),
					$base_url
				);
				$event_map[ (int) $event['calendar_day'] ][] = $event;
			}
		}

		ob_start();
		include TTM_PATH . 'templates/calendar.php';
		return (string) ob_get_clean();
	}

	/**
	 * Find event in collection.
	 *
	 * @param array $events Events.
	 * @param int   $event_id Event ID.
	 * @return array|null
	 */
	private function find_event_in_collection($events, $event_id) {
		foreach ($events as $event) {
			if ((int) $event['event_id'] === (int) $event_id) {
				return $event;
			}
		}

		return $this->repository->get_event_data($event_id);
	}

	/**
	 * Create weekly recurring copies.
	 *
	 * @param int $event_id Base event.
	 * @param int $count Count.
	 * @return void
	 */
	private function create_recurring_events($event_id, $count) {
		$base_date = get_post_meta($event_id, '_ttm_event_date', true);
		$post      = get_post($event_id);

		if (empty($base_date) || ! $post || $count <= 0) {
			return;
		}

		for ($week = 1; $week <= $count; $week++) {
			$new_date = gmdate('Y-m-d', strtotime($base_date . ' +' . $week . ' week'));
			$new_id   = wp_insert_post(
				array(
					'post_type'    => 'ttm_event',
					'post_status'  => $post->post_status,
					'post_title'   => $post->post_title,
					'post_content' => $post->post_content,
				)
			);

			if (! $new_id || is_wp_error($new_id)) {
				continue;
			}

			update_post_meta($new_id, '_ttm_event_date', $new_date);
			update_post_meta($new_id, '_ttm_event_time', get_post_meta($event_id, '_ttm_event_time', true));
			update_post_meta($new_id, '_ttm_event_end_time', get_post_meta($event_id, '_ttm_event_end_time', true));
			update_post_meta($new_id, '_ttm_event_location', get_post_meta($event_id, '_ttm_event_location', true));
			update_post_meta($new_id, '_ttm_event_status', get_post_meta($event_id, '_ttm_event_status', true));
			update_post_meta($new_id, '_ttm_event_capacity', get_post_meta($event_id, '_ttm_event_capacity', true));
			update_post_meta($new_id, '_ttm_event_price', get_post_meta($event_id, '_ttm_event_price', true));
		}
	}

	/**
	 * Check management access.
	 *
	 * @return bool
	 */
	private function can_access_management_dashboard() {
		return current_user_can('manage_options') || current_user_can('edit_others_posts');
	}

	/**
	 * Format event datetime.
	 *
	 * @param array $event Event.
	 * @return string
	 */
	public static function format_event_datetime($event) {
		$date = ! empty($event['event_date']) ? $event['event_date'] : '';
		$time     = ! empty($event['event_time']) ? $event['event_time'] : '';
		$end_time = ! empty($event['event_end_time']) ? $event['event_end_time'] : '';

		if (empty($date)) {
			return '';
		}

		$formatted = wp_date(get_option('date_format'), strtotime($date));

		if (! empty($time) && ! empty($end_time)) {
			$formatted .= ' • ' . $time . ' - ' . $end_time;
		} elseif (! empty($time)) {
			$formatted .= ' • ' . $time;
		}

		return $formatted;
	}

	/**
	 * Format response datetime.
	 *
	 * @param string|null $value Datetime.
	 * @return string
	 */
	public static function format_response_datetime($value) {
		if (empty($value)) {
			return __('Noch keine Antwort', 'trainer-termine-manager');
		}

		return wp_date(get_option('date_format') . ' ' . get_option('time_format'), strtotime($value . ' UTC'));
	}
}
