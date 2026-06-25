// Default style constants used across custom cards
export const CARD_HEIGHT = "56px";
export const DEFAULT_PADDING = "8px";
export const DEFAULT_BUTTON_SIZE = 36;
export const DEFAULT_BUTTON_STYLE = {
	color: "var(--blue-color)",
	"border-radius": "50%",
	background: "rgb(from var(--blue-color) r g b / 0.2)",
    border: "none"  // Default to no border
};

// Add separate defaults for structural properties
export const DEFAULT_BUTTON_PROPERTIES = {
	size: "36px",
	icon_size: "24px",
};

const PREBUILT_ACTIONS = (entity_id) => {
	const domain = entity_id.split(".")[0];
	return {
		clear: {
			action: "call-service",
			service: `${domain}.set_value`,
			data: {
				value: "",
			},
			target: {
				entity_id: entity_id,
			},
		},
		toast: {
			action: "fire-dom-event",
			browser_mod: {
				service: "notification",
				data: {
					message: "{{ value }}",
				},
			},
		},
		"more-info": {
			action: "more-info",
			entity: entity_id,
		},
	};
};

/**
 * Read a style key in either hyphenated ("margin-left") or underscored
 * ("margin_left") form. YAML allows both and users mix them; we accept either.
 *
 * Note: as of v0.3.17, setConfig normalizes underscores → hyphens at config
 * load time, so this fallback is mostly a safety net for direct callers.
 */
export function readStyleKey(style, hyphenated) {
	if (!style) return undefined;
	if (style[hyphenated] !== undefined) return style[hyphenated];
	const underscored = hyphenated.replace(/-/g, "_");
	return style[underscored];
}

/**
 * Convert underscore-keyed style props to hyphenated form (shallow walk —
 * style blocks are flat in our YAML). Used once at config-load time so
 * downstream reads can use the canonical CSS form ("padding-left") without
 * each call site having to fall back to the underscored variant.
 */
export function normalizeStyleKeys(obj) {
	if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
	const out = {};
	for (const [k, v] of Object.entries(obj)) {
		out[k.replace(/_/g, "-")] = v;
	}
	return out;
}

// Button Utilities
export function calculateButtonMargins(size, position, isAdditionalButton, style) {
	const sizeValue = parseInt(size);
	const difference = DEFAULT_BUTTON_SIZE - sizeValue;
	const halfDiff = difference > 0 ? difference / 2 : 0;
	const userLeft = readStyleKey(style, "margin-left");
	const userRight = readStyleKey(style, "margin-right");
	return {
		left:
			userLeft ||
			(position === "end" ? `${halfDiff + 8}px` : `${isAdditionalButton ? halfDiff + 8 : halfDiff}px`),
		right: userRight || `${halfDiff}px`,
	};
}

/**
 * Applies styles to a button element
 * @param {HTMLElement} button - The button element to style
 * @param {Object} style - Style configuration
 * @param {boolean} isAdditionalButton - Whether this is an additional button
 * @param {string} position - Button position
 */
export function getButtonStyles(button, buttonConfig, isAdditionalButton, position) {
	const style = { ...DEFAULT_BUTTON_STYLE, ...buttonConfig.style };
	const size = buttonConfig.size || DEFAULT_BUTTON_PROPERTIES.size;

	// HA 2026.4+ ha-icon-button ignores --mdc-icon-button-size and renders
	// at the MD touch-target default (48px). We have to force width AND
	// height (plus min-*) inline AND override the var with !important.
	// Also force flex-centering so the icon stays in the middle when we
	// shrink the button — otherwise it inherits 48px-tuned padding and
	// the icon drifts to a corner.
	button.style.setProperty("--mdc-icon-button-size", size, "important");
	button.style.setProperty("width", size, "important");
	button.style.setProperty("height", size, "important");
	button.style.setProperty("min-width", size, "important");
	button.style.setProperty("min-height", size, "important");
	button.style.setProperty("max-width", size, "important");
	button.style.setProperty("max-height", size, "important");
	button.style.setProperty("padding", "0", "important");
	button.style.setProperty("box-sizing", "border-box", "important");
	button.style.setProperty("flex", "0 0 auto", "important");
	button.style.setProperty("display", "inline-flex", "important");
	button.style.setProperty("align-items", "center", "important");
	button.style.setProperty("justify-content", "center", "important");

	const margins = calculateButtonMargins(size, position, isAdditionalButton, style);
	button.style.marginLeft = margins.left;
	button.style.marginRight = margins.right;

	button.style.setProperty("background-color", style.background || `rgb(from ${style.color} r g b / 0.2)`);
	button.style.setProperty("border-radius", readStyleKey(style, "border-radius") || "50%");
	button.style.setProperty("border", style["border"] || "none");
}

/**
 * Applies styles to an icon element
 * @param {HTMLElement} icon - The icon element to style
 * @param {Object} style - Style configuration
 */
