<?php
/**
 * Trainer dashboard.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

$messages = array(
	'application_sent'    => __('Deine Bewerbung wurde gespeichert.', 'trainer-termine-manager'),
	'application_failed'  => __('Die Bewerbung konnte gerade nicht gespeichert werden. Bitte Seite neu laden und erneut versuchen.', 'trainer-termine-manager'),
	'full'                => __('Dieser Termin ist bereits voll belegt.', 'trainer-termine-manager'),
	'invalid_application' => __('Bitte fülle Name und E-Mail korrekt aus.', 'trainer-termine-manager'),
);
?>
<div class="ttm-dashboard">
	<div class="ttm-dashboard-header">
		<div>
			<p class="ttm-eyebrow"><?php esc_html_e('Trainerbereich', 'trainer-termine-manager'); ?></p>
			<h2><?php esc_html_e('Offene Trainer-Termine', 'trainer-termine-manager'); ?></h2>
			<p><?php esc_html_e('Wähle im Kalender einen Termin aus. Erst dann erscheinen die Details und das Bewerbungsformular.', 'trainer-termine-manager'); ?></p>
		</div>
	</div>

	<?php if (! empty($notice) && isset($messages[ $notice ])) : ?>
		<div class="ttm-alert"><?php echo esc_html($messages[ $notice ]); ?></div>
	<?php endif; ?>

	<?php echo wp_kses_post($calendar); ?>

	<?php if (! $selected_event) : ?>
		<div class="ttm-empty-state">
			<h3><?php esc_html_e('Termin auswählen', 'trainer-termine-manager'); ?></h3>
			<p><?php esc_html_e('Klicke im Kalender auf einen Termin, um Details, freie Plätze und das Bewerbungsformular zu sehen.', 'trainer-termine-manager'); ?></p>
		</div>
	<?php else : ?>
		<article class="ttm-card ttm-card-detail">
			<div class="ttm-card-head">
				<span class="ttm-badge is-<?php echo esc_attr($selected_event['can_apply'] ? 'offen' : ('zugesagt' === $selected_event['display_status'] ? 'zugesagt' : ('abgesagt' === $selected_event['display_status'] ? 'abgesagt' : 'voll'))); ?>">
					<?php
					if ($selected_event['user_entry']) {
						echo esc_html('bewerbung' === $selected_event['display_status'] ? __('Beworben', 'trainer-termine-manager') : ucfirst($selected_event['display_status']));
					} else {
						echo esc_html($selected_event['can_apply'] ? __('Frei', 'trainer-termine-manager') : __('Voll', 'trainer-termine-manager'));
					}
					?>
				</span>
				<h3><?php echo esc_html($selected_event['post_title']); ?></h3>
			</div>
			<ul class="ttm-meta">
				<li><strong><?php esc_html_e('Wann:', 'trainer-termine-manager'); ?></strong> <?php echo esc_html(TTM_Public::format_event_datetime($selected_event)); ?></li>
				<li><strong><?php esc_html_e('Ort:', 'trainer-termine-manager'); ?></strong> <?php echo esc_html($selected_event['event_location']); ?></li>
				<?php if (! empty($selected_event['capacity'])) : ?>
					<li><strong><?php esc_html_e('Plätze:', 'trainer-termine-manager'); ?></strong> <?php echo esc_html(sprintf(__('%1$d von %2$d Plätzen belegt', 'trainer-termine-manager'), (int) $selected_event['confirmed_count'], (int) $selected_event['capacity'])); ?></li>
					<li><span class="ttm-slot-pill"><?php echo esc_html(sprintf(__('%1$d von %2$d', 'trainer-termine-manager'), (int) $selected_event['confirmed_count'], (int) $selected_event['capacity'])); ?></span></li>
				<?php endif; ?>
				<?php if (! empty($selected_event['event_price'])) : ?>
					<li><strong><?php esc_html_e('Vergütung:', 'trainer-termine-manager'); ?></strong> <?php echo esc_html(number_format_i18n((float) $selected_event['event_price'], 2)); ?> €</li>
				<?php endif; ?>
				<?php if (! empty($selected_event['confirmed_names'])) : ?>
					<li><strong><?php esc_html_e('Bereits zugesagt:', 'trainer-termine-manager'); ?></strong> <?php echo esc_html(implode(', ', $selected_event['confirmed_names'])); ?></li>
				<?php endif; ?>
			</ul>
			<div class="ttm-copy"><?php echo wp_kses_post(wpautop($selected_event['post_content'])); ?></div>

			<?php if ($selected_event['user_entry']) : ?>
				<div class="ttm-inline-note">
					<?php echo esc_html('bewerbung' === $selected_event['display_status'] ? __('Deine Bewerbung ist eingegangen und wartet auf Rückmeldung.', 'trainer-termine-manager') : __('Für diesen Termin liegt bereits eine Entscheidung zu deiner E-Mail vor.', 'trainer-termine-manager')); ?>
				</div>
			<?php elseif ($selected_event['can_apply']) : ?>
				<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="ttm-application-form">
					<input type="hidden" name="action" value="ttm_submit_application" />
					<input type="hidden" name="ttm_event_id" value="<?php echo esc_attr($selected_event['event_id']); ?>" />
					<input type="hidden" name="ttm_redirect" value="<?php echo esc_url(get_permalink()); ?>" />
					<?php wp_nonce_field('ttm_submit_application'); ?>
					<div class="ttm-form-grid">
						<input type="text" name="ttm_name" value="<?php echo is_user_logged_in() ? esc_attr(wp_get_current_user()->display_name) : ''; ?>" placeholder="<?php esc_attr_e('Vorname Nachname', 'trainer-termine-manager'); ?>" required />
						<input type="email" name="ttm_email" value="<?php echo is_user_logged_in() ? esc_attr(wp_get_current_user()->user_email) : ''; ?>" placeholder="<?php esc_attr_e('E-Mail', 'trainer-termine-manager'); ?>" required />
						<label class="ttm-check"><input type="checkbox" name="ttm_trainer_qualification" value="1" /> <span><?php esc_html_e('Trainer-Ausbildung vorhanden', 'trainer-termine-manager'); ?></span></label>
						<label class="ttm-check"><input type="checkbox" name="ttm_club_member" value="1" data-ttm-club-toggle /> <span><?php esc_html_e('Vereinszugehörigkeit vorhanden', 'trainer-termine-manager'); ?></span></label>
						<input type="text" name="ttm_club_name" value="" placeholder="<?php esc_attr_e('Welcher Verein?', 'trainer-termine-manager'); ?>" data-ttm-club-name />
					</div>
					<div class="ttm-actions">
						<button type="submit" class="ttm-button ttm-button-primary"><?php esc_html_e('Jetzt bewerben', 'trainer-termine-manager'); ?></button>
					</div>
				</form>
			<?php else : ?>
				<div class="ttm-inline-note"><?php esc_html_e('Für diesen Termin sind keine freien Plätze mehr verfügbar.', 'trainer-termine-manager'); ?></div>
			<?php endif; ?>
		</article>
	<?php endif; ?>

	<?php if (! empty($applications) && is_user_logged_in()) : ?>
		<div class="ttm-dashboard-subsection">
			<h3><?php esc_html_e('Meine bisherigen Bewerbungen und Einladungen', 'trainer-termine-manager'); ?></h3>
			<div class="ttm-list-table">
				<?php foreach ($applications as $item) : ?>
					<div class="ttm-list-row">
						<div>
							<strong><?php echo esc_html($item['post_title']); ?></strong>
							<div><?php echo esc_html(TTM_Public::format_event_datetime($item)); ?></div>
						</div>
						<div><span class="ttm-badge is-<?php echo esc_attr($item['response_status']); ?>"><?php echo esc_html('bewerbung' === $item['response_status'] ? __('Beworben', 'trainer-termine-manager') : ucfirst($item['response_status'])); ?></span></div>
					</div>
				<?php endforeach; ?>
			</div>
		</div>
	<?php endif; ?>
</div>
