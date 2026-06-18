<?php
/**
 * Email invitation template.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}

$formatted_date = ! empty($event_date) ? wp_date(get_option('date_format'), strtotime($event_date)) : __('Datum folgt', 'trainer-termine-manager');
$formatted_time = ! empty($event_time) ? $event_time : __('Uhrzeit folgt', 'trainer-termine-manager');
$ci_blue        = '#2ea8ff';
?>
<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title><?php echo esc_html($event->post_title); ?></title>
</head>
<body style="margin:0;padding:24px;background:#eef2f7;font-family:Arial,sans-serif;color:#1f2937;">
	<div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.08);">
		<div style="padding:24px 32px;background:linear-gradient(135deg,<?php echo esc_attr($ci_blue); ?>,#1273d6);color:#ffffff;">
			<p style="margin:0 0 18px;">
				<img src="<?php echo esc_url($logo_url); ?>" alt="<?php echo esc_attr(get_bloginfo('name')); ?>" style="display:block;max-width:120px;height:auto;" />
			</p>
			<p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.9;"><?php esc_html_e('Einladung', 'trainer-termine-manager'); ?></p>
			<h1 style="margin:0;font-size:28px;line-height:1.2;"><?php echo esc_html($event->post_title); ?></h1>
		</div>
		<div style="padding:32px;">
			<p style="margin-top:0;font-size:16px;"><?php echo esc_html(sprintf(__('Hallo %s,', 'trainer-termine-manager'), $invitation['name'])); ?></p>
			<p style="font-size:16px;line-height:1.6;"><?php esc_html_e('du wurdest zu einem Termin eingeladen. Bitte gib uns kurz Bescheid, ob du teilnehmen kannst.', 'trainer-termine-manager'); ?></p>

			<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#f8fafc;border-radius:14px;padding:18px;">
				<tr>
					<td style="padding:6px 0;"><strong><?php esc_html_e('Datum', 'trainer-termine-manager'); ?>:</strong> <?php echo esc_html($formatted_date); ?></td>
				</tr>
				<tr>
					<td style="padding:6px 0;"><strong><?php esc_html_e('Uhrzeit', 'trainer-termine-manager'); ?>:</strong> <?php echo esc_html($formatted_time); ?></td>
				</tr>
				<tr>
					<td style="padding:6px 0;"><strong><?php esc_html_e('Ort', 'trainer-termine-manager'); ?>:</strong> <?php echo esc_html($location ?: __('Noch offen', 'trainer-termine-manager')); ?></td>
				</tr>
				<?php if ($capacity > 0) : ?>
					<tr>
						<td style="padding:6px 0;"><strong><?php esc_html_e('Plätze', 'trainer-termine-manager'); ?>:</strong> <?php echo esc_html(sprintf(__('%1$d frei von %2$d', 'trainer-termine-manager'), (int) $available_slots, (int) $capacity)); ?></td>
					</tr>
				<?php endif; ?>
				<?php if (! empty($event_price)) : ?>
					<tr>
						<td style="padding:6px 0;"><strong><?php esc_html_e('Vergütung', 'trainer-termine-manager'); ?>:</strong> <?php echo esc_html(number_format_i18n((float) $event_price, 2)); ?> €</td>
					</tr>
				<?php endif; ?>
				<?php if (! empty($invitation['honorarium'])) : ?>
					<tr>
						<td style="padding:6px 0;"><strong><?php esc_html_e('Honorar', 'trainer-termine-manager'); ?>:</strong> <?php echo esc_html(number_format_i18n((float) $invitation['honorarium'], 2)); ?> €</td>
					</tr>
				<?php endif; ?>
			</table>

			<?php if (! empty($event->post_content)) : ?>
				<div style="font-size:15px;line-height:1.7;color:#475569;">
					<?php echo wp_kses_post(wpautop($event->post_content)); ?>
				</div>
			<?php endif; ?>

			<div style="margin:32px 0 20px;">
				<a href="<?php echo esc_url($accept_url); ?>" style="display:inline-block;margin:0 12px 12px 0;padding:14px 22px;background:#15803d;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:bold;"><?php esc_html_e('Zusagen', 'trainer-termine-manager'); ?></a>
				<a href="<?php echo esc_url($decline_url); ?>" style="display:inline-block;margin:0 12px 12px 0;padding:14px 22px;background:#b91c1c;color:#ffffff;text-decoration:none;border-radius:999px;font-weight:bold;"><?php esc_html_e('Absagen', 'trainer-termine-manager'); ?></a>
			</div>

			<p style="font-size:13px;line-height:1.6;color:#64748b;"><?php esc_html_e('Falls die Buttons in deinem Mailprogramm nicht funktionieren, nutze diese Links direkt:', 'trainer-termine-manager'); ?></p>
			<p style="font-size:13px;line-height:1.6;color:#64748b;word-break:break-all;">
				<?php esc_html_e('Zusagen:', 'trainer-termine-manager'); ?> <a href="<?php echo esc_url($accept_url); ?>"><?php echo esc_html($accept_url); ?></a><br />
				<?php esc_html_e('Absagen:', 'trainer-termine-manager'); ?> <a href="<?php echo esc_url($decline_url); ?>"><?php echo esc_html($decline_url); ?></a>
			</p>

			<p style="font-size:12px;color:#94a3b8;margin-bottom:0;"><?php echo esc_html(sprintf(__('Der Link ist bis %s gueltig.', 'trainer-termine-manager'), wp_date(get_option('date_format') . ' ' . get_option('time_format'), strtotime($invitation['token_expires_at'] . ' UTC')))); ?></p>
		</div>
	</div>
</body>
</html>