export function getIconStyles(icon, buttonConfig) {
	const style = { ...DEFAULT_BUTTON_STYLE, ...buttonConfig.style };
	icon.style.setProperty("--mdc-icon-size", buttonConfig.icon_size || DEFAULT_BUTTON_PROPERTIES.icon_size);
	icon.style.display = "flex";
	icon.style.alignItems = "center";
	icon.style.justifyContent = "center";
	icon.style.setProperty("color", style.color);
}

/**
 * Applies styles to a container element
 * @param {HTMLElement} container - The container element to style
 * @param {boolean} isEnd - Whether this is an end-positioned container
 */
export function getContainerStyles(container, isEnd = false) {
	container.className = "container";
	container.id = isEnd ? "trailingContainer" : "leadingContainer";
	container.style.display = "flex";
	container.style.flexDirection = "row";
	container.style.alignItems = "center";
	if (isEnd) container.style.marginLeft = "auto";
}

/**
 * Handles action events for buttons
 * @param {Object} actionConfig - Action configuration
 * @param {string} value - Current value
 * @param {HTMLElement} element - Element to dispatch event from
 */
export function handleAction(actionConfig, value, element) {
	if (!actionConfig) return;

	const processedConfig = JSON.parse(JSON.stringify(actionConfig).replace(/\{\{\s*value\s*\}\}/g, value));

	const event = new Event("hass-action", {
		bubbles: true,
		composed: true,
	});
	event.detail = {
		config: {
			tap_action: processedConfig,
		},
		action: "tap",
	};
	element.dispatchEvent(event);
}

/**
 * Debounces a function call
 * @param {Function} callback - Function to debounce
 * @param {number} waitTime - Time to wait in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(callback, waitTime) {
	let timer;
	return (...args) => {
		clearTimeout(timer);
		timer = setTimeout(() => callback(...args), waitTime);
	};
}

/**
 * Extracts object ID from entity ID
 * @param {string} entityId - Full entity ID
 * @returns {string} Object ID portion
 */
export function computeObjectId(entityId) {
	return entityId.substring(entityId.indexOf(".") + 1);
}

/**
 * Computes friendly name for an entity
 * @param {Object} stateObj - Entity state object
 * @param {string} entityId - Entity ID
 * @returns {string} Computed name
 */
export function computeStateName(stateObj, entityId) {
	return stateObj.attributes.friendly_name === undefined
		? computeObjectId(entityId).replace(/_/g, " ")
		: stateObj.attributes.friendly_name || "";
}

/**
 * Factory class for creating button elements
 */
export class ButtonFactory {
	/**
	 * @param {Object} config - Card configuration
	 * @param {HTMLElement} element - Parent element
	 */
	constructor(config, element) {
		this._config = config;
		this._element = element;
	}

	/**
	 * Creates a container for buttons (at beginning or end of row)
	 * @param {boolean} isEnd - Whether this is an end-positioned container
	 * @param {Array} buttons - Array of button configurations
	 * @returns {HTMLElement} Button container
	 */
	createButtonContainer(isEnd = false, buttons) {
		const container = document.createElement("div");
		getContainerStyles(container, isEnd);

		const filteredButtons = buttons
			.filter((btn) => (isEnd ? btn.position === "end" : !btn.position || btn.position === "start"))
			.map((btn, index) => this.createIconButton(btn, index, btn.position));

		filteredButtons.forEach((button) => container.appendChild(button));
		return container;
	}

	/**
	 * Creates an icon button
	 * @param {Object} buttonConfig - Button configuration
	 * @param {number} index - Button index
	 * @param {string} position - Button position
	 * @returns {HTMLElement} Icon button
	 */
	createIconButton(buttonConfig, index, position) {
		const button = document.createElement("ha-icon-button");
		if (buttonConfig.id) button.id = buttonConfig.id;

		getButtonStyles(button, buttonConfig, index > 0, position);
		this._setupButtonAction(button, buttonConfig);
		this._addButtonIcon(button, buttonConfig.icon, buttonConfig);

		// ha-icon-button → ha-button → <button part="base">. Sizing the outer
		// host doesn't shrink the inner button — the MD ripple/hover overlay
		// draws on that inner element, so a 32px button still shows a 48px
		// hover circle. Pierce both shadow roots to force the inner button to
		// 100% of the host whenever the button is smaller than MD's 48px
		// touch target. Card-level compact_buttons forces it for all buttons.
		const size = buttonConfig.size || DEFAULT_BUTTON_PROPERTIES.size;
		const sizeNum = parseInt(size);
		if (this._config.compact_buttons || sizeNum < 48) {
			this._injectCompactButtonStyles(button, buttonConfig);
		}

		return button;
	}

