<?php
/**
 * Public token response template.
 *
 * @package TrainerTermineManager
 */

if (! defined('ABSPATH')) {
	exit;
}
?>
<!doctype html>
<html lang="de">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title><?php esc_html_e('Einladung', 'trainer-termine-manager'); ?></title>
	<link rel="stylesheet" href="<?php echo esc_url(TTM_URL . 'assets/css/ttm-public.css'); ?>" />
</head>
<body class="ttm-response-page">
	<div class="ttm-response-shell">
		<div class="ttm-response-card <?php echo 'success' === $type ? 'is-success' : 'is-error'; ?>">
			<p class="ttm-eyebrow"><?php esc_html_e('Trainer-Termine', 'trainer-termine-manager'); ?></p>
			<h1><?php echo esc_html($message); ?></h1>
			<p>
				<?php
				echo 'success' === $type
					? esc_html__('Deine Rueckmeldung wurde gespeichert. Du kannst diese Einladung spaeter im Mitgliederbereich erneut aufrufen, falls Aenderungen noetig sind.', 'trainer-termine-manager')
					: esc_html__('Bitte kontaktiere den Verein oder fordere eine neue Einladung an, wenn du weiterhin antworten moechtest.', 'trainer-termine-manager');
				?>
			</p>
			<p><a class="ttm-button ttm-button-primary" href="<?php echo esc_url(home_url('/')); ?>"><?php esc_html_e('Zur Website', 'trainer-termine-manager'); ?></a></p>
		</div>
	</div>
</body>
</html>
