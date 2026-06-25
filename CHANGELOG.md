# Changelog

All notable changes to this project. Versioning is loosely SemVer — minor bumps are
back-compatible additions, patch bumps are fixes, anything that shifts a default look
is called out in the README's [Breaking changes](README.md#-breaking-changes) section.

## v0.3.27

### Fixed
- **Button `tap_action` with `{{ value }}` now uses the live input value (issue [#5](https://github.com/skavan/super-text-input/issues/5)).** Previously the click handler read `this._element.value` — the Lit reactive property, which only updates after Home Assistant pushes the entity state back. With `update_mode: blur` (default), the button click triggers blur → service-call → HA round-trip, but the click handler runs before that round-trip completes, so `{{ value }}` substituted the **stale** previous value (or empty string on first use). The handler now reads from the live DOM `<input>` element instead, so whatever the user just typed comes through correctly.
- **`{{ value }}` substitution is also now safe for special characters.** The old path did `JSON.stringify(actionConfig).replace(...).JSON.parse(...)` — typing `"` or `\` would silently break the JSON roundtrip and the action would fire with garbage or not fire at all. The substitution now walks the action config object and only touches string leaves, so any character is preserved verbatim.

## v0.3.26

### Fixed
- **Compact button icons now center correctly inside `ha-button`.** The icon was sitting ~2–3 px below the button's visual center, most obvious on small bordered buttons (`border: 1.5px solid green` style rings). Root cause: `ha-button` ships a `:host { display: inline-block }` rule inside its own shadow, which kept the inner `<button>` at its natural top-aligned position regardless of external overrides. `_injectCompactButtonStyles` now injects `:host { display: inline-flex; align-items: center; justify-content: center }` *inside* `ha-button`'s shadow (the only way to beat the built-in `:host` rule), plus the same flex-center on the inner native `<button>`. Icon offset measured 0.00 px after the fix. No YAML changes required.

## v0.3.25

### Fixed
- **`style.card.width` and `style.card.max-width` actually take effect.** The host element defaults to `display: inline` (Lit's default), which makes `width` a no-op. We now force `display: block` whenever width or max-width is set.

## v0.3.24

### Added
- **`style.card.width` and `style.card.max-width`** — applied to the host element so they participate correctly with the grid/flex layout the card sits in. Use `width` for a fixed footprint, `max-width` to cap growth in `1fr` tracks. Defaults are unset so v0.3.23 shrink behaviour stays in place when neither is specified.

## v0.3.23

### Fixed
- **Card now shrinks correctly in CSS Grid `1fr` tracks.** Previously the card had an intrinsic ~200px min-content width (inherited from wa-input's internals) that became a hidden floor inside grids. With siblings (e.g. external buttons), a `1fr` track wouldn't shrink below the card's content, pushing siblings off-screen on narrow viewports. Default `min-width: 0` on the host + ha-card + inner wrapper now lets the card participate in any flex/grid layout. Users can override with `style.card.min-width` if they want a floor.

## v0.3.22

### Changed
- Update Mode dropdown now displays "On Blur" as the visible default when no `update_mode` is set in YAML (was blank). Matches the card's actual fallback behaviour.

## v0.3.21

### Added
- **Hide Label** and **Compact Buttons** are now first-class settings in the visual editor (was YAML-only). Both as toggles.

### Changed
- "Debounce Time (ms)" relabeled to "Update Frequency (ms)" — clearer what it does.

### Fixed
- **All text inputs in the editor** (Name / Label / Placeholder, plus the renamed Update Frequency field) rendered at zero height in HA 2026.4+ because `ha-textfield` was removed. Switched to `ha-input` with a fallback to `ha-textfield` on older HA.
- **Hide Label / Compact Buttons switches** use `ha-formfield` + `ha-switch`. `ha-selector-boolean` was the old wrapper and is also gone in 2026.4+.

## v0.3.20

### Fixed
- **Editor: Update Mode selection** — clicking an option in the dropdown was a no-op. The new `ha-select` fires a `selected` event (with `detail.value`) when a menu item is clicked, not `change`. `buildSelectField` now listens for both events.

## v0.3.19

### Fixed
- **Editor: Update Mode dropdown** was empty in HA 2026.4+. HA rewrote `ha-select` to take an `options` property (`[{value, label}]`) instead of slotted `<ha-list-item>` children. `buildSelectField` now passes both — new HA uses `.options`, older HA still uses the children.
- **Editor: Debounce Time field** now defaults to `1000` when realtime mode is selected on a fresh card (was blank).

## v0.3.18

### Fixed
- Regression from v0.3.17: the `isConnected` check in `_injectCompactButtonStyles` ran on synchronously-created buttons before they were attached to the DOM, so the inject bailed and the hover overlay reverted to a 50 % circle. Now only checks `isConnected` on retries (`depth > 0`).

## v0.3.17 — Code review pass

### Fixed
- `_injectCompactButtonStyles` no longer leaks `CSSStyleSheet` instances on each `setConfig`. The sheet is cached on the button host (`button._stiOuterSheet` / `button._stiInnerSheet`) and reused via `replaceSync`, mirroring the `waInput._stiSheet` pattern.
- `tryInject` retry chain now cancels in-flight timers and respects `isConnected` on retries, preventing orphaned chains from running on detached buttons after rapid `setConfig` calls.
- `_applyDeepInputStyles` uses a per-instance version token so two rapid config changes can't race each other's writes to `adoptedStyleSheets`.

### Changed
- Underscored YAML style keys (`padding_left`) are normalized to hyphens (`padding-left`) once at config-load time. Every downstream reader now sees one canonical form.
- `_applyOuterInputStyles` only runs when `_config` changes (was running on every keystroke in realtime mode).
- Added `FORWARD-COMPAT` comments at the three brittle wa-input touchpoints (`label.label`, `[part="base"]::after`, `ha-button::after`) so future maintainers know which selectors break first when HA bumps.

## v0.3.16

### Added
- Hover/ripple overlay now follows the button's `border-radius`. A button with `border-radius: 12 px` gets a rounded-rect hover instead of a circle. Implemented by overriding `ha-button::after` and `::before` in the inner shadow.

## v0.3.15

### Added
- `style.editor.vertical-align` (`top` / `center` / `bottom`, also accepts `middle`). Defaults to `bottom` (classic look, value text just above the underline). Useful for slim / `hide_label` cards where the value should sit in the middle of the pill.
- The button's `border-radius` now propagates into the inner `ha-button` shadow so the visible shape and the hover bounds are consistent in size (shape correction in v0.3.16 finished the job).

## v0.3.14

### Added
- Buttons under 48 px auto-trigger the inner-button shrink, so the hover overlay matches the visible button (was always 48 px before). `compact_buttons: true` continues to force this for all buttons regardless of size.

## v0.3.13

### Changed
- Editor `padding-left` and `padding-bottom` defaults are now independent of `hide_label`. Toggling `hide_label` no longer shifts the value text horizontally or away from the underline.

## v0.3.10 – v0.3.12 — HA 2026.4 compatibility

### Added
- Detect `ha-input` (HA 2026.4+) vs. `ha-textfield` (legacy) at module load and style each path appropriately.
- `compact_buttons` card-level flag for slim layouts.
- New style keys: `line-color`, `line-gap`, `label-color`, `label-font-size`, `label-font-weight`, `label-line-height`, `label-padding-{top,right,bottom,left}`, `placeholder-color`, `padding-{top,right,bottom,left}`, `border-color`, `border-width`.
- Built-in button templates: `clear`, `toast`, `more-info`.
- Inner `<div id="sti-inner">` wrapper so card padding can inset the buttons and editor properly instead of smashing them against the card edge.

### Fixed
- iPhone keyboard close in realtime mode (issue #1) — solved by rendering the input via a real Lit template so the DOM node is reconciled across re-renders.
- Space key not registering (issue #2) — same root cause as #1.
- Card layout collision when both leading and trailing buttons were present.
- Button `size` config is now honoured on HA 2026.4+ (the old code relied on `--mdc-icon-button-size`, which the new `ha-icon-button` ignores).

## v0.1

Initial release. Inspired by [gadgetchnnel/lovelace-text-input-row](https://github.com/gadgetchnnel/lovelace-text-input-row/) and [delphiki's base-editor.js](https://github.com/delphiki/lovelace-pronote/blob/742076718f49f4557aee77ebd36bc0dbdd3ad281/src/editors/base-editor.js).
