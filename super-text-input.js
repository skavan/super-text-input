/**
 * super text input for Home Assistant
 * Provides a customizable text input field with optional buttons and r/t updates
 */

// note the super hacky way of restoring focus in r/t mode. HELP!

// Import utilities and constants from card-utils.js
import {
	CARD_HEIGHT,
	DEFAULT_PADDING,
	DEFAULT_BUTTON_STYLE,
	ButtonFactory,
	handleAction,
	debounce,
	computeStateName,
} from "./card-utils.js";

// Add this new import
import "./editor.js";

// Get LitElement base class from Home Assistant frontend
const LitElement = customElements.get("home-assistant-main")
	? Object.getPrototypeOf(customElements.get("home-assistant-main"))
	: Object.getPrototypeOf(customElements.get("hui-view"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class SuperTextInput extends LitElement {
	static getConfigElement() {
		return document.createElement("super-text-input-editor");
	}
	/**
	 * Define reactive properties
	 */
	static get properties() {
		return {
			label: { type: String },
			value: { type: String },
			minlength: { type: Number },
			maxlength: { type: Number },
			pattern: { type: String },
			mode: { type: String },
			stateObj: { type: Object },
			_config: { type: Object },
			_lastUpdate: { type: Number },
		};
	}

	// Add to static constants
	static DEFAULT_FOCUS_DELAY = 100;

	// default initial values
	static DEFAULT_CONFIG = {
		entity: "",
		name: "",
		label: "",
		placeholder: "",
		update_mode: "blur",
		debounce_time: 1000,
	};

	// Text field style constants
	static TEXT_FIELD_STYLES = {
		width: "100%",
		height: "52px",
		marginLeft: "0px",
        marginRight: "0px",
		offsetLeftMargin: "8px",
		defaultTextLeftPadding: "6px",
		defaultTextBottomMargin: "-3px",
	};


	// Add these new static methods here

	static getConfigElement() {
		return document.createElement("super-text-input-editor");
	}

	static getStubConfig() {
		return SuperTextInput.DEFAULT_CONFIG;
	}

	static DEFAULT_DEBOUNCE_TIME = 1000;

	_internalChange = false;

	/**
	 * Initialize default values
	 */
	constructor() {
		super();
		this.label = "";
		this.value = "";
		this.minlength = 0;
		this.maxlength = Infinity;
		this.pattern = "";
		this.mode = "";
		this.stateObj = null;
		this._config = null;
	}

	/**
	 * Set up card configuration
	 * @param {Object} config - Card configuration object
	 */
	setConfig(config) {
		this._config = {
			...SuperTextInput.DEFAULT_CONFIG,
			...config,
		};

		if (config.entity) {
			this._entityType = config.entity.split(".")[0];
		}

		this._debounce_time = config.debounce_time || SuperTextInput.DEFAULT_DEBOUNCE_TIME;
		this._update_mode = config.update_mode || "blur";

		if (config.buttons) {
			this._buttonFactory = new ButtonFactory(config, this);
		}

		if (this._update_mode === "realtime") {
			this._debouncedUpdate = debounce((value) => {
				this.setValue(value);
			}, this._debounce_time);
		}
	}

	/**
	 * Handle Home Assistant state updates
	 * @param {Object} hass - Home Assistant instance
	 */
	set hass(hass) {
		// Store current value to detect changes
		const oldValue = this.value;
		// Store Home Assistant object reference
		this._hass = hass;
		// Get the current state of our entity
		this.stateObj = hass.states[this._config.entity];

		if (this.stateObj) {
			// Update all entity-based properties
			this.value = this.stateObj.state;
			this.minlength = this.stateObj.attributes.min;
			this.maxlength = this.stateObj.attributes.max;
			this.pattern = this.stateObj.attributes.pattern;
			this.mode = this.stateObj.attributes.mode;

			// Set name to entity friendly name if not configured
			this._config.name = this._config.name || computeStateName(this.stateObj, this._config.entity);

			// Set label to configured label or name
			this.label = this._config.label || this._config.name;

			// Handle external value changes and trigger change actions
			// Only if change wasn't triggered internally and value actually changed
			if (!this._internalChange && oldValue !== this.value && this._config.change_action) {
				handleAction(this._config.change_action, this.value, this);
			}

			// Reset internal change flag
			this._internalChange = false;
		}
	}

	/**
	 * Apply styles to the card container
	 * @param {HTMLElement} card - Card element to style
	 */
	_getCardStyles(card) {
		const cardStyle = this._config.style?.card || {};

		card.style.display = "flex";
		card.style.flexDirection = "row";
		card.style.alignItems = "center";
		card.style.height = cardStyle.height || CARD_HEIGHT;
		card.style.padding = cardStyle.padding || DEFAULT_PADDING;

		if (cardStyle.background) card.style.background = cardStyle.background;
		if (cardStyle["border-radius"]) card.style.borderRadius = cardStyle["border-radius"];
		if (cardStyle.border) card.style.border = cardStyle.border;
	}

	/**
	 * Apply styles to the text field
	 * @param {HTMLElement} textField - Text field element to style
	 */
	_getOuterTextFieldStyles(textField) {
		const style = this._config.style?.editor || {};
		const hasLeadingButtons = this._config.buttons?.some((btn) => !btn.position || btn.position === "start");

		const styles = { ...SuperTextInput.TEXT_FIELD_STYLES };
		if (hasLeadingButtons) styles.marginLeft = styles.offsetLeftMargin;
		styles.marginLeft = style["margin-left"] || styles.marginLeft;
		styles.marginRight = style["margin-right"] || styles.marginRight;
		styles.height = style["height"] || styles.height;

		textField.style.width = styles.width;
		textField.style.marginLeft = styles.marginLeft;
		textField.style.marginRight = styles.marginRight;
	}

	async _applyDeepTextFieldStyles() {
		if (!this._config) return;

		const style = this._config.style?.editor || {};
		const styles = { ...SuperTextInput.TEXT_FIELD_STYLES };
		styles.height = style["height"] || styles.height;

		await customElements.whenDefined("ha-input");

		const textField = this.shadowRoot?.querySelector("#textinput");
		if (!textField) return;

		if (textField.updateComplete) await textField.updateComplete;
		if (!textField.shadowRoot) return;

		// Web Awesome component (ha-input in HASS 2026.4+)
		const waInput = textField.shadowRoot.querySelector("wa-input");
		if (waInput) {
			waInput.style.height = styles.height;
			if (waInput.updateComplete) await waInput.updateComplete;

			const waRoot = waInput.shadowRoot;
			if (waRoot) {
				const label = waRoot.querySelector("label");
				if (label) {
					label.style.paddingTop = "1px";
					label.style.paddingBottom = "0px";
					label.style.lineHeight = "1.2";
				}
				const base = waRoot.querySelector("[part='base']");
				if (base) {
					base.style.paddingTop = "2px";
					base.style.paddingBottom = "2px";
					if (style.background) base.style.background = style.background;
					if (style["padding-left"]) base.style.paddingLeft = style["padding-left"];
				}
			}
			return;
		}

		// Legacy MDC component (ha-textfield in HASS < 2026.4)
		const mdcTextField = textField.shadowRoot.querySelector(".mdc-text-field");
		if (mdcTextField) {
			mdcTextField.style.height = styles.height;
			if (style.background) mdcTextField.style.background = style.background;
			mdcTextField.style.paddingLeft = style["padding-left"] || styles.defaultTextLeftPadding;
		}
		const input = textField.shadowRoot.querySelector(".mdc-text-field__input");
		if (input) {
			input.style.alignSelf = "end";
			input.style.marginBottom = style["margin-bottom"] || styles.defaultTextBottomMargin;
		}
		const label = textField.shadowRoot.querySelector(".mdc-floating-label");
		if (label) {
			label.style.setProperty("left", style["padding-left"] || styles.defaultTextLeftPadding, "important");
		}
	}

	/**
	 * Create the text field element
	 * @returns {HTMLElement} Configured text field
	 */
	_createTextField() {
		// Create Home Assistant text field (ha-input since HASS 2026.4, replaces ha-textfield)
		const textField = document.createElement("ha-input");

		// Set up basic field properties from component state
		textField.label = this.label; // Display label above input
		textField.value = this.value; // Current input value
		textField.minlength = this.minlength; // Minimum text length validation
		textField.maxlength = this.maxlength; // Maximum text length validation
		textField.autoValidate = this.pattern; // Enable pattern validation
		textField.pattern = this.pattern; // Regex pattern for validation
		textField.type = this.mode; // Input type (text, password, etc)
		textField.id = "textinput"; // ID for DOM queries
		textField.placeholder = this._config.placeholder || ""; // Placeholder text

		// Event Listeners for value changes:
		// 'change' fires when focus leaves the field (blur)
		textField.addEventListener("change", this.valueChanged.bind(this));
		// 'input' fires on every keystroke for real-time updates
		textField.addEventListener("input", this.inputChanged.bind(this));

		// Apply outer styles (width, margins) — deep shadow styles applied in updated()
		this._getOuterTextFieldStyles(textField);

		// Focus Management:
		// This code maintains cursor position and typing flow during real-time updates
		if (this._update_mode === "realtime" && this._lastUpdate && Date.now() - this._lastUpdate < 1000) {
			// Three-part check ensures optimal focus handling:
			//
			// 1. Real-time Mode Check (this._update_mode === "realtime")
			//    - Only needed during immediate keystroke updates
			//    - Blur mode updates happen after focus is lost, so no restoration needed
			//
			// 2. Update Timestamp Check (this._lastUpdate)
			//    - Verifies we have actually performed an update
			//    - Prevents unnecessary focus management on initial render
			//    - Timestamp is set in setValue() during real-time updates
			//
			// 3. Time Window Check (Date.now() - this._lastUpdate < 1000)
			//    - Creates 1-second window for focus restoration
			//    - Matches natural typing rhythm and update cycles
			//    - Prevents focus jumps during non-typing interactions
			//
			// Focus Restoration (setTimeout):
			//    - 100ms delay ensures DOM stability after updates
			//    - Arrow function maintains correct 'this' context
			//    - Returns cursor to input field for uninterrupted typing

			// this._config.forced_focus_delay is an advanced prop to adjust focus delay
			setTimeout(() => textField.focus(), this._config.forced_focus_delay || SuperTextInput.DEFAULT_FOCUS_DELAY);
		}

		return textField;
	}

	/**
	 * Render the card
	 * @returns {TemplateResult} Card template
	 */

	render() {
		const card = document.createElement("ha-card");
		this._getCardStyles(card);
		// create the leading buttons, if any
		if (this._config.buttons) {
			card.appendChild(this._buttonFactory.createButtonContainer(false, this._config.buttons));
		}

		// create the text field
		card.appendChild(this._createTextField());

		// create the trailing buttons, if any
		if (this._config.buttons) {
			card.appendChild(this._buttonFactory.createButtonContainer(true, this._config.buttons));
		}

		return html`${card}`;
	}

	updated(changedProps) {
		super.updated(changedProps);
		this._applyDeepTextFieldStyles();
	}

	/**
	 * Updates the entity value in Home Assistant and handles related actions
	 * @param {string} value - The new value to set
	 */
	setValue(value) {
		// Only proceed if the value has actually changed
		if (this.stateObj.state !== value) {
			// Flag to prevent feedback loop when value updates come back from HA
			this._internalChange = true;

			// Call Home Assistant service to update the entity
			// Uses the entity type (input_text, text, etc) to determine correct service
			this._hass.callService(this._entityType, "set_value", {
				entity_id: this._config.entity,
				value: value,
			});

			// If a change action is configured (like a script or service call)
			// trigger it with the new value
			if (this._config.change_action) {
				handleAction(this._config.change_action, value, this);
			}

			// In realtime mode, track when the last update occurred
			// Used to force focus after updates
			if (this._update_mode === "realtime") {
				this._lastUpdate = Date.now();
			}
		}
	}

	/**
	 * Handles real-time input changes and debouncing
	 * @param {Event} ev - Input event from text field
	 */
	inputChanged(ev) {
		// Only process changes in realtime mode
		if (this._update_mode !== "realtime") return;

		// Get the current input value
		const value = ev.target.value;

		// Empty values are updated immediately
		if (value === "") {
			this.setValue(value);
		} else {
			// Non-empty values use debounced update to prevent too frequent updates
			this._debouncedUpdate(value);
		}
	}

	/**
	 * Handle value changes on blur
	 * @param {Event} ev - Change event
	 */
	valueChanged(ev) {
		const value = this.shadowRoot.querySelector("#textinput").value;
		this.setValue(value);
	}
}

// Register the custom element and editor xx
customElements.define("super-text-input", SuperTextInput);

// Register card for UI editor
window.customCards = window.customCards || [];
window.customCards.push({
	type: "super-text-input",
	name: "Super Text Input",
	description: "A text input card with enhanced features - such as real-time input, icons, buttons and actions",
	preview: "/local/community/super-text-input/preview.png",
	configurable: true,
	version: "0.1.0",
	customElement: true,
});
