/**
 * Super Text Input for Home Assistant
 * Provides a customizable text input field with optional buttons and r/t updates
 *
 * Compat:
 *  - HASS 2026.4+ uses <ha-input> (Web Awesome / wa-input internals)
 *  - Older HASS uses <ha-textfield> (MDC internals)
 *  - This card detects which is available and renders/styles accordingly.
 *
 * Architecture notes:
 *  - render() returns a real Lit html template so Lit reconciles the input node
 *    across re-renders. This preserves focus/caret while typing (fixes the
 *    iOS keyboard-dismiss and "can't type space" problems) — no more
 *    setTimeout(focus) hack required.
 *  - Deep shadow-DOM styling is applied in updated() because we can't reach
 *    into the input's shadow tree from a template.
 */

import {
	CARD_HEIGHT,
	DEFAULT_PADDING,
	ButtonFactory,
	handleAction,
	debounce,
	computeStateName,
	normalizeStyleKeys,
} from "./card-utils.js?v=0.3.28";

import "./editor.js?v=0.3.28";

// Get LitElement base class from Home Assistant frontend
const LitElement = customElements.get("home-assistant-main")
	? Object.getPrototypeOf(customElements.get("home-assistant-main"))
	: Object.getPrototypeOf(customElements.get("hui-view"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

// Prefer the modern ha-input (HASS 2026.4+); fall back to ha-textfield (legacy).
const INPUT_TAG = customElements.get("ha-input") ? "ha-input" : "ha-textfield";

class SuperTextInput extends LitElement {
	static getConfigElement() {
		return document.createElement("super-text-input-editor");
	}

	static getStubConfig() {
		return SuperTextInput.DEFAULT_CONFIG;
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
		};
	}

	static DEFAULT_CONFIG = {
		entity: "",
		name: "",
		label: "",
		placeholder: "",
		update_mode: "blur",
		debounce_time: 1000,
	};

	// Heights tuned to match the README's MDC ha-textfield look:
	// label small at top, value below, underline at bottom — without the
	// vertical airiness wa-input's default would otherwise give.
	static TEXT_FIELD_STYLES = {
		width: "100%",
		// Default to 100% so the editor fills its inner container (card.height
		// minus card.padding). Users can override with a fixed px value.
		height: INPUT_TAG === "ha-input" ? "100%" : "36px",
		heightNoLabel: INPUT_TAG === "ha-input" ? "100%" : "36px",
		marginLeft: "0px",
		marginRight: "0px",
		offsetLeftMargin: "8px",
		defaultTextLeftPadding: "6px",
		defaultTextBottomMargin: "-3px",
	};

	// Default card heights. Smaller when there's no label (single-row input).
	static DEFAULT_CARD_HEIGHT = INPUT_TAG === "ha-input" ? "56px" : CARD_HEIGHT;
	static DEFAULT_CARD_HEIGHT_NO_LABEL = INPUT_TAG === "ha-input" ? "44px" : CARD_HEIGHT;

	static DEFAULT_DEBOUNCE_TIME = 1000;

	_internalChange = false;
	_leadingContainer = null;
	_trailingContainer = null;
	_cardStylesApplied = false;

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

	setConfig(config) {
		this._config = {
			...SuperTextInput.DEFAULT_CONFIG,
			...config,
		};

		// Normalize underscored CSS-style keys to hyphens once, here, so
		// downstream reads can use the canonical form ("padding-left") without
		// each call site having to check `padding_left` as a fallback. We
		// only touch the three known style containers — top-level config
		// keys like `change_action`, `hide_label`, `update_mode`,
		// `compact_buttons`, etc. are NOT modified.
		if (this._config.style) {
			this._config.style = {
				...this._config.style,
				card: normalizeStyleKeys(this._config.style.card),
				editor: normalizeStyleKeys(this._config.style.editor),
			};
		}
		if (Array.isArray(this._config.buttons)) {
			this._config.buttons = this._config.buttons.map((b) => ({
				...b,
				style: normalizeStyleKeys(b.style),
			}));
		}

		if (config.entity) {
			this._entityType = config.entity.split(".")[0];
		}

		this._debounce_time = config.debounce_time || SuperTextInput.DEFAULT_DEBOUNCE_TIME;
		this._update_mode = config.update_mode || "blur";

		// Invalidate button container cache so they rebuild with new config
		this._leadingContainer = null;
		this._trailingContainer = null;
		this._cardStylesApplied = false;

		if (config.buttons) {
			this._buttonFactory = new ButtonFactory(config, this);
		}

		if (this._update_mode === "realtime") {
			this._debouncedUpdate = debounce((value) => {
				this.setValue(value);
			}, this._debounce_time);
		}
	}

	set hass(hass) {
		const oldValue = this.value;
		this._hass = hass;
		this.stateObj = hass.states[this._config.entity];

		if (this.stateObj) {
			this.value = this.stateObj.state;
			this.minlength = this.stateObj.attributes.min;
			this.maxlength = this.stateObj.attributes.max;
			this.pattern = this.stateObj.attributes.pattern;
			this.mode = this.stateObj.attributes.mode;

			this._config.name = this._config.name || computeStateName(this.stateObj, this._config.entity);
			this.label = this._config.label || this._config.name;

			if (!this._internalChange && oldValue !== this.value && this._config.change_action) {
				handleAction(this._config.change_action, this.value, this);
			}
			this._internalChange = false;
		}
	}

	/**
	 * Apply styles to the card container (called once in updated())
	 */
	_getCardStyles(card) {
		const cardStyle = this._config.style?.card || {};
		const defaultCardHeight = this._config.hide_label
			? SuperTextInput.DEFAULT_CARD_HEIGHT_NO_LABEL
			: SuperTextInput.DEFAULT_CARD_HEIGHT;

		// Default min-width: 0 on the host and ha-card so the card participates
		// correctly in CSS Grid `1fr` tracks (and any flex container with
		// shrinking siblings). Without this, the card's intrinsic min-content
		// width (~200px from wa-input internals) becomes a hidden floor that
		// refuses to shrink, pushing sibling buttons/cards off-screen on
		// narrow viewports. Users can override via style.card.min-width.
		this.style.minWidth = "0";
		card.style.minWidth = cardStyle["min-width"] || "0";

		// ha-card is now just a chrome container: bg + border + radius + outer
		// height. The inner flex layout (with padding around the children) lives
		// in a separate <div id="sti-inner"> child — see _getInnerStyles.
		card.style.display = "block";
		card.style.height = cardStyle.height || defaultCardHeight;
		card.style.padding = "0";
		card.style.boxSizing = "border-box";

		if (cardStyle.background) card.style.background = cardStyle.background;
		if (cardStyle["border-radius"]) card.style.borderRadius = cardStyle["border-radius"];
		if (cardStyle.border) card.style.border = cardStyle.border;

		// Optional width / max-width — applied to the host so they participate
		// correctly with the grid/flex layout the card sits in. Use width for
		// a fixed footprint, max-width to cap growth in `1fr` tracks.
		// The host element defaults to `display: inline` (Lit's default for
		// custom elements), which makes `width` a no-op — so we force
		// `display: block` whenever width or max-width is set.
		if (cardStyle.width || cardStyle["max-width"]) this.style.display = "block";
		if (cardStyle.width) this.style.width = cardStyle.width;
		if (cardStyle["max-width"]) this.style.maxWidth = cardStyle["max-width"];
	}

	/**
	 * The inner wrapper holds all the flex children (buttons + input). Card
	 * padding is applied here, NOT on ha-card — that way the buttons and editor
	 * are inset from the card edges instead of being smashed against them.
	 */
	_getInnerStyles(inner) {
		const cardStyle = this._config.style?.card || {};
		inner.style.display = "flex";
		inner.style.flexDirection = "row";
		inner.style.alignItems = "center";
		inner.style.height = "100%";
		inner.style.boxSizing = "border-box";
		inner.style.padding = cardStyle.padding || DEFAULT_PADDING;
		// Match the host min-width: 0 so the flex container itself can shrink
		// (without this, the flex container would honor children's min-content).
		inner.style.minWidth = "0";
	}

	/**
	 * Outer wrapper styles applied directly to the <ha-input> / <ha-textfield>
	 * element (width, margins, height).
	 */
	_applyOuterInputStyles(textField) {
		const style = this._config.style?.editor || {};
		const hasLeadingButtons = this._config.buttons?.some(
			(btn) => !btn.position || btn.position === "start"
		);
		const styles = { ...SuperTextInput.TEXT_FIELD_STYLES };
		if (hasLeadingButtons) styles.marginLeft = styles.offsetLeftMargin;
		// Keys are already hyphenated thanks to normalizeStyleKeys() in setConfig.
		const ml = style["margin-left"];
		const mr = style["margin-right"];
		const mt = style["margin-top"];
		const mb = style["margin-bottom"];
		if (ml !== undefined) styles.marginLeft = ml;
		if (mr !== undefined) styles.marginRight = mr;
		styles.height = style["height"] || styles.height;
		if (mt !== undefined) textField.style.marginTop = mt;
		if (mb !== undefined) textField.style.marginBottom = mb;

		textField.style.width = styles.width;
		textField.style.marginLeft = styles.marginLeft;
		textField.style.marginRight = styles.marginRight;
		// Constrain ha-input to the wa-input height so the visible blue area
		// matches the buttons. ha-input has a baked-in `padding-bottom: 8px`
		// that pushes the wrapper to 40px+; strip it.
		if (INPUT_TAG === "ha-input" && styles.height && styles.height !== "auto") {
			textField.style.setProperty("height", styles.height, "important");
			textField.style.setProperty("padding", "0", "important");
			textField.style.setProperty("box-sizing", "border-box", "important");
			textField.style.setProperty("display", "flex", "important");
			textField.style.setProperty("align-items", "stretch", "important");
		} else if (INPUT_TAG !== "ha-input" && styles.height && styles.height !== "auto") {
			textField.style.height = styles.height;
		}
	}

	/**
	 * Deep shadow-DOM styling.
	 *
	 * For HASS 2026.4+ (ha-input → wa-input):
	 *   Web Awesome's internal stylesheet uses !important AND its CSS custom
	 *   properties don't trigger live re-evaluation of the rules that consume
	 *   them. So we inject a CSSStyleSheet directly into wa-input's shadow
	 *   root with our overrides — adoptedStyleSheets wins the cascade.
	 *
	 * For legacy ha-textfield (HASS < 2026.4): probe .mdc-* selectors as before.
	 */
	async _applyDeepInputStyles() {
		if (!this._config) return;
		// Bump a per-instance version token. If a newer call starts while
		// we're awaiting updateComplete, the older call bails out cleanly
		// when it resumes instead of racing the newer one's writes to
		// adoptedStyleSheets / inline styles.
		const myVersion = (this._deepStyleVersion = (this._deepStyleVersion || 0) + 1);
		const isStale = () => myVersion !== this._deepStyleVersion;

		const textField = this.shadowRoot?.querySelector("#textinput");
		if (!textField) return;

		const style = this._config.style?.editor || {};
		const styles = { ...SuperTextInput.TEXT_FIELD_STYLES };
		const userHeight = style["height"];
		const defaultHeight = this._config.hide_label ? styles.heightNoLabel : styles.height;
		styles.height = userHeight || defaultHeight;

		// When the user sets line-gap or padding-bottom beyond the built-in
		// default, bump the wa-input height by the difference so the input
		// still has vertical space.
		const showsLabel = !this._config.hide_label && this.label;
		const userGap = parseFloat(style["line-gap"] || style["padding-bottom"] || 0);
		const builtinBottom = showsLabel ? 8 : 0;
		const heightBump = Math.max(0, userGap - builtinBottom);
		if (heightBump && !userHeight) {
			styles.height = `calc(${defaultHeight} + ${heightBump}px)`;
		}

		if (textField.updateComplete) await textField.updateComplete;
		if (isStale()) return;
		if (!textField.shadowRoot) return;

		// ─── Web Awesome path (HASS 2026.4+) ───
		// FORWARD-COMPAT: this assumes ha-input is a thin wrapper that renders
		// a single <wa-input> inside its shadow. If HA inlines or replaces
		// the wa-input element, this querySelector returns null and we fall
		// through to the legacy MDC path below — which also won't find its
		// elements, so styling silently no-ops (the card still works, just
		// with default wa-input styling).
		const waInput = textField.shadowRoot.querySelector("wa-input");
		if (waInput) {
			// Height: inline on the wa-input element (the only knob that works).
			waInput.style.height = styles.height;

			// All other overrides go through an injected stylesheet — that's the
			// only thing that reliably wins against wa-input's bundled CSS.
			if (waInput.updateComplete) await waInput.updateComplete;
			if (isStale()) return;
			this._injectWaStyles(waInput, style);
			return;
		}

		// ─── Legacy MDC path (HASS < 2026.4) ───
		const mdcTextField = textField.shadowRoot.querySelector(".mdc-text-field");
		if (mdcTextField) {
			mdcTextField.style.height = styles.height;
			if (style.background) mdcTextField.style.background = style.background;
			mdcTextField.style.paddingLeft =
				style["padding-left"] || styles.defaultTextLeftPadding;
		}
		const input = textField.shadowRoot.querySelector(".mdc-text-field__input");
		if (input) {
			input.style.alignSelf = "end";
			input.style.marginBottom =
				style["margin-bottom"] || styles.defaultTextBottomMargin;
		}
		const label = textField.shadowRoot.querySelector(".mdc-floating-label");
		if (label) {
			label.style.setProperty(
				"left",
				style["padding-left"] || styles.defaultTextLeftPadding,
				"important"
			);
		}
	}

	/**
	 * Build (or rebuild) and inject a CSSStyleSheet into wa-input's shadow root.
	 * This is the only reliable way to override wa-input's bundled CSS — its
	 * custom properties don't trigger live re-evaluation of the consuming rules.
	 */
	_injectWaStyles(waInput, style) {
		const padAll = style["padding"];
		// If only padding-left is set, mirror it onto padding-right too (legacy
		// behavior). If padding-right is explicitly set, use that.
		const padLeft = style["padding-left"];
		const padRight = style["padding-right"];
		const padTop = style["padding-top"];
		const padBottom = style["padding-bottom"];
		// Push the text up away from the underline drawn at [part=base]::after
		const lineGap = style["line-gap"];

		const bg = style.background;
		const labelColor = style["label-color"];
		const valueColor = style.color;
		const valueFontWeight = style["font-weight"];
		const valueFontSize = style["font-size"];
		const placeholderColor = style["placeholder-color"];
		const lineColor = style["line-color"]; // the ::after horizontal line
		const borderColor = style["border-color"];
		const borderRadius = style["border-radius"];
		const borderWidth = style["border-width"];

		// Optional label-tightening (was forced default; now opt-in via
		// style.editor.label-padding-top / label-padding-bottom / label-line-height).
		const labelPadTop = style["label-padding-top"];
		const labelPadBot = style["label-padding-bottom"];
		const labelPadLeft = style["label-padding-left"];
		const labelPadRight = style["label-padding-right"];
		const labelLineHeight = style["label-line-height"];
		const labelFontSize = style["label-font-size"];
		const labelFontWeight = style["label-font-weight"];

		// Force the label into a "small, floated" state so it sits compactly
		// at the top with breathing room — matching the README's old MDC look
		// rather than wa-input's natural taller stacked rendering.
		const showLabel = !this._config.hide_label && this.label;
		const rules = [];
		const labelProps = [];
		if (showLabel) {
			labelProps.push(`padding-top: ${labelPadTop || "4px"} !important`);
			labelProps.push(`padding-bottom: ${labelPadBot || "0"} !important`);
			labelProps.push(`padding-left: ${labelPadLeft || "8px"} !important`);
			labelProps.push(`font-size: ${labelFontSize || "10px"} !important`);
			labelProps.push(`line-height: ${labelLineHeight || "1.2"} !important`);
		} else {
			if (labelPadTop) labelProps.push(`padding-top: ${labelPadTop} !important`);
			if (labelPadBot) labelProps.push(`padding-bottom: ${labelPadBot} !important`);
			if (labelPadLeft) labelProps.push(`padding-left: ${labelPadLeft} !important`);
			if (labelFontSize) labelProps.push(`font-size: ${labelFontSize} !important`);
			if (labelLineHeight) labelProps.push(`line-height: ${labelLineHeight} !important`);
		}
		if (labelPadRight) labelProps.push(`padding-right: ${labelPadRight} !important`);
		if (labelFontWeight) labelProps.push(`font-weight: ${labelFontWeight} !important`);
		if (labelColor) labelProps.push(`color: ${labelColor} !important`);
		// FORWARD-COMPAT: `label.label` targets a CLASS inside wa-input's
		// shadow tree, not a documented `part`. Web Awesome could rename the
		// class in a DOM refactor — if that happens, all label styling
		// (padding / font / color) silently stops applying. The fix would
		// be `[part="label"]` if/when wa-input exposes it, or a new
		// internal class name.
		if (labelProps.length) rules.push(`label.label { ${labelProps.join("; ")}; }`);
		if (bg) rules.push(`[part="base"] { background: ${bg} !important; background-color: ${bg} !important; }`);

		// Padding controls on [part=base]: padding-left/right control where the
		// text starts/ends horizontally; padding-top/bottom control the vertical
		// gap inside the input box. line-gap is a convenience alias for
		// padding-bottom that's named for its visual effect.
		// Default padding when a label is visible:
		//   padding-top: 20px clears the floated label
		//   padding-bottom: 2px is the tiny gap above the underline
		//   padding-left: 8px positions the value text
		// padding-top must clear the floated label area when one is visible;
		// otherwise no top inset is needed. padding-bottom (gap to underline)
		// and padding-left (value horizontal position) stay constant — toggling
		// hide_label shouldn't shift the value text around.
		// vertical-align: center|top|bottom controls where the value text sits
		// inside the editor area. Defaults to bottom (the README-classic look,
		// aligned just above the underline). Useful in hide_label / slim cards
		// where the value should sit in the visual center of the pill.
		const valign = style["vertical-align"];
		const isCentered = valign === "center" || valign === "middle";
		const defaultPadTop = showLabel ? "20px" : null;
		// When centering, drop the default bottom inset so the symmetric
		// padding actually centers the text. Users can still override.
		const defaultPadBottom = isCentered ? "0" : "2px";
		const defaultPadLeft = "8px";
		const effPadTop = padTop || defaultPadTop;
		const effPadBottom = padBottom || lineGap || defaultPadBottom;
		const effPadLeft = padLeft || defaultPadLeft;

		const baseProps = [
			`box-sizing: border-box !important`,
			`height: 100% !important`,
		];
		if (padAll) baseProps.push(`padding: ${padAll} !important`);
		if (effPadLeft) baseProps.push(`padding-left: ${effPadLeft} !important`);
		if (padRight) baseProps.push(`padding-right: ${padRight} !important`);
		else if (padLeft) baseProps.push(`padding-right: ${padLeft} !important`);
		if (effPadTop) baseProps.push(`padding-top: ${effPadTop} !important`);
		if (effPadBottom) baseProps.push(`padding-bottom: ${effPadBottom} !important`);
		if (borderColor) baseProps.push(`border-color: ${borderColor} !important`);
		// Default border-radius: 4px on the editor area per simple-example.
		baseProps.push(`border-radius: ${borderRadius || "4px"} !important`);
		if (borderWidth) baseProps.push(`border-width: ${borderWidth} !important`);
		if (baseProps.length) rules.push(`[part="base"] { ${baseProps.join("; ")}; }`);

		// Strip wa-input's built-in padding on the input element, tighten its
		// line-height, and align it to the bottom of [part="base"]. With
		// these defaults, `padding-bottom: 0` on the base truly puts the
		// value text on the underline. vertical-align swaps the align-self
		// so the input sits at top / center / bottom of [part="base"].
		const alignSelf = isCentered
			? "center"
			: valign === "top" || valign === "start"
			? "flex-start"
			: "flex-end";
		const inputProps = [
			`padding-top: 0 !important`,
			`padding-bottom: 0 !important`,
			`line-height: 1.2 !important`,
			`align-self: ${alignSelf} !important`,
			`height: auto !important`,
		];
		if (valueColor) inputProps.push(`color: ${valueColor} !important`);
		if (valueFontWeight) inputProps.push(`font-weight: ${valueFontWeight} !important`);
		if (valueFontSize) inputProps.push(`font-size: ${valueFontSize} !important`);
		if (inputProps.length) rules.push(`[part="input"] { ${inputProps.join("; ")}; }`);
		if (placeholderColor) rules.push(
			`[part="input"]::placeholder { color: ${placeholderColor} !important; }`
		);
		// FORWARD-COMPAT: wa-input draws its bottom underline via the
		// `[part="base"]::after` pseudo-element. If wa-input switches to a
		// `border-bottom` or a real DOM node, the `line-color` style key
		// becomes a no-op (underline reverts to wa-input's default).
		if (lineColor) rules.push(
			`[part="base"]::after { background: ${lineColor} !important; background-color: ${lineColor} !important; }`
		);

		const cssText = rules.join("\n");
		try {
			let sheet = waInput._stiSheet;
			if (!sheet) {
				sheet = new CSSStyleSheet();
				waInput._stiSheet = sheet;
				waInput.shadowRoot.adoptedStyleSheets = [
					...waInput.shadowRoot.adoptedStyleSheets,
					sheet,
				];
			}
			sheet.replaceSync(cssText);
		} catch (e) {
			// CSSStyleSheet constructor unavailable in very old browsers — ignore.
		}
	}

	/**
	 * Build & cache button containers — only rebuilt when setConfig clears the cache.
	 * Keeping these as raw DOM nodes (not Lit templates) means re-renders won't
	 * tear them down, which keeps things snappy.
	 */
	_getButtonContainer(isEnd) {
		if (!this._config.buttons || !this._buttonFactory) return "";
		const cacheKey = isEnd ? "_trailingContainer" : "_leadingContainer";
		if (!this[cacheKey]) {
			this[cacheKey] = this._buttonFactory.createButtonContainer(isEnd, this._config.buttons);
		}
		return this[cacheKey];
	}

	/**
	 * Render with a real Lit template — Lit reconciles the input element
	 * across re-renders so focus and caret position are preserved while typing.
	 * This fixes:
	 *   - the "iPhone keyboard closes too quickly" report (#1)
	 *   - the "can't type a space" report (#2) caused by mid-render DOM replacement
	 */
	render() {
		if (!this._config) return html``;

		const leading = this._getButtonContainer(false);
		const trailing = this._getButtonContainer(true);
		const placeholder = this._config.placeholder || "";
		// When hide_label is set, the wa-input collapses to just the input row
		// (~36-40px tall). Useful for slim layouts that match the pre-2026.4 look.
		const labelText = this._config.hide_label ? "" : this.label;
		// compact_buttons: pierce ha-icon-button's shadow via ::part(base) to
		// strip the 48px Material Design touch target so buttons sit tight.
		// Opt-in — default behavior preserves accessibility on touch.
		const compactCss = this._config.compact_buttons
			? html`
					<style>
						ha-icon-button::part(base) {
							width: 100% !important;
							height: 100% !important;
							padding: 0 !important;
							min-width: 0 !important;
							min-height: 0 !important;
							box-sizing: border-box !important;
						}
					</style>
			  `
			: "";

		return INPUT_TAG === "ha-input"
			? html`
					${compactCss}
					<ha-card>
						<div id="sti-inner">
							${leading}
							<ha-input
								id="textinput"
								.label=${labelText}
								.value=${this.value || ""}
								.minlength=${this.minlength}
								.maxlength=${this.maxlength}
								.autoValidate=${!!this.pattern}
								.pattern=${this.pattern || ""}
								.type=${this.mode || "text"}
								placeholder=${placeholder}
								@change=${this.valueChanged}
								@input=${this.inputChanged}
							></ha-input>
							${trailing}
						</div>
					</ha-card>
			  `
			: html`
					${compactCss}
					<ha-card>
						<div id="sti-inner">
							${leading}
							<ha-textfield
								id="textinput"
								.label=${labelText}
								.value=${this.value || ""}
								.minlength=${this.minlength}
								.maxlength=${this.maxlength}
								.autoValidate=${!!this.pattern}
								.pattern=${this.pattern || ""}
								.type=${this.mode || "text"}
								placeholder=${placeholder}
								@change=${this.valueChanged}
								@input=${this.inputChanged}
							></ha-textfield>
							${trailing}
						</div>
					</ha-card>
			  `;
	}

	updated(changedProps) {
		if (super.updated) super.updated(changedProps);

		// Card styles only need to be applied once after first paint
		// (and re-applied if config changes — setConfig clears the flag).
		if (!this._cardStylesApplied) {
			const card = this.shadowRoot?.querySelector("ha-card");
			const inner = this.shadowRoot?.querySelector("#sti-inner");
			if (card && inner) {
				this._getCardStyles(card);
				this._getInnerStyles(inner);
				this._cardStylesApplied = true;
			}
		}

		// Outer-input + deep shadow-DOM styles only run when config (and
		// therefore style) changes. Skipping these on value-driven re-renders
		// avoids per-keystroke recompute in realtime mode.
		if (changedProps.has("_config")) {
			const textField = this.shadowRoot?.querySelector("#textinput");
			if (textField) this._applyOuterInputStyles(textField);
			this._applyDeepInputStyles();
		}
	}

	/**
	 * Push the new value to Home Assistant.
	 */
	setValue(value) {
		if (!this.stateObj) return;
		if (this.stateObj.state !== value) {
			this._internalChange = true;
			this._hass.callService(this._entityType, "set_value", {
				entity_id: this._config.entity,
				value: value,
			});
			if (this._config.change_action) {
				handleAction(this._config.change_action, value, this);
			}
		}
	}

	inputChanged(ev) {
		if (this._update_mode !== "realtime") return;
		const value = ev.target.value;
		if (value === "") {
			this.setValue(value);
		} else {
			this._debouncedUpdate(value);
		}
	}

	valueChanged(ev) {
		const value = this.shadowRoot.querySelector("#textinput").value;
		this.setValue(value);
	}
}

customElements.define("super-text-input", SuperTextInput);

window.customCards = window.customCards || [];
window.customCards.push({
	type: "super-text-input",
	name: "Super Text Input",
	description:
		"A text input card with enhanced features - real-time input, icons, buttons and actions",
	preview: "/local/community/super-text-input/preview.png",
	configurable: true,
	version: "0.3.28",
	customElement: true,
});
