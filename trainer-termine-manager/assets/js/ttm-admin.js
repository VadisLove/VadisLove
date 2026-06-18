/**
 * Trainer Termine Manager - Admin JavaScript
 * Enhanced UX/UI Interactions for Admin Panel
 */

document.addEventListener('DOMContentLoaded', function () {
	// Initialize dynamic row management
	initializeAdminDynamicRows();

	// Initialize form enhancements
	initializeFormEnhancements();

	// Initialize repeat field toggle
	initializeRepeatToggle();

	// Initialize action buttons
	initializeActionButtons();

	// Add keyboard shortcuts
	initializeKeyboardShortcuts();
});

/**
 * Initialize dynamic row management for admin panel
 */
function initializeAdminDynamicRows() {
	document.addEventListener('click', function (event) {
		const addButton = event.target.closest('[data-ttm-add-row]');
		const removeButton = event.target.closest('[data-ttm-remove-row]');

		if (addButton) {
			addAdminRow();
		}

		if (removeButton) {
			removeAdminRow(removeButton);
		}
	});
}

/**
 * Add new row to admin table
 */
function addAdminRow() {
	const wrapper = document.querySelector('[data-ttm-rows]');
	const template = document.querySelector('#ttm-manual-row-template');

	if (!wrapper || !template) {
		return;
	}

	const newRow = document.createElement('div');
	newRow.innerHTML = template.innerHTML;
	newRow.style.animation = 'slideDown 0.3s ease';
	newRow.classList.add('ttm-manual-row');
	wrapper.appendChild(newRow);

	// Focus first input
	const firstInput = newRow.querySelector('input');
	if (firstInput) {
		setTimeout(() => firstInput.focus(), 100);
	}

	showFeedback('Zeile hinzugefügt', 'success');
}

/**
 * Remove admin row with animation
 */
function removeAdminRow(button) {
	const row = button.closest('.ttm-manual-row');
	if (!row) {
		return;
	}

	row.style.animation = 'slideUp 0.3s ease';
	setTimeout(() => {
		row.remove();
		showFeedback('Zeile gelöscht', 'success');
	}, 300);
}

/**
 * Initialize form enhancements
 */
function initializeFormEnhancements() {
	// Add character counter to textareas
	document.querySelectorAll('textarea').forEach((textarea) => {
		const maxLength = textarea.getAttribute('maxlength');
		if (!maxLength) return;

		textarea.addEventListener('input', function () {
			updateCharacterCounter(this);
		});

		// Create counter element
		const counter = document.createElement('small');
		counter.className = 'ttm-char-counter';
		counter.style.cssText = `
			display: block;
			margin-top: 4px;
			color: #64748b;
			font-size: 0.85rem;
		`;
		textarea.parentNode.insertBefore(counter, textarea.nextSibling);

		// Initial count
		updateCharacterCounter(textarea);
	});

	// Add input validation feedback
	document.querySelectorAll('input[required], textarea[required]').forEach((field) => {
		field.addEventListener('blur', function () {
			validateField(this);
		});

		field.addEventListener('input', function () {
			if (this.classList.contains('is-invalid')) {
				validateField(this);
			}
		});
	});
}

/**
 * Toggle repeat count field in admin.
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
 * Update character counter
 */
function updateCharacterCounter(textarea) {
	const maxLength = textarea.getAttribute('maxlength');
	const currentLength = textarea.value.length;
	const counter = textarea.parentNode.querySelector('.ttm-char-counter');

	if (counter) {
		counter.textContent = `${currentLength} / ${maxLength} Zeichen`;

		if (currentLength / maxLength > 0.9) {
			counter.style.color = '#f59e0b';
		} else if (currentLength / maxLength > 0.95) {
			counter.style.color = '#ef4444';
		} else {
			counter.style.color = '#64748b';
		}
	}
}

/**
 * Validate a form field
 */
function validateField(field) {
	const isValid = field.value.trim().length > 0;

	if (isValid) {
		field.classList.remove('is-invalid');
		field.classList.add('is-valid');
	} else {
		field.classList.add('is-invalid');
		field.classList.remove('is-valid');
	}

	return isValid;
}

/**
 * Initialize action buttons
 */
function initializeActionButtons() {
	document.querySelectorAll('.ttm-admin-actions a, .ttm-admin-actions button').forEach((btn) => {
		btn.addEventListener('click', function (e) {
			// Add visual feedback
			this.classList.add('is-loading');

			// Remove feedback after action completes
			setTimeout(() => {
				this.classList.remove('is-loading');
			}, 500);
		});
	});

	// Add confirmation dialogs for dangerous actions
	document.querySelectorAll('[data-confirm]').forEach((btn) => {
		btn.addEventListener('click', function (e) {
			const message = this.getAttribute('data-confirm');
			if (!confirm(message)) {
				e.preventDefault();
			}
		});
	});
}

/**
 * Initialize keyboard shortcuts
 */
function initializeKeyboardShortcuts() {
	document.addEventListener('keydown', function (e) {
		// Ctrl/Cmd + Enter to submit form
		if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
			const form = document.querySelector('form');
			if (form) {
				form.submit();
			}
		}

		// Escape to close modals or clear focus
		if (e.key === 'Escape') {
			document.activeElement.blur();
		}
	});
}

/**
 * Show feedback message
 */
function showFeedback(message, type = 'info') {
	// Use WordPress notice if available
	const noticeClass = type === 'success' ? 'notice-success' : 'notice-' + type;

	const notice = document.createElement('div');
	notice.className = `notice ${noticeClass} is-dismissible`;
	notice.style.cssText = `
		margin: 20px auto;
		padding: 12px 20px;
		border-radius: 8px;
		border-left: 4px solid ${type === 'success' ? '#10b981' : '#f59e0b'};
	`;

	notice.innerHTML = `
		<p>${message}</p>
		<button type="button" class="notice-dismiss" style="cursor: pointer; position: absolute; right: 20px; top: 10px; padding: 0; border: 0; background: none; font-size: 20px;">
			<span class="screen-reader-text">Dismiss</span>
		</button>
	`;

	// Insert at top of admin area
	const adminBody = document.querySelector('.wrap');
	if (adminBody) {
		adminBody.insertBefore(notice, adminBody.firstChild);

		// Auto-dismiss after 5 seconds
		setTimeout(() => {
			notice.style.animation = 'slideUp 0.3s ease';
			setTimeout(() => notice.remove(), 300);
		}, 5000);

		// Handle dismiss button
		notice.querySelector('.notice-dismiss').addEventListener('click', function () {
			notice.style.animation = 'slideUp 0.3s ease';
			setTimeout(() => notice.remove(), 300);
		});
	}
}

/**
 * Utility: Format date input
 */
function formatDateInput(input) {
	input.addEventListener('change', function () {
		if (this.value) {
			const date = new Date(this.value);
			if (!isNaN(date.getTime())) {
				this.value = date.toISOString().split('T')[0];
			}
		}
	});
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
	@keyframes slideDown {
		from {
			opacity: 0;
			transform: translateY(-10px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes slideUp {
		from {
			opacity: 1;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			transform: translateY(-10px);
		}
	}

	.is-loading {
		opacity: 0.6;
		pointer-events: none;
	}

	.is-valid {
		border-color: #10b981 !important;
		background: #f0fdf4 !important;
	}

	.is-invalid {
		border-color: #ef4444 !important;
		background: #fef2f2 !important;
	}

	.ttm-char-counter {
		transition: color 0.2s ease;
	}
`;
document.head.appendChild(style);
