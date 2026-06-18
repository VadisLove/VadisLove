<?php
/**
 * Calendar partial.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}
?>
<section class="ttm-calendar">
	<div class="ttm-calendar-head">
		<div>
			<h3><?php echo esc_html($title); ?></h3>
			<p><?php echo esc_html(wp_date('F Y', strtotime($current_year . '-' . $current_month . '-01'))); ?></p>
		</div>
		<div class="ttm-calendar-nav">
			<a class="ttm-button ttm-button-secondary" href="<?php echo esc_url($prev_url); ?>"><?php esc_html_e('Vorheriger Monat', 'trainer-termine-manager'); ?></a>
			<a class="ttm-button ttm-button-secondary" href="<?php echo esc_url($next_url); ?>"><?php esc_html_e('Nächster Monat', 'trainer-termine-manager'); ?></a>
		</div>
	</div>
	<div class="ttm-calendar-grid ttm-calendar-grid-labels">
		<span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span>
	</div>
	<div class="ttm-calendar-grid">
		<?php for ($blank = 1; $blank < $first_weekday; $blank++) : ?>
			<div class="ttm-calendar-cell is-empty"></div>
		<?php endfor; ?>
		<?php for ($day = 1; $day <= $days_in_month; $day++) : ?>
			<?php $day_events = $event_map[ $day ] ?? array(); ?>
			<div class="ttm-calendar-cell <?php echo ! empty($day_events) ? 'has-events' : ''; ?>">
				<span class="ttm-calendar-day"><?php echo esc_html($day); ?></span>
				<?php foreach ($day_events as $event) : ?>
					<a class="ttm-calendar-event <?php echo (int) $selected_event_id === (int) $event['event_id'] ? 'is-active' : ''; ?>" href="<?php echo esc_url($event['detail_url']); ?>">
						<strong><?php echo esc_html($event['post_title']); ?></strong>
						<small><?php echo esc_html(! empty($event['capacity']) ? sprintf(__('%1$d von %2$d', 'trainer-termine-manager'), (int) $event['confirmed_count'], (int) $event['capacity']) : __('offen', 'trainer-termine-manager')); ?></small>
					</a>
				<?php endforeach; ?>
				<?php if (! empty($day_events)) : ?>
					<div class="ttm-calendar-popover">
						<?php foreach ($day_events as $event) : ?>
							<div class="ttm-calendar-popover-item">
								<strong><?php echo esc_html($event['post_title']); ?></strong>
								<div><?php echo esc_html($event['hover_summary']); ?></div>
							</div>
						<?php endforeach; ?>
					</div>
				<?php endif; ?>
			</div>
		<?php endfor; ?>
	</div>
</section>
