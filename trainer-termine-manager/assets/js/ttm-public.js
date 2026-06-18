/**
 * Trainer Termine Manager - Public JavaScript
 * Enhanced UX/UI Interactions
 */

document.addEventListener('DOMContentLoaded', function () {
	// Initialize club toggle functionality
	initializeClubToggle();

	// Initialize dynamic row management
	initializeDynamicRows();

	// Initialize calendar interactions
	initializeCalendarInteractions();

	// Initialize frontend delete toggle
	initializeDeleteToggle();

	// Initialize repeat field toggle
	initializeRepeatToggle();

	// Add smooth transitions
	addSmoothTransitions();
});

/**
 * Initialize club toggle - enable/disable club name field
 */
function initializeClubToggle() {
	document.addEventListener('change', function (event) {
		const toggle = event.target.closest('[data-ttm-club-toggle]');

		if (!toggle) {
			return;
		}

		const form = toggle.closest('form');
		const clubInput = form ? form.querySelector('[data-ttm-club-name]') : null;

		if (!clubInput) {
			return;
		}

		const isChecked = toggle.checked;
		clubInput.disabled = !isChecked;
		clubInput.required = isChecked;
		clubInput.setAttribute('aria-disabled', !isChecked);

		if (!isChecked) {
			clubInput.value = '';
		}

		// Add visual feedback
		clubInput.closest('.ttm-check')?.classList.toggle('is-active', isChecked);
	});

	// Initialize on page load
	document.querySelectorAll('[data-ttm-club-toggle]').forEach((toggle) => {
		toggle.dispatchEvent(new Event('change', { bubbles: true }));
	});
}

/**
 * Initialize dynamic row management - add/remove form rows
 */
function initializeDynamicRows() {
	document.addEventListener('click', function (event) {
		const addButton = event.target.closest('[data-ttm-add-row]');
		const removeButton = event.target.closest('[data-ttm-remove-row]');

		if (addButton) {
			addNewRow();
		}

		if (removeButton) {
			removeRow(removeButton);
		}
	});
}

/**
 * Add a new row to the dynamic rows container
 */
function addNewRow() {
	const wrapper = document.querySelector('[data-ttm-rows]');
	const template = document.querySelector('#ttm-manual-row-template');

	if (!wrapper || !template) {
		return;
	}

	const newRow = document.createElement('div');
	newRow.innerHTML = template.innerHTML;
	newRow.style.animation = 'slideDown 0.3s ease';
	wrapper.appendChild(newRow);

	// Focus first input in new row
	const firstInput = newRow.querySelector('input');
	if (firstInput) {
		setTimeout(() => firstInput.focus(), 100);
	}
}

/**
 * Remove a row with smooth animation
 */
function removeRow(button) {
	const row = button.closest('.ttm-manual-row');
	if (!row) {
		return;
	}

	row.style.animation = 'slideUp 0.3s ease';
	setTimeout(() => row.remove(), 300);
}

/**
 * Initialize calendar interactions
 */
function initializeCalendarInteractions() {
	const calendarCells = document.querySelectorAll('.ttm-calendar-cell');

	calendarCells.forEach((cell) => {
		// Add hover class for better visual feedback
		cell.addEventListener('mouseenter', () => {
			cell.classList.add('is-hovered');
		});

		cell.addEventListener('mouseleave', () => {
			cell.classList.remove('is-hovered');
		});

		// Improve accessibility with keyboard navigation
		cell.addEventListener('keydown', (event) => {
			if (event.key === 'Enter' || event.key === ' ') {
				const event_link = cell.querySelector('.ttm-calendar-event');
				if (event_link) {
					event_link.click();
				}
			}
		});
	});
}

/**
 * Toggle the frontend delete confirmation card
 */
