/**
 * Super Text Input Editor Component
 * Provides a configuration interface for the Super Text Input card
 * 
 * Key features:
 * - Form-based configuration for basic settings
 * - YAML editors for complex configurations
 * - Optimized update cycle to prevent YAML editor state loss
 */

import BaseCardEditor from "./base-editor.js?v=0.3.22";

// Get LitElement base class from Home Assistant frontend
const LitElement = customElements.get("home-assistant-main")
    ? Object.getPrototypeOf(customElements.get("home-assistant-main"))
    : Object.getPrototypeOf(customElements.get("hui-view"));

const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class SuperTextInputEditor extends BaseCardEditor {
    /**
     * Define reactive properties
     * Note: We only track _config as other properties are handled by BaseCardEditor
     */
    static get properties() {
        return {
            _config: { type: Object }
        };
    }

    /**
     * Critical update cycle control
     * Prevents loss of YAML editor state by blocking rapid re-renders
     * Uses timestamp tracking to create a 100ms window where updates are blocked
     * after YAML changes while allowing other updates to proceed normally
     */
    shouldUpdate(changedProps) {
        if (changedProps.has('_config')) {
            const lastYamlUpdate = this._lastYamlUpdate || 0;
            return Date.now() - lastYamlUpdate > 100;
        }
        return true;
    }

    /**
     * Known configuration properties that receive special handling
     * Used to filter unknown props into the "other" YAML editor
     */
    static HANDLED_PROPS = new Set([
        "type", "name", "entity", "label", "placeholder",
        "update_mode", "debounce_time", "hide_label", "compact_buttons",
        "style", "buttons", "change_action",
    ]);

    /**
     * Available update mode options for the text input
     */
    static UPDATE_MODE_OPTIONS = [
        { value: "blur", label: "On Blur" },
        { value: "realtime", label: "Real-time" },
    ];



    /**
     * Filters configuration object for unknown properties
     * These properties are displayed in the "other" YAML editor
     */
    _getOtherProps() {
        return Object.entries(this._config)
            .filter(([key, value]) =>
                !SuperTextInputEditor.HANDLED_PROPS.has(key) &&
                value !== undefined &&
                typeof key === "string" &&
                isNaN(parseInt(key))
            )
            .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});
    }

    /**
     * Initialize the editor with configuration
     */
    setConfig(config) {
        this._config = config;
        this.loadEntityPicker();
    }

    /**
     * Render the configuration interface
     * Layout:
     * 1. Basic form fields for common settings
     * 2. Conditional fields based on update mode
     * 3. YAML editors for complex configurations
     */
    render() {
        if (!this._config) {
            return html``;
        }

        const otherProps = this._getOtherProps();

        return html`
            <div class="card-config">
                ${this.buildEntityPickerField("Entity (Required)", "entity", this._config.entity, ["input_text", "text"])}
                ${this.buildTextField("Name (Optional)", "name", this._config.name)}
                ${this.buildTextField("Label (Optional)", "label", this._config.label)}
                ${this.buildTextField("Placeholder (Optional)", "placeholder", this._config.placeholder)}
                ${this.buildSwitchField("Hide Label (slim mode)", "hide_label", this._config.hide_label, false)}
                ${this.buildSwitchField("Compact Buttons (tighter spacing)", "compact_buttons", this._config.compact_buttons, false)}
                ${this.buildSelectField(
                    "Update Mode",
                    "update_mode",
                    SuperTextInputEditor.UPDATE_MODE_OPTIONS,
                    this._config.update_mode,
                    "blur"
                )}
                ${this._config.update_mode === "realtime"
                    ? this.buildNumberField("Update Frequency (ms)", "debounce_time", this._config.debounce_time, 1000, 100)
                    : ""}
                ${this.buildYamlEditor("Styles (optional)", "style", this._config.style)}
                ${this.buildYamlEditor("Buttons/Icons (optional)", "buttons", this._config.buttons)}
                ${this.buildYamlEditor("Additional Text change action (optional)", "change_action", this._config.change_action)}
                ${this.buildYamlEditor("Other Configuration Props (danger!)", "other", otherProps)}
            </div>
        `;
    }
}

// Register the editor component
customElements.define("super-text-input-editor", SuperTextInputEditor);