	_injectCompactButtonStyles(button, buttonConfig) {
		// Propagate the host's border-radius into the inner ha-button so the
		// MD hover/ripple overlay clips to the same shape — otherwise a
		// border-radius: 12px host still shows a 50% (circular) hover state
		// because the overlay draws on the inner button.
		const style = { ...DEFAULT_BUTTON_STYLE, ...(buttonConfig?.style || {}) };
		const radius = readStyleKey(style, "border-radius") || "50%";
		const radiusRule = `border-radius: ${radius} !important; overflow: hidden !important;`;
		// ha-button's own ::after is what actually draws the MD hover/focus
		// overlay (background fades in on hover). It's hardcoded to
		// border-radius: 50% inside ha-button's stylesheet — override here
		// so the hover shape matches the rounded-rect host instead of
		// always being a circle.
		// FORWARD-COMPAT: ha-button::after/::before is a Material/Web Awesome
		// implementation detail. If HA swaps to mwc-ripple/md-ripple or
		// renames the pseudo, this rule becomes a no-op (hover reverts to
		// default circle); it won't error.
		const outerCss = `ha-button { width: 100% !important; height: 100% !important; min-width: 0 !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; ${radiusRule} } ha-button::after, ha-button::before { border-radius: ${radius} !important; }`;
		// Inner button (inside ha-button's shadow): the native <button class="has-label">
		// uses baseline alignment by default, so the slotted ha-icon sits ~3px below
		// center. Force flex-center on the button itself AND on the .label slot so
		// the icon centers properly even when the outer host has a border (which
		// shrinks the content area asymmetrically vs MD's default 48px touch target).
		const innerCss = `
			:host {
				display: inline-flex !important;
				align-items: center !important;
				justify-content: center !important;
				padding: 0 !important;
				margin: 0 !important;
			}
			[part="base"], button {
				width: 100% !important;
				height: 100% !important;
				min-width: 0 !important;
				min-height: 0 !important;
				padding: 0 !important;
				margin: 0 !important;
				box-sizing: border-box !important;
				display: inline-flex !important;
				align-items: center !important;
				justify-content: center !important;
				${radiusRule}
			}
		`;

		// Cancel any in-flight retry chain from a previous call so we don't
		// leave parallel chains racing on the same button after rapid
		// setConfig() calls.
		if (button._stiInjectTimer) {
			clearTimeout(button._stiInjectTimer);
			button._stiInjectTimer = null;
		}

		const tryInject = (depth = 0) => {
			// On retries (depth > 0) bail if the button was detached while
			// we were waiting. We can't check isConnected on depth 0 — this
			// function is called synchronously from createIconButton right
			// after document.createElement, before the button is appended,
			// so isConnected is legitimately false on the first call.
			if (depth > 0 && !button.isConnected) return;

			if (!button.shadowRoot) {
				if (depth > 20) return;
				button._stiInjectTimer = setTimeout(() => tryInject(depth + 1), 50);
				return;
			}
			try {
				// Cache the outer sheet on the button host so re-calls
				// reuse the SAME CSSStyleSheet instance via replaceSync —
				// without this, every setConfig appends a new sheet and
				// the adoptedStyleSheets array grows unboundedly.
				let outerSheet = button._stiOuterSheet;
				if (!outerSheet) {
					outerSheet = new CSSStyleSheet();
					button._stiOuterSheet = outerSheet;
					button.shadowRoot.adoptedStyleSheets = [
						...button.shadowRoot.adoptedStyleSheets,
						outerSheet,
					];
				}
				outerSheet.replaceSync(outerCss);

				const haButton = button.shadowRoot.querySelector("ha-button");
				if (haButton && haButton.shadowRoot) {
					let innerSheet = button._stiInnerSheet;
					if (!innerSheet) {
						innerSheet = new CSSStyleSheet();
						button._stiInnerSheet = innerSheet;
						haButton.shadowRoot.adoptedStyleSheets = [
							...haButton.shadowRoot.adoptedStyleSheets,
							innerSheet,
						];
					}
					innerSheet.replaceSync(innerCss);
				} else if (haButton && depth < 20) {
					button._stiInjectTimer = setTimeout(() => tryInject(depth + 1), 50);
				}
			} catch (e) {}
		};
		tryInject();
	}

	/**
	 * Sets up click handler for a button
	 * @private
	 */
	_setupButtonAction(button, config) {
		button.addEventListener("click", () => {
			if (config.tap_action) {
				handleAction(config.tap_action, this._element.value, this._element);
			} else if (config.template && PREBUILT_ACTIONS(this._config.entity)[config.template]) {
				const entity = config.entity || this._config.entity;
				handleAction(PREBUILT_ACTIONS(entity)[config.template], this._element.value, this._element);

			}
			// If no tap_action and no template or invalid template button has no action
		});
	}

	/**
	 * Adds an icon to a button
	 * @private
	 */
	_addButtonIcon(button, iconName, buttonConfig) {
		const icon = document.createElement("ha-icon");
		getIconStyles(icon, buttonConfig);
		icon.setAttribute("icon", iconName);
		button.appendChild(icon);
	}
}