function initializeDeleteToggle() {
	document.addEventListener('click', function (event) {
		const toggleButton = event.target.closest('[data-ttm-toggle-delete]');
		const cancelButton = event.target.closest('[data-ttm-cancel-delete]');

		if (!toggleButton && !cancelButton) {
			return;
		}

		const wrapper = document.querySelector('[data-ttm-delete-form]');

		if (!wrapper) {
			return;
		}

		if (toggleButton) {
			wrapper.hidden = !wrapper.hidden;

			if (!wrapper.hidden) {
				const textarea = wrapper.querySelector('textarea');
				if (textarea) {
					setTimeout(() => textarea.focus(), 60);
				}
			}
		}

		if (cancelButton) {
			wrapper.hidden = true;
		}
	});
}

/**
 * Toggle repeat count field based on checkbox state
 */
function initializeRepeatToggle() {
	document.addEventListener('change', function (event) {
		const toggle = event.target.closest('[data-ttm-repeat-toggle]');

		if (!toggle) {
			return;
		}

		const scope = toggle.getAttribute('data-ttm-repeat-toggle');
		const wrapper = document.querySelector(`[data-ttm-repeat-field="${scope}"]`);

		if (!wrapper) {
			return;
		}

		wrapper.hidden = !toggle.checked;

		const input = wrapper.querySelector('input');
		if (input) {
			input.disabled = !toggle.checked;
			input.required = toggle.checked;
		}
	});

	document.querySelectorAll('[data-ttm-repeat-toggle]').forEach((toggle) => {
		toggle.dispatchEvent(new Event('change', { bubbles: true }));
	});
}

/**
 * Add smooth transitions to elements
 */
function addSmoothTransitions() {
	// Smooth scroll for anchor links
	document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
		anchor.addEventListener('click', function (e) {
			const href = this.getAttribute('href');
			if (href === '#') return;

			const target = document.querySelector(href);
			if (target) {
				e.preventDefault();
				target.scrollIntoView({
					behavior: 'smooth',
					block: 'start',
				});
			}
		});
	});

	// Add focus-visible class for keyboard navigation
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Tab') {
			document.body.classList.add('keyboard-active');
		}
	});

	document.addEventListener('mousedown', function () {
		document.body.classList.remove('keyboard-active');
	});
}

/**
 * Utility: Show toast message with animation
 */
function showToast(message, type = 'success') {
	const toast = document.createElement('div');
	toast.className = `ttm-toast ttm-toast-${type}`;
	toast.textContent = message;
	toast.style.cssText = `
		position: fixed;
		bottom: 20px;
		right: 20px;
		padding: 16px 20px;
		background: ${type === 'success' ? '#10b981' : '#ef4444'};
		color: white;
		border-radius: 8px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
		z-index: 9999;
		animation: slideUp 0.3s ease;
	`;

	document.body.appendChild(toast);

	setTimeout(() => {
		toast.style.animation = 'slideDown 0.3s ease';
		setTimeout(() => toast.remove(), 300);
	}, 3000);
}

// Add animation styles dynamically
const style = document.createElement('style');
style.textContent = `
	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slideDown {
		from {
			opacity: 1;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			transform: translateY(10px);
		}
	}

	.keyboard-active *:focus {
		outline: 2px solid #3b82f6 !important;
		outline-offset: 2px !important;
	}

	.ttm-check.is-active {
		background: #dbeafe;
		border-color: #93c5fd;
	}
`;
document.head.appendChild(style);

/**
 * reCAPTCHA v3 Integration
 */
document.addEventListener('DOMContentLoaded', function () {
	const recaptchaForm = document.querySelector('.ttm-application-form');
	if (!recaptchaForm || !window.TTM_RECAPTCHA_SITE_KEY) {
		return;
	}

	recaptchaForm.addEventListener('submit', function (e) {
		e.preventDefault();

		// Generiere reCAPTCHA Token
		grecaptcha.ready(function () {
			grecaptcha.execute(window.TTM_RECAPTCHA_SITE_KEY, { action: 'submit' }).then(function (token) {
				document.getElementById('ttm_recaptcha_token').value = token;
				recaptchaForm.submit();
			});
		});
	});
});
