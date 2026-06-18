<?php
/**
 * Admin logic.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

class TTM_Admin {
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
	 * Constructor.
	 *
	 * @param TTM_Invitation_Repository $repository Repository.
	 * @param TTM_Mailer                $mailer Mailer.
	 */
	public function __construct($repository, $mailer) {
		$this->repository = $repository;
		$this->mailer     = $mailer;

		add_action('add_meta_boxes', array($this, 'register_meta_boxes'));
		add_action('save_post_ttm_event', array($this, 'save_event'), 10, 3);
		add_filter('manage_ttm_event_posts_columns', array($this, 'set_event_columns'));
		add_action('manage_ttm_event_posts_custom_column', array($this, 'render_event_columns'), 10, 2);
		add_action('admin_menu', array($this, 'register_admin_pages'));
		add_action('admin_enqueue_scripts', array($this, 'enqueue_assets'));
		add_action('admin_notices', array($this, 'render_admin_notices'));
		add_action('admin_post_ttm_send_event_invitations', array($this, 'handle_send_event_invitations'));
		add_action('admin_post_ttm_invitation_action', array($this, 'handle_invitation_action'));
		add_action('admin_post_ttm_delete_event', array($this, 'handle_event_deletion'));
		add_action('edit_form_after_title', array($this, 'add_delete_button'));
	}

	/**
	 * Register boxes.
	 *
	 * @return void
	 */
	public function register_meta_boxes() {
		add_meta_box('ttm-event-details', __('Termindetails', 'trainer-termine-manager'), array($this, 'render_details_meta_box'), 'ttm_event', 'normal', 'high');
		add_meta_box('ttm-event-participants', __('Einladungen & Bewerbungen', 'trainer-termine-manager'), array($this, 'render_participants_meta_box'), 'ttm_event', 'normal', 'default');
	}

	/**
	 * Add backend submenu.
	 *
	 * @return void
	 */
	public function register_admin_pages() {
		add_submenu_page(
			'edit.php?post_type=ttm_event',
			__('Antwortübersicht', 'trainer-termine-manager'),
			__('Antwortübersicht', 'trainer-termine-manager'),
			'edit_posts',
			'ttm-responses',
			array($this, 'render_responses_page')
		);

		add_submenu_page(
			'edit.php?post_type=ttm_event',
			__('Offene Bewerbungen', 'trainer-termine-manager'),
			__('Offene Bewerbungen', 'trainer-termine-manager'),
			'edit_posts',
			'ttm-applications',
			array($this, 'render_applications_page')
		);
	}

	/**
	 * Enqueue admin assets.
	 *
	 * @return void
	 */
	public function enqueue_assets() {
		$screen = get_current_screen();

		if (! $screen) {
			return;
		}

		if ('ttm_event' !== $screen->post_type && 'ttm_event_page_ttm-responses' !== $screen->id && 'ttm_event_page_ttm-applications' !== $screen->id) {
			return;
		}

		wp_enqueue_style('ttm-admin', TTM_URL . 'assets/css/ttm-admin.css', array(), TTM_VERSION);
		wp_enqueue_script('ttm-admin', TTM_URL . 'assets/js/ttm-admin.js', array(), TTM_VERSION, true);
	}

	/**
	 * Admin notices.
	 *
	 * @return void
	 */
	public function render_admin_notices() {
		$screen = get_current_screen();

		if (! $screen) {
			return;
		}

		if ('ttm_event' !== $screen->post_type && 'ttm_event_page_ttm-responses' !== $screen->id && 'ttm_event_page_ttm-applications' !== $screen->id) {
			return;
		}

		$error = get_option('ttm_last_mail_error', '');
		$db_error = get_option('ttm_last_db_error', '');

		if (! empty($error)) {
			echo '<div class="notice notice-error"><p>' . esc_html__('Letzter Mailfehler:', 'trainer-termine-manager') . ' ' . esc_html($error) . '</p></div>';
			delete_option('ttm_last_mail_error');
		}

		if (! empty($db_error)) {
			echo '<div class="notice notice-error"><p>' . esc_html__('Letzter Datenbankfehler:', 'trainer-termine-manager') . ' ' . esc_html($db_error) . '</p></div>';
			delete_option('ttm_last_db_error');
		}
	}

	/**
	 * Render detail fields.
	 *
	 * @param WP_Post $post Event post.
	 * @return void
	 */
	public function render_details_meta_box($post) {
		wp_nonce_field('ttm_save_event', 'ttm_event_nonce');

		$date               = get_post_meta($post->ID, '_ttm_event_date', true);
		$time               = get_post_meta($post->ID, '_ttm_event_time', true);
		$end_time           = get_post_meta($post->ID, '_ttm_event_end_time', true);
		$place              = get_post_meta($post->ID, '_ttm_event_location', true);
		$status             = get_post_meta($post->ID, '_ttm_event_status', true);
		$capacity           = (int) get_post_meta($post->ID, '_ttm_event_capacity', true);
		$event_price        = get_post_meta($post->ID, '_ttm_event_price', true);
		$use_global_fee     = get_post_meta($post->ID, '_ttm_use_global_honorarium', true);
		$global_honorarium  = get_post_meta($post->ID, '_ttm_global_honorarium', true);
		?>
		<div class="ttm-admin-grid">
			<p><label for="ttm_event_date"><strong><?php esc_html_e('Datum', 'trainer-termine-manager'); ?></strong></label><br /><input type="date" id="ttm_event_date" name="ttm_event_date" value="<?php echo esc_attr($date); ?>" class="regular-text" required /></p>
			<p><label for="ttm_event_time"><strong><?php esc_html_e('Von', 'trainer-termine-manager'); ?></strong></label><br /><input type="time" id="ttm_event_time" name="ttm_event_time" value="<?php echo esc_attr($time); ?>" class="regular-text" /></p>
			<p><label for="ttm_event_end_time"><strong><?php esc_html_e('Bis', 'trainer-termine-manager'); ?></strong></label><br /><input type="time" id="ttm_event_end_time" name="ttm_event_end_time" value="<?php echo esc_attr($end_time); ?>" class="regular-text" /></p>
			<p><label for="ttm_event_location"><strong><?php esc_html_e('Ort', 'trainer-termine-manager'); ?></strong></label><br /><input type="text" id="ttm_event_location" name="ttm_event_location" value="<?php echo esc_attr($place); ?>" class="regular-text" /></p>
			<p><label for="ttm_event_status"><strong><?php esc_html_e('Terminstatus', 'trainer-termine-manager'); ?></strong></label><br />
				<select id="ttm_event_status" name="ttm_event_status">
					<option value="aktiv" <?php selected($status, 'aktiv'); ?>><?php esc_html_e('Aktiv', 'trainer-termine-manager'); ?></option>
					<option value="abgesagt" <?php selected($status, 'abgesagt'); ?>><?php esc_html_e('Abgesagt', 'trainer-termine-manager'); ?></option>
					<option value="entwurf" <?php selected($status, 'entwurf'); ?>><?php esc_html_e('Entwurf', 'trainer-termine-manager'); ?></option>
				</select>
			</p>
			<p><label for="ttm_event_capacity"><strong><?php esc_html_e('Maximale Plätze', 'trainer-termine-manager'); ?></strong></label><br /><input type="number" min="0" step="1" id="ttm_event_capacity" name="ttm_event_capacity" value="<?php echo esc_attr($capacity); ?>" class="small-text" /> <span class="description"><?php esc_html_e('0 = unbegrenzt', 'trainer-termine-manager'); ?></span></p>
			<p><label for="ttm_event_price"><strong><?php esc_html_e('Vergütung / Preis', 'trainer-termine-manager'); ?></strong></label><br /><input type="number" min="0" step="0.01" id="ttm_event_price" name="ttm_event_price" value="<?php echo esc_attr($event_price); ?>" class="small-text" /></p>
			<p class="ttm-admin-checkbox"><label><input type="checkbox" name="ttm_use_global_honorarium" value="1" <?php checked($use_global_fee, '1'); ?> /> <?php esc_html_e('Gleiches Honorar für alle Einladungen verwenden', 'trainer-termine-manager'); ?></label></p>
			<p><label for="ttm_global_honorarium"><strong><?php esc_html_e('Standard-Honorar', 'trainer-termine-manager'); ?></strong></label><br /><input type="number" min="0" step="0.01" id="ttm_global_honorarium" name="ttm_global_honorarium" value="<?php echo esc_attr($global_honorarium); ?>" class="small-text" /></p>
			<p class="ttm-admin-checkbox"><label><input type="checkbox" name="ttm_repeat_weekly" value="1" data-ttm-repeat-toggle="admin" /> <?php esc_html_e('Automatisch in Folgewochen wiederholen', 'trainer-termine-manager'); ?></label></p>
			<p data-ttm-repeat-field="admin" hidden><label for="ttm_repeat_count"><strong><?php esc_html_e('Anzahl weiterer Wochen', 'trainer-termine-manager'); ?></strong></label><br /><input type="number" min="1" max="52" step="1" id="ttm_repeat_count" name="ttm_repeat_count" value="1" class="small-text" /></p>
		</div>
		<p class="description"><?php esc_html_e('Beschreibung bitte im normalen WordPress-Inhaltsfeld oberhalb pflegen.', 'trainer-termine-manager'); ?></p>
		<?php
	}

	/**
	 * Render manual invites and applications.
	 *
	 * @param WP_Post $post Event post.
	 * @return void
	 */
	public function render_participants_meta_box($post) {
		$entries       = $this->repository->get_by_event($post->ID);
		$manual_invites = array();
		$applications   = array();

		foreach ($entries as $entry) {
			if ('application' === $entry['request_type']) {
				$applications[] = $entry;
			} else {
				$manual_invites[] = $entry;
			}
		}
		?>
		<div class="ttm-admin-section">
			<div class="ttm-admin-section-head">
				<h4><?php esc_html_e('Direkte Einladungen', 'trainer-termine-manager'); ?></h4>
				<button type="button" class="button button-secondary" data-ttm-add-row><?php esc_html_e('Teilnehmer hinzufügen', 'trainer-termine-manager'); ?></button>
			</div>
			<div class="ttm-manual-rows" data-ttm-rows>
				<?php if (empty($manual_invites)) : ?>
					<?php $this->render_manual_row(); ?>
				<?php else : ?>
					<?php foreach ($manual_invites as $row) : ?>
						<?php $this->render_manual_row($row['name'], $row['email'], false, $row['honorarium']); ?>
					<?php endforeach; ?>
				<?php endif; ?>
			</div>
			<p><label><input type="checkbox" name="ttm_send_invitations" value="1" /> <?php esc_html_e('Nach dem Speichern HTML-Einladungen senden', 'trainer-termine-manager'); ?></label></p>
		</div>

		<div class="ttm-admin-section">
			<div class="ttm-admin-section-head">
				<h4><?php esc_html_e('Bewerbungen von Trainern', 'trainer-termine-manager'); ?></h4>
				<?php if ($post->ID > 0) : ?>
					<a class="button button-primary" href="<?php echo esc_url($this->build_admin_action_url('send_all', 0, $post->ID)); ?>"><?php esc_html_e('Einladungen jetzt senden', 'trainer-termine-manager'); ?></a>
				<?php endif; ?>
			</div>
			<?php if (empty($applications)) : ?>
				<p><?php esc_html_e('Noch keine Bewerbungen für diesen Termin.', 'trainer-termine-manager'); ?></p>
			<?php else : ?>
				<table class="widefat striped">
					<thead>
						<tr>
							<th><?php esc_html_e('Name', 'trainer-termine-manager'); ?></th>
							<th><?php esc_html_e('E-Mail', 'trainer-termine-manager'); ?></th>
							<th><?php esc_html_e('Ausbildung', 'trainer-termine-manager'); ?></th>
							<th><?php esc_html_e('Verein', 'trainer-termine-manager'); ?></th>
							<th><?php esc_html_e('Status', 'trainer-termine-manager'); ?></th>
							<th><?php esc_html_e('Aktionen', 'trainer-termine-manager'); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ($applications as $application) : ?>
							<tr>
								<td><?php echo esc_html($application['name']); ?></td>
								<td><?php echo esc_html($application['email']); ?></td>
								<td><?php echo ! empty($application['trainer_qualification']) ? esc_html__('Ja', 'trainer-termine-manager') : esc_html__('Nein', 'trainer-termine-manager'); ?></td>
								<td><?php echo ! empty($application['club_member']) ? esc_html($application['club_name']) : esc_html__('Nein', 'trainer-termine-manager'); ?></td>
								<td><span class="ttm-status-badge is-<?php echo esc_attr($application['response_status']); ?>"><?php echo esc_html($this->format_status($application['response_status'])); ?></span></td>
								<td class="ttm-admin-actions">
									<a href="<?php echo esc_url($this->build_admin_action_url('approve', (int) $application['id'], $post->ID)); ?>"><?php esc_html_e('Zusage', 'trainer-termine-manager'); ?></a>
									<a href="<?php echo esc_url($this->build_admin_action_url('reject', (int) $application['id'], $post->ID)); ?>"><?php esc_html_e('Absage', 'trainer-termine-manager'); ?></a>
									<a href="<?php echo esc_url($this->build_admin_action_url('remove', (int) $application['id'], $post->ID)); ?>" onclick="return confirm('<?php echo esc_js(__('Eintrag wirklich entfernen?', 'trainer-termine-manager')); ?>');"><?php esc_html_e('Entfernen', 'trainer-termine-manager'); ?></a>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>

		<template id="ttm-manual-row-template"><?php $this->render_manual_row('__NAME__', '__EMAIL__', true, 0); ?></template>
		<?php
	}

	/**
	 * Save event.
	 *
	 * @param int     $post_id Post ID.
	 * @param WP_Post $post Post.
	 * @param bool    $update Update.
	 * @return void
	 */
	public function save_event($post_id, $post, $update) {
		if (! isset($_POST['ttm_event_nonce']) || ! wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['ttm_event_nonce'])), 'ttm_save_event')) {
			return;
		}

		if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
			return;
		}

		if (! current_user_can('edit_post', $post_id)) {
			return;
		}

		update_post_meta($post_id, '_ttm_event_date', sanitize_text_field(wp_unslash($_POST['ttm_event_date'] ?? '')));
        update_post_meta($post_id, '_ttm_event_time', sanitize_text_field(wp_unslash($_POST['ttm_event_time'] ?? '')));
        update_post_meta($post_id, '_ttm_event_end_time', sanitize_text_field(wp_unslash($_POST['ttm_event_end_time'] ?? '')));
		update_post_meta($post_id, '_ttm_event_location', sanitize_text_field(wp_unslash($_POST['ttm_event_location'] ?? '')));
		update_post_meta($post_id, '_ttm_event_status', sanitize_key(wp_unslash($_POST['ttm_event_status'] ?? 'aktiv')));
		update_post_meta($post_id, '_ttm_event_capacity', max(0, absint($_POST['ttm_event_capacity'] ?? 0)));
		update_post_meta($post_id, '_ttm_event_price', number_format((float) ($_POST['ttm_event_price'] ?? 0), 2, '.', ''));
		update_post_meta($post_id, '_ttm_use_global_honorarium', ! empty($_POST['ttm_use_global_honorarium']) ? '1' : '0');
		update_post_meta($post_id, '_ttm_global_honorarium', number_format((float) ($_POST['ttm_global_honorarium'] ?? 0), 2, '.', ''));

		$names            = isset($_POST['ttm_manual_name']) ? array_map('sanitize_text_field', (array) wp_unslash($_POST['ttm_manual_name'])) : array();
		$emails           = isset($_POST['ttm_manual_email']) ? array_map('sanitize_email', (array) wp_unslash($_POST['ttm_manual_email'])) : array();
		$manual_fees      = isset($_POST['ttm_manual_honorarium']) ? array_map('floatval', (array) wp_unslash($_POST['ttm_manual_honorarium'])) : array();
		$use_global_fee   = ! empty($_POST['ttm_use_global_honorarium']);
		$global_fee       = (float) ($_POST['ttm_global_honorarium'] ?? 0);
		$people           = array();

		foreach ($emails as $index => $email) {
			$name = $names[ $index ] ?? '';

			if (empty($email) || empty($name)) {
				continue;
			}

			$people[] = array(
				'name'       => $name,
				'email'      => $email,
				'honorarium' => $use_global_fee ? $global_fee : (float) ($manual_fees[ $index ] ?? 0),
			);
		}

		$this->repository->sync_event_invitations($post_id, $people);

		if (! empty($_POST['ttm_repeat_weekly'])) {
			$this->create_recurring_events($post_id, absint($_POST['ttm_repeat_count'] ?? 0));
		}

		if (! empty($_POST['ttm_send_invitations'])) {
			$this->mailer->send_event_invitations($post_id);
		}
	}

	/**
	 * Table columns.
	 *
	 * @param array $columns Columns.
	 * @return array
	 */
	public function set_event_columns($columns) {
		$columns['ttm_date']         = __('Datum', 'trainer-termine-manager');
		$columns['ttm_location']     = __('Ort', 'trainer-termine-manager');
		$columns['ttm_capacity']     = __('Plätze', 'trainer-termine-manager');
		$columns['ttm_participants'] = __('Zugesagt', 'trainer-termine-manager');
		return $columns;
	}

	/**
	 * Render event columns.
	 *
	 * @param string $column Column.
	 * @param int    $post_id Post ID.
	 * @return void
	 */
	public function render_event_columns($column, $post_id) {
		if ('ttm_date' === $column) {
			echo esc_html($this->format_event_datetime($post_id));
		}

		if ('ttm_location' === $column) {
			echo esc_html(get_post_meta($post_id, '_ttm_event_location', true));
		}

		if ('ttm_capacity' === $column) {
			$capacity  = $this->repository->get_event_capacity($post_id);
			$confirmed = $this->repository->count_confirmed_for_event($post_id);
			echo esc_html($capacity > 0 ? $confirmed . '/' . $capacity : (string) $confirmed);
		}

		if ('ttm_participants' === $column) {
			echo esc_html(implode(', ', $this->repository->get_confirmed_names_by_event($post_id)));
		}
	}

	/**
	 * Render responses page.
	 *
	 * @return void
	 */
	public function render_responses_page() {
		if (! current_user_can('edit_posts')) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		$rows = $this->repository->get_all_with_events();
		?>
		<div class="wrap">
			<h1><?php esc_html_e('Antwortübersicht', 'trainer-termine-manager'); ?></h1>
			<table class="widefat striped">
				<thead>
					<tr>
						<th><?php esc_html_e('Termin', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Typ', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Name', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('E-Mail', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Status', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Qualifikation', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Verein', 'trainer-termine-manager'); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php if (empty($rows)) : ?>
						<tr><td colspan="7"><?php esc_html_e('Noch keine Einträge vorhanden.', 'trainer-termine-manager'); ?></td></tr>
					<?php else : ?>
						<?php foreach ($rows as $row) : ?>
							<tr>
								<td><?php echo esc_html($row['post_title']); ?></td>
								<td><?php echo esc_html('application' === $row['request_type'] ? __('Bewerbung', 'trainer-termine-manager') : __('Einladung', 'trainer-termine-manager')); ?></td>
								<td><?php echo esc_html($row['name']); ?></td>
								<td><?php echo esc_html($row['email']); ?></td>
								<td><span class="ttm-status-badge is-<?php echo esc_attr($row['response_status']); ?>"><?php echo esc_html($this->format_status($row['response_status'])); ?></span></td>
								<td><?php echo ! empty($row['trainer_qualification']) ? esc_html__('Ja', 'trainer-termine-manager') : '-'; ?></td>
								<td><?php echo ! empty($row['club_member']) ? esc_html($row['club_name']) : '-'; ?></td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
		<?php
	}

	/**
	 * Render dedicated applications page.
	 *
	 * @return void
	 */
	public function render_applications_page() {
		if (! current_user_can('edit_posts')) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		$rows = $this->repository->get_pending_applications();
		?>
		<div class="wrap">
			<h1><?php esc_html_e('Offene Bewerbungen', 'trainer-termine-manager'); ?></h1>
			<table class="widefat striped">
				<thead>
					<tr>
						<th><?php esc_html_e('Termin', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Name', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('E-Mail', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Ausbildung', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Verein', 'trainer-termine-manager'); ?></th>
						<th><?php esc_html_e('Aktionen', 'trainer-termine-manager'); ?></th>
					</tr>
				</thead>
				<tbody>
					<?php if (empty($rows)) : ?>
						<tr><td colspan="6"><?php esc_html_e('Derzeit keine offenen Bewerbungen.', 'trainer-termine-manager'); ?></td></tr>
					<?php else : ?>
						<?php foreach ($rows as $application) : ?>
							<tr>
								<td><?php echo esc_html($application['post_title']); ?></td>
								<td><?php echo esc_html($application['name']); ?></td>
								<td><?php echo esc_html($application['email']); ?></td>
								<td><?php echo ! empty($application['trainer_qualification']) ? esc_html__('Ja', 'trainer-termine-manager') : esc_html__('Nein', 'trainer-termine-manager'); ?></td>
								<td><?php echo ! empty($application['club_member']) ? esc_html($application['club_name']) : esc_html__('Nein', 'trainer-termine-manager'); ?></td>
								<td class="ttm-admin-actions">
									<a href="<?php echo esc_url($this->build_admin_action_url('approve', (int) $application['id'], (int) $application['event_id'])); ?>"><?php esc_html_e('Zusage', 'trainer-termine-manager'); ?></a>
									<a href="<?php echo esc_url($this->build_admin_action_url('reject', (int) $application['id'], (int) $application['event_id'])); ?>"><?php esc_html_e('Absage', 'trainer-termine-manager'); ?></a>
								</td>
							</tr>
						<?php endforeach; ?>
					<?php endif; ?>
				</tbody>
			</table>
		</div>
		<?php
	}

	/**
	 * Send event invitations.
	 *
	 * @return void
	 */
	public function handle_send_event_invitations() {
		if (! current_user_can('edit_posts')) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		check_admin_referer('ttm_send_event_invitations');

		$event_id = isset($_GET['event_id']) ? absint($_GET['event_id']) : 0;

		if ($event_id) {
			$this->mailer->send_event_invitations($event_id);
		}

		wp_safe_redirect(admin_url('post.php?post=' . $event_id . '&action=edit'));
		exit;
	}

	/**
	 * Row actions for entries.
	 *
	 * @return void
	 */
	public function handle_invitation_action() {
		if (! current_user_can('edit_posts')) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		check_admin_referer('ttm_invitation_action');

		$action        = isset($_GET['ttm_operation']) ? sanitize_key(wp_unslash($_GET['ttm_operation'])) : '';
		$event_id      = isset($_GET['event_id']) ? absint($_GET['event_id']) : 0;
		$invitation_id = isset($_GET['invitation_id']) ? absint($_GET['invitation_id']) : 0;
		$entry         = $invitation_id ? $this->repository->get($invitation_id) : null;

		if ('send_all' === $action && $event_id) {
			$this->mailer->send_event_invitations($event_id);
		}

		if ($entry) {
			if ('resend' === $action) {
				$this->mailer->send_invitation((int) $entry['event_id'], $entry);
			}

			if ('reset' === $action) {
				$this->repository->reset_response($invitation_id);
			}

			if ('approve' === $action) {
				if (! $this->repository->is_event_full((int) $entry['event_id'], $invitation_id)) {
					$this->repository->record_response($invitation_id, 'zugesagt');
				}
			}

			if ('reject' === $action) {
				$this->repository->record_response($invitation_id, 'abgesagt');
			}

			if ('remove' === $action) {
				$this->repository->delete($invitation_id);
			}
		}

		wp_safe_redirect($event_id ? admin_url('post.php?post=' . $event_id . '&action=edit') : admin_url('edit.php?post_type=ttm_event&page=ttm-responses'));
		exit;
	}

	/**
	 * Manual invite row.
	 *
	 * @param string $name Name.
	 * @param string $email Email.
	 * @param bool   $template Template.
	 * @param float  $honorarium Honorarium.
	 * @return void
	 */
	private function render_manual_row($name = '', $email = '', $template = false, $honorarium = 0) {
		?>
		<div class="ttm-manual-row">
			<input type="text" name="ttm_manual_name[]" value="<?php echo esc_attr($name); ?>" placeholder="<?php esc_attr_e('Name', 'trainer-termine-manager'); ?>" />
			<input type="email" name="ttm_manual_email[]" value="<?php echo esc_attr($email); ?>" placeholder="<?php esc_attr_e('E-Mail', 'trainer-termine-manager'); ?>" />
			<input type="number" min="0" step="0.01" name="ttm_manual_honorarium[]" value="<?php echo esc_attr((float) $honorarium); ?>" placeholder="<?php esc_attr_e('Honorar', 'trainer-termine-manager'); ?>" />
            <button type="button" class="button-link-delete" data-ttm-remove-row aria-label="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>" title="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>"></button>
		</div>
		<?php
	}

	/**
	 * Build admin row action URL.
	 *
	 * @param string $operation Operation.
	 * @param int    $invitation_id ID.
	 * @param int    $event_id Event.
	 * @return string
	 */
	private function build_admin_action_url($operation, $invitation_id, $event_id) {
		return wp_nonce_url(
			add_query_arg(
				array(
					'action'        => 'ttm_invitation_action',
					'ttm_operation' => $operation,
					'invitation_id' => $invitation_id,
					'event_id'      => $event_id,
				),
				admin_url('admin-post.php')
			),
			'ttm_invitation_action'
		);
	}

	/**
	 * Format event date/time.
	 *
	 * @param int $post_id Event ID.
	 * @return string
	 */
	private function format_event_datetime($post_id) {
		$date = get_post_meta($post_id, '_ttm_event_date', true);
		$time     = get_post_meta($post_id, '_ttm_event_time', true);
		$end_time = get_post_meta($post_id, '_ttm_event_end_time', true);

		if (empty($date)) {
			return '';
		}

		$formatted = wp_date(get_option('date_format'), strtotime($date));

		if (! empty($time) && ! empty($end_time)) {
			$formatted .= ' ' . $time . ' - ' . $end_time;
		} elseif (! empty($time)) {
			$formatted .= ' ' . $time;
		}

		return $formatted;
	}

	/**
	 * Format status labels.
	 *
	 * @param string $status Status.
	 * @return string
	 */
	private function format_status($status) {
		$labels = array(
			'offen'      => __('Offen', 'trainer-termine-manager'),
			'zugesagt'   => __('Zugesagt', 'trainer-termine-manager'),
			'abgesagt'   => __('Abgesagt', 'trainer-termine-manager'),
			'bewerbung'  => __('Bewerbung offen', 'trainer-termine-manager'),
			'voll'       => __('Voll belegt', 'trainer-termine-manager'),
			'sent'       => __('Versendet', 'trainer-termine-manager'),
			'failed'     => __('Fehlgeschlagen', 'trainer-termine-manager'),
			'pending'    => __('Ausstehend', 'trainer-termine-manager'),
		);

		return $labels[ $status ] ?? $status;
	}

	/**
	 * Create weekly follow-up events.
	 *
	 * @param int $post_id Base event.
	 * @param int $count Number of extra weeks.
	 * @return void
	 */
	private function create_recurring_events($post_id, $count) {
		$base_date = get_post_meta($post_id, '_ttm_event_date', true);
		$post      = get_post($post_id);

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
			update_post_meta($new_id, '_ttm_event_time', get_post_meta($post_id, '_ttm_event_time', true));
			update_post_meta($new_id, '_ttm_event_end_time', get_post_meta($post_id, '_ttm_event_end_time', true));
			update_post_meta($new_id, '_ttm_event_location', get_post_meta($post_id, '_ttm_event_location', true));
			update_post_meta($new_id, '_ttm_event_status', get_post_meta($post_id, '_ttm_event_status', true));
			update_post_meta($new_id, '_ttm_event_capacity', get_post_meta($post_id, '_ttm_event_capacity', true));
			update_post_meta($new_id, '_ttm_event_price', get_post_meta($post_id, '_ttm_event_price', true));
		}
	}
		/**
		 * Handle event deletion with cancellation notifications.
	 *
	 * @return void
	 */
	public function handle_event_deletion() {
		if (! current_user_can('delete_posts')) {
			wp_die(esc_html__('Keine Berechtigung.', 'trainer-termine-manager'));
		}

		check_admin_referer('ttm_delete_event');

		$event_id = isset($_POST['event_id']) ? absint($_POST['event_id']) : 0;
		$reason   = isset($_POST['cancellation_reason']) ? sanitize_textarea_field(wp_unslash($_POST['cancellation_reason'])) : '';

		if (! $event_id) {
			wp_safe_redirect(admin_url('edit.php?post_type=ttm_event'));
			exit;
		}

		// Send cancellation notifications before deleting
		$sent_count = $this->mailer->send_event_cancellation_notifications($event_id, $reason);

		// Delete all related invitations
		$this->repository->delete_by_event($event_id);

		// Delete the event post
		wp_delete_post($event_id, true);

		// Redirect with success message
		wp_safe_redirect(add_query_arg(
			array(
				'post_type' => 'ttm_event',
				'ttm_notice' => 'event_deleted',
				'ttm_notified' => $sent_count,
			),
			admin_url('edit.php')
		));
		exit;
	}

	/**
	 * Add delete event button to edit screen.
	 *
	 * @return void
	 */
	public function add_delete_button() {
		$screen = get_current_screen();
		if (! $screen || 'ttm_event' !== $screen->post_type) {
			return;
		}

		global $post;
		if (! $post || 'ttm_event' !== $post->post_type) {
			return;
		}

		// Get confirmed attendees count
		$confirmed_count = $this->repository->count_confirmed_for_event($post->ID);

		if ($confirmed_count > 0) {
			?>
			<script type="text/javascript">
				jQuery(document).ready(function($) {
					// Add custom delete button if there are confirmed attendees
					var deleteLink = '<a href="#" class="ttm-delete-event-btn" style="color:#a02830;text-decoration:none;"><?php esc_html_e('Mit Benachrichtigungen löschen', 'trainer-termine-manager'); ?></a>';
					$('#misc-publishing-actions').after(deleteLink);

					$('.ttm-delete-event-btn').on('click', function(e) {
						e.preventDefault();
						var reason = prompt('<?php esc_html_e('Grund der Absage (optional):', 'trainer-termine-manager'); ?>');
						if (reason !== null) {
							var form = $('<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="display:none;">');
							form.append($('<input type="hidden" name="action" value="ttm_delete_event" />'));
							form.append($('<input type="hidden" name="event_id" value="<?php echo esc_attr($post->ID); ?>" />'));
							form.append($('<input type="hidden" name="cancellation_reason" value="' + reason + '" />'));
							form.append($('<input type="hidden" name="ttm_delete_event_nonce" value="<?php echo esc_attr(wp_create_nonce('ttm_delete_event')); ?>" />'));
							$('body').append(form);
							form.submit();
						}
					});
				});
			</script>
			<?php
		}
	}
}
