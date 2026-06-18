<?php
/**
 * Frontend management dashboard.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

$messages = array(
	'application_approved' => __('Die Bewerbung wurde zugesagt.', 'trainer-termine-manager'),
	'application_rejected' => __('Die Bewerbung wurde abgesagt.', 'trainer-termine-manager'),
	'event_saved'          => __('Der Termin wurde gespeichert.', 'trainer-termine-manager'),
	'event_failed'         => __('Der Termin konnte nicht gespeichert werden.', 'trainer-termine-manager'),
	'event_deleted'        => sprintf(
		/* translators: 1: number of confirmed attendees, 2: number of sent mails */
		__('Der Termin wurde gelöscht. %1$d Personen hatten zugesagt, %2$d Absage-Mails wurden versendet.', 'trainer-termine-manager'),
		isset($_GET['ttm_confirmed']) ? absint($_GET['ttm_confirmed']) : 0,
		isset($_GET['ttm_notified']) ? absint($_GET['ttm_notified']) : 0
	),
	'event_delete_failed'  => __('Der Termin konnte nicht gelöscht werden.', 'trainer-termine-manager'),
	'full'                 => __('Für diesen Termin sind bereits alle Plätze vergeben.', 'trainer-termine-manager'),
	'invites_saved'        => __('Die Einladungen wurden gespeichert.', 'trainer-termine-manager'),
	'invite_send_failed'   => __('Die Einladungen wurden gespeichert, aber der Mailversand ist fehlgeschlagen.', 'trainer-termine-manager'),
);
?>
<div class="ttm-dashboard">
	<div class="ttm-dashboard-header">
		<div>
			<p class="ttm-eyebrow"><?php esc_html_e('Verwaltung', 'trainer-termine-manager'); ?></p>
			<h2><?php esc_html_e('Trainer-Termine verwalten', 'trainer-termine-manager'); ?></h2>
			<p><?php esc_html_e('Kalender, Einladungen, Bewerbungen und Platzstände im Frontend für Admins und Redakteure.', 'trainer-termine-manager'); ?></p>
		</div>
	</div>

	<?php if (! empty($notice) && isset($messages[ $notice ])) : ?>
		<div class="ttm-alert"><?php echo esc_html($messages[ $notice ]); ?></div>
	<?php endif; ?>

	<?php echo wp_kses_post($calendar); ?>

	<div class="ttm-dashboard-subsection">
		<div class="ttm-admin-section-head">
			<h3><?php echo $selected_event ? esc_html__('Termin bearbeiten', 'trainer-termine-manager') : esc_html__('Neuen Termin anlegen', 'trainer-termine-manager'); ?></h3>
		</div>
		<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="ttm-application-form">
			<input type="hidden" name="action" value="ttm_frontend_event_save" />
			<input type="hidden" name="ttm_event_id" value="<?php echo esc_attr($selected_event ? $selected_event['event_id'] : 0); ?>" />
			<input type="hidden" name="ttm_redirect" value="<?php echo esc_url(get_permalink()); ?>" />
			<?php wp_nonce_field('ttm_frontend_event_save'); ?>
			<div class="ttm-form-grid">
				<input type="text" name="ttm_event_title" value="<?php echo esc_attr($selected_event ? $selected_event['post_title'] : ''); ?>" placeholder="<?php esc_attr_e('Titel', 'trainer-termine-manager'); ?>" required />
				<input type="date" name="ttm_event_date" value="<?php echo esc_attr($selected_event ? $selected_event['event_date'] : ''); ?>" required />
				<input type="time" name="ttm_event_time" value="<?php echo esc_attr($selected_event ? $selected_event['event_time'] : ''); ?>" placeholder="<?php esc_attr_e('Von', 'trainer-termine-manager'); ?>" />
				<input type="time" name="ttm_event_end_time" value="<?php echo esc_attr($selected_event ? $selected_event['event_end_time'] : ''); ?>" placeholder="<?php esc_attr_e('Bis', 'trainer-termine-manager'); ?>" />
				<input type="text" name="ttm_event_location" value="<?php echo esc_attr($selected_event ? $selected_event['event_location'] : ''); ?>" placeholder="<?php esc_attr_e('Ort', 'trainer-termine-manager'); ?>" />
				<input type="number" name="ttm_event_capacity" min="0" step="1" value="<?php echo esc_attr($selected_event ? $selected_event['capacity'] : ''); ?>" placeholder="<?php esc_attr_e('Plätze', 'trainer-termine-manager'); ?>" />
				<input type="number" name="ttm_event_price" min="0" step="0.01" value="<?php echo esc_attr($selected_event ? $selected_event['event_price'] : ''); ?>" placeholder="<?php esc_attr_e('Vergütung / Preis', 'trainer-termine-manager'); ?>" />
				<select name="ttm_event_status">
					<option value="aktiv" <?php selected($selected_event ? $selected_event['event_status'] : '', 'aktiv'); ?>><?php esc_html_e('Aktiv', 'trainer-termine-manager'); ?></option>
					<option value="entwurf" <?php selected($selected_event ? $selected_event['event_status'] : '', 'entwurf'); ?>><?php esc_html_e('Entwurf', 'trainer-termine-manager'); ?></option>
					<option value="abgesagt" <?php selected($selected_event ? $selected_event['event_status'] : '', 'abgesagt'); ?>><?php esc_html_e('Abgesagt', 'trainer-termine-manager'); ?></option>
				</select>
				<label class="ttm-check"><input type="checkbox" name="ttm_repeat_weekly" value="1" data-ttm-repeat-toggle="public" /> <span><?php esc_html_e('In Folgewochen wiederholen', 'trainer-termine-manager'); ?></span></label>
				<div data-ttm-repeat-field="public" hidden>
					<input type="number" name="ttm_repeat_count" min="1" max="52" step="1" value="1" placeholder="<?php esc_attr_e('Anzahl weiterer Wochen', 'trainer-termine-manager'); ?>" />
				</div>
				<textarea name="ttm_event_description" placeholder="<?php esc_attr_e('Beschreibung', 'trainer-termine-manager'); ?>"><?php echo esc_textarea($selected_event ? $selected_event['post_content'] : ''); ?></textarea>
			</div>
			<div class="ttm-actions">
				<button type="submit" class="ttm-button ttm-button-primary"><?php echo $selected_event ? esc_html__('Änderungen speichern', 'trainer-termine-manager') : esc_html__('Termin speichern', 'trainer-termine-manager'); ?></button>
				<?php if ($selected_event) : ?>
					<button type="button" class="ttm-button ttm-button-danger" data-ttm-toggle-delete><?php esc_html_e('Termin löschen', 'trainer-termine-manager'); ?></button>
				<?php endif; ?>
			</div>
		</form>
		<?php if ($selected_event) : ?>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="ttm-delete-card" data-ttm-delete-form hidden>
				<input type="hidden" name="action" value="ttm_frontend_event_delete" />
				<input type="hidden" name="ttm_event_id" value="<?php echo esc_attr($selected_event['event_id']); ?>" />
				<input type="hidden" name="ttm_redirect" value="<?php echo esc_url(get_permalink()); ?>" />
				<?php wp_nonce_field('ttm_frontend_event_delete'); ?>
				<h4><?php esc_html_e('Termin wirklich löschen?', 'trainer-termine-manager'); ?></h4>
				<p><?php esc_html_e('Bereits zugesagte Personen erhalten automatisch eine Absage-Mail.', 'trainer-termine-manager'); ?></p>
				<textarea name="ttm_cancellation_reason" placeholder="<?php esc_attr_e('Optionaler Grund für die Absage', 'trainer-termine-manager'); ?>"></textarea>
				<div class="ttm-actions">
					<button type="submit" class="ttm-button ttm-button-danger"><?php esc_html_e('Löschen und absagen', 'trainer-termine-manager'); ?></button>
					<button type="button" class="ttm-button ttm-button-secondary" data-ttm-cancel-delete><?php esc_html_e('Abbrechen', 'trainer-termine-manager'); ?></button>
				</div>
			</form>
		<?php endif; ?>
	</div>

	<?php if (! $selected_event) : ?>
		<div class="ttm-empty-state">
			<h3><?php esc_html_e('Termin auswählen', 'trainer-termine-manager'); ?></h3>
			<p><?php esc_html_e('Klicke im Kalender auf einen Termin, um Einladungen, Bewerbungen und Platzstatus zu verwalten.', 'trainer-termine-manager'); ?></p>
		</div>
	<?php else : ?>
		<div class="ttm-dashboard-subsection">
			<h3><?php echo esc_html($selected_event['post_title']); ?></h3>
			<div class="ttm-small-copy"><?php echo esc_html(TTM_Public::format_event_datetime($selected_event)); ?><?php if (! empty($selected_event['event_location'])) : ?> · <?php echo esc_html($selected_event['event_location']); ?><?php endif; ?></div>
			<div class="ttm-small-copy"><?php echo esc_html($selected_event['hover_summary']); ?></div>
			<?php if (! empty($selected_event['event_price'])) : ?>
				<div class="ttm-small-copy"><?php echo esc_html(sprintf(__('Vergütung: %s €', 'trainer-termine-manager'), number_format_i18n((float) $selected_event['event_price'], 2))); ?></div>
			<?php endif; ?>
		</div>

		<div class="ttm-dashboard-subsection">
			<div class="ttm-admin-section-head">
				<h3><?php esc_html_e('Direkte Einladungen senden', 'trainer-termine-manager'); ?></h3>
				<a class="ttm-button ttm-button-secondary" href="<?php echo esc_url(admin_url('post.php?post=' . $selected_event['event_id'] . '&action=edit')); ?>"><?php esc_html_e('Backend öffnen', 'trainer-termine-manager'); ?></a>
			</div>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="ttm-application-form">
				<input type="hidden" name="action" value="ttm_frontend_send_invites" />
				<input type="hidden" name="ttm_event_id" value="<?php echo esc_attr($selected_event['event_id']); ?>" />
				<input type="hidden" name="ttm_redirect" value="<?php echo esc_url(get_permalink()); ?>" />
				<?php wp_nonce_field('ttm_frontend_send_invites'); ?>
				<div class="ttm-manual-rows" data-ttm-rows>
					<?php if (empty($direct_invites)) : ?>
						<div class="ttm-manual-row">
							<input type="text" name="ttm_invite_name[]" placeholder="<?php esc_attr_e('Name', 'trainer-termine-manager'); ?>" />
							<input type="email" name="ttm_invite_email[]" placeholder="<?php esc_attr_e('E-Mail', 'trainer-termine-manager'); ?>" />
							<input type="number" name="ttm_invite_honorarium[]" min="0" step="0.01" placeholder="<?php esc_attr_e('Honorar', 'trainer-termine-manager'); ?>" />
							<button type="button" class="button-link-delete" data-ttm-remove-row aria-label="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>" title="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>"></button>
						</div>
					<?php else : ?>
						<?php foreach ($direct_invites as $invite) : ?>
							<div class="ttm-manual-row">
								<input type="text" name="ttm_invite_name[]" value="<?php echo esc_attr($invite['name']); ?>" placeholder="<?php esc_attr_e('Name', 'trainer-termine-manager'); ?>" />
								<input type="email" name="ttm_invite_email[]" value="<?php echo esc_attr($invite['email']); ?>" placeholder="<?php esc_attr_e('E-Mail', 'trainer-termine-manager'); ?>" />
								<input type="number" name="ttm_invite_honorarium[]" min="0" step="0.01" value="<?php echo esc_attr($invite['honorarium']); ?>" placeholder="<?php esc_attr_e('Honorar', 'trainer-termine-manager'); ?>" />
								<button type="button" class="button-link-delete" data-ttm-remove-row aria-label="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>" title="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>"></button>
							</div>
						<?php endforeach; ?>
					<?php endif; ?>
				</div>
				<template id="ttm-manual-row-template">
					<div class="ttm-manual-row">
						<input type="text" name="ttm_invite_name[]" placeholder="<?php esc_attr_e('Name', 'trainer-termine-manager'); ?>" />
						<input type="email" name="ttm_invite_email[]" placeholder="<?php esc_attr_e('E-Mail', 'trainer-termine-manager'); ?>" />
						<input type="number" name="ttm_invite_honorarium[]" min="0" step="0.01" placeholder="<?php esc_attr_e('Honorar', 'trainer-termine-manager'); ?>" />
						<button type="button" class="button-link-delete" data-ttm-remove-row aria-label="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>" title="<?php esc_attr_e('Person entfernen', 'trainer-termine-manager'); ?>"></button>
					</div>
				</template>
				<div class="ttm-actions ttm-actions-invite">
					<button type="button" class="ttm-button ttm-button-secondary" data-ttm-add-row><?php esc_html_e('Weitere Person', 'trainer-termine-manager'); ?></button>
					<label class="ttm-check ttm-check-accent"><input type="checkbox" name="ttm_send_now" value="1" checked="checked" /> <span><?php esc_html_e('Direkt per E-Mail versenden', 'trainer-termine-manager'); ?></span></label>
					<button type="submit" class="ttm-button ttm-button-primary ttm-button-invite"><?php esc_html_e('Trainer einladen', 'trainer-termine-manager'); ?></button>
				</div>
			</form>
		</div>

	<?php endif; ?>

	<div class="ttm-dashboard-subsection">
		<h3><?php esc_html_e('Offene Bewerbungen', 'trainer-termine-manager'); ?></h3>
		<div class="ttm-filter-row">
			<?php if (! empty($application_filter_urls['day'])) : ?>
				<a class="ttm-filter-chip <?php echo 'day' === $app_scope ? 'is-active' : ''; ?>" href="<?php echo esc_url($application_filter_urls['day']); ?>"><?php esc_html_e('Tag', 'trainer-termine-manager'); ?></a>
			<?php endif; ?>
			<a class="ttm-filter-chip <?php echo 'month' === $app_scope ? 'is-active' : ''; ?>" href="<?php echo esc_url($application_filter_urls['month']); ?>"><?php esc_html_e('Monat', 'trainer-termine-manager'); ?></a>
			<a class="ttm-filter-chip <?php echo 'year' === $app_scope ? 'is-active' : ''; ?>" href="<?php echo esc_url($application_filter_urls['year']); ?>"><?php esc_html_e('Jahr', 'trainer-termine-manager'); ?></a>
			<a class="ttm-filter-chip <?php echo 'all' === $app_scope ? 'is-active' : ''; ?>" href="<?php echo esc_url($application_filter_urls['all']); ?>"><?php esc_html_e('Alle', 'trainer-termine-manager'); ?></a>
		</div>
		<?php if (empty($pending_applications)) : ?>
			<div class="ttm-empty-state">
				<h3><?php esc_html_e('Keine offenen Bewerbungen', 'trainer-termine-manager'); ?></h3>
				<p><?php esc_html_e('Für den gewählten Filter wurden aktuell keine offenen Bewerbungen gefunden.', 'trainer-termine-manager'); ?></p>
			</div>
		<?php else : ?>
			<div class="ttm-list-table">
				<?php foreach ($pending_applications as $application) : ?>
					<div class="ttm-list-row">
						<div>
							<strong><?php echo esc_html($application['name']); ?></strong>
							<div><?php echo esc_html($application['post_title']); ?></div>
							<div><?php echo esc_html($application['email']); ?></div>
							<div class="ttm-small-copy">
								<?php echo ! empty($application['trainer_qualification']) ? esc_html__('Trainer-Ausbildung: Ja', 'trainer-termine-manager') : esc_html__('Trainer-Ausbildung: Nein', 'trainer-termine-manager'); ?>
								<?php if (! empty($application['club_member'])) : ?>
									 · <?php echo esc_html(sprintf(__('Verein: %s', 'trainer-termine-manager'), $application['club_name'])); ?>
								<?php endif; ?>
							</div>
						</div>
						<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="ttm-actions">
							<input type="hidden" name="action" value="ttm_manage_application" />
							<input type="hidden" name="ttm_invitation_id" value="<?php echo esc_attr($application['id']); ?>" />
							<input type="hidden" name="ttm_redirect" value="<?php echo esc_url(get_permalink()); ?>" />
							<?php wp_nonce_field('ttm_manage_application'); ?>
							<button type="submit" name="ttm_decision" value="approve" class="ttm-button ttm-button-primary"><?php esc_html_e('Zusage', 'trainer-termine-manager'); ?></button>
							<button type="submit" name="ttm_decision" value="reject" class="ttm-button ttm-button-secondary"><?php esc_html_e('Absage', 'trainer-termine-manager'); ?></button>
						</form>
					</div>
				<?php endforeach; ?>
			</div>
		<?php endif; ?>
	</div>
</div>
