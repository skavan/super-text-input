// used base code from: https://github.com/delphiki/lovelace-pronote/blob/742076718f49f4557aee77ebd36bc0dbdd3ad281/src/editors/base-editor.js


const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

// HA 2026.4+ removed ha-textfield (the MDC wrapper) in favour of ha-input
// (the wa-input wrapper). Detect once at module load — the rest of the
// build* functions choose the right tag for the host HA version.
const HAS_HA_INPUT = !!customElements.get("ha-input");

class BaseCardEditor extends LitElement {
	static get properties() {
		return {
			_config: { type: Object },
		};
	}

	setConfig(config) {
		this._config = config;
		this.loadEntityPicker();
	}

	_valueChanged(ev) {
		const newConfig = {
			...this._config,
			[ev.target.configValue]: ev.detail?.value ?? ev.target.value,
		};

		this._config = newConfig;

		this.dispatchEvent(
			new CustomEvent("config-changed", {
				detail: { config: newConfig },
				bubbles: true,
				composed: true,
			})
		);
	}

	/**
	 * Creates a YAML editor instance with optimized update handling
	 * Key features:
	 * - Maintains editor state during updates
	 * - Properly propagates changes upward
	 * - Uses timestamp tracking to prevent render cycles
	 */

	buildYamlEditor(label, config_key, value, default_value) {
        const editor = document.createElement("ha-yaml-editor");
        editor.label = label;
        editor.name = config_key;
        editor.defaultValue = value || default_value;
        
        // Add hass object reference
        if (this.hass) {
            editor.hass = this.hass;
        }
    
        // Update hass when it becomes available
        this.updateComplete.then(() => {
            if (this.hass && !editor.hass) {
                editor.hass = this.hass;
            }
        });
    
        editor.addEventListener("value-changed", (ev) => {
            this._lastYamlUpdate = Date.now();
            const newConfig = {
                ...this._config,
                [config_key]: ev.detail.value,
            };
            this.dispatchEvent(
                new CustomEvent("config-changed", {
                    detail: { config: newConfig },
                    bubbles: true,
                    composed: true,
                })
            );
        });
        
        return editor;
    }
    
    
	buildSelectField(label, config_key, options, value, default_value) {
		// HA 2026.4+ rewrote ha-select: it now takes an `options` property
		// ([{value, label}, ...]) and ignores child <ha-list-item> nodes.
		// Pre-2026.4 ha-select did the opposite. Pass both — new HA uses
		// .options, old HA uses the slotted children.
		let selectOptions = [];
		for (let i = 0; i < options.length; i++) {
			let currentOption = options[i];
			selectOptions.push(html`<ha-list-item .value="${currentOption.value}">${currentOption.label}</ha-list-item>`);
		}

		// HA 2026.4+ ha-select fires `selected` (with detail.value) on item
		// click, not `change`. Old HA fired `change`. Listen for both — our
		// _valueChanged handler reads ev.detail?.value first, then falls back
		// to ev.target.value, so either event source produces the right
		// config update.
		return html`
			<ha-select
				label="${label}"
				.options=${options}
				.value=${value || default_value}
				.configValue=${config_key}
				@change=${this._valueChanged}
				@selected=${this._valueChanged}
				@closed=${(ev) => ev.stopPropagation()}
			>
				${selectOptions}
			</ha-select>
		`;
	}

	buildSwitchField(label, config_key, value, default_value) {
		if (typeof value !== "boolean") {
			value = default_value === true;
		}

		// ha-selector-boolean was removed in HA 2026.4+. ha-formfield is the
		// canonical wrapper for a labeled switch on both old and new HA.
		// ha-switch fires `@change` with the new state on `ev.target.checked`
		// — neither ev.detail nor ev.target.value carry it, so we can't reuse
		// the generic _valueChanged handler here.
		const onSwitch = (ev) => {
			const newConfig = { ...this._config, [config_key]: ev.target.checked };
			this._config = newConfig;
			this.dispatchEvent(
				new CustomEvent("config-changed", {
					detail: { config: newConfig },
					bubbles: true,
					composed: true,
				})
			);
		};

		return html`
			<ha-formfield label="${label}" class="sti-switch-row">
				<ha-switch
					name="${config_key}"
					.checked=${value}
					.configValue="${config_key}"
					@change=${onSwitch}
				></ha-switch>
			</ha-formfield>
		`;
	}

	buildNumberField(label, config_key, value, default_value, step) {
		// Use ha-input on HA 2026.4+; fall back to ha-textfield on older HA.
		if (HAS_HA_INPUT) {
			return html`
				<ha-input
					type="number"
					step="${step || 1}"
					.label=${label}
					.value=${value !== undefined && value !== null ? value : default_value}
					.configValue=${config_key}
					@value-changed=${this._valueChanged}
					@change=${this._valueChanged}
				></ha-input>
			`;
		}
		return html`
			<ha-textfield
				type="number"
				step="${step || 1}"
				label="${label}"
				.value=${value || default_value}
				.configValue=${config_key}
				@change=${this._valueChanged}
			>
			</ha-textfield>
		`;
	}

	buildTextField(label, config_key, value, default_value = "") {
		// Use ha-input on HA 2026.4+; ha-textfield is undefined there and
		// renders as an unknown element with zero height. Older HA still has
		// ha-textfield and uses the legacy branch.
		if (HAS_HA_INPUT) {
			return html`
				<ha-input
					.label=${label}
					.value=${value || default_value}
					.configValue=${config_key}
					@value-changed=${this._valueChanged}
					@change=${this._valueChanged}
				></ha-input>
			`;
		}
		return html`
			<ha-textfield
				label="${label}"
				.value=${value || default_value}
				.configValue=${config_key}
				@change=${this._valueChanged}
				@keyup=${this._valueChanged}
			>
			</ha-textfield>
		`;
	}

	buildEntityPickerField(label, config_key, value, domains, contains) {
		const entityFilter = contains ? (entity) => entity.entity_id.toLowerCase().includes(contains.toLowerCase()) : null;

		return html`
			<ha-entity-picker
				label="${label}"
				.hass=${this.hass}
				.value=${value || ""}
				.configValue=${config_key}
				.includeDomains=${domains}
				.entityFilter=${entityFilter}
				@value-changed=${this._valueChanged}
				allow-custom-entity
			></ha-entity-picker>
		`;
	}

	async loadEntityPicker() {
		if (window.customElements.get("ha-entity-picker")) {
			return;
		}

		const ch = await window.loadCardHelpers();
		const c = await ch.createCardElement({ type: "entities", entities: [] });
		await c.constructor.getConfigElement();
	}

	static get styles() {
		return css`
			ha-formfield.sti-switch-row {
				display: flex;
				justify-content: space-between;
				align-items: center;
				width: 100%;
				padding-top: 15px;
			}
			ha-select,
			ha-textfield,
			ha-input {
				clear: right;
				width: 100%;
				padding-top: 15px;
				display: block;
			}
		`;
	}
}

export default BaseCardEditor;
