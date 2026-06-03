# Performance Review: `skavan/super-text-input`

This document summarizes potential client-side performance concerns found in the repository, based on review of:

- `/tmp/workspace/skavan/super-text-input/super-text-input.js`
- `/tmp/workspace/skavan/super-text-input/base-editor.js`
- `/tmp/workspace/skavan/super-text-input/editor.js`
- `/tmp/workspace/skavan/super-text-input/card-utils.js`

---

## 1) Frequent re-renders from `hass` setter object updates

**File:** `/tmp/workspace/skavan/super-text-input/super-text-input.js`  
**Lines:** 53-63, 163-183

`stateObj` is declared as a reactive Lit property (object type), then reassigned in every `set hass(hass)` call:

- Reactive declaration: lines 53-63
- Assignment: line 166

Because object properties are compared by reference, assigning a fresh object reference can trigger render work even when the displayed state did not materially change. In Home Assistant dashboards with frequent global state updates, this can cause avoidable render churn.

**Impact uncertainty:** depends on Home Assistant’s update frequency and whether `hass.states[this._config.entity]` returns stable or frequently replaced references.

---

## 2) YAML editors are recreated in render path (DOM churn + listener churn)

**Files:**  
- `/tmp/workspace/skavan/super-text-input/base-editor.js` (lines 50-84)  
- `/tmp/workspace/skavan/super-text-input/editor.js` (lines 96-127, especially 121-124)

`buildYamlEditor()` creates a real DOM node via `document.createElement("ha-yaml-editor")` and attaches an inline `value-changed` listener each time it is called (lines 51, 68-81). In `editor.js`, this method is called multiple times inside `render()` (lines 121-124).

Potential effects:

- Repeated construction/replacement of YAML editor DOM nodes during re-renders
- Repeated listener setup work
- Added GC pressure from short-lived DOM/listener closures

The existing `shouldUpdate` guard in `editor.js` (lines 38-44) suggests this was already observed as a practical issue.

**Impact uncertainty:** depends on editor re-render frequency and user interaction patterns in the card configuration UI.

---

## 3) Repeated `updateComplete.then(...)` setup in YAML editor builder

**File:** `/tmp/workspace/skavan/super-text-input/base-editor.js`  
**Lines:** 62-66

Within `buildYamlEditor()`, each call registers:

```js
this.updateComplete.then(() => { ... });
```

Since `buildYamlEditor()` is called from render, this can queue additional post-update callbacks repeatedly. While each callback is small, repeated scheduling can add microtask overhead and temporary retained closures.

**Impact uncertainty:** likely moderate to low, but increases with config panel activity and render frequency.

---

## 4) Polling retry chains with timers for compact button style injection

**File:** `/tmp/workspace/skavan/super-text-input/card-utils.js`  
**Lines:** 279-354 (notably 317 and 349)

`_injectCompactButtonStyles()` uses recursive `setTimeout` retries (50ms up to depth 20) while waiting for nested shadow roots. This creates timer chains per button when compact style injection is enabled (`compact_buttons` or size < 48; lines 270-274).

Potential effects:

- Additional timer activity during setup/update windows
- Work may continue for detached/stale button instances until retry limit

The code includes some cancellation logic (lines 302-305), which helps, but not all stale work is guaranteed to be eliminated if entirely new button instances are created.

**Impact uncertainty:** depends on button count and configuration update frequency.

---

## 5) High volume of sequential inline style writes per button

**File:** `/tmp/workspace/skavan/super-text-input/card-utils.js`  
**Lines:** 98-129 (especially 108-121)

`getButtonStyles()` performs many direct style mutations (`style.setProperty`) in sequence for each button. Batched style application is generally cheaper than repeated individual writes, especially when elements are connected and style/layout recalculation can be triggered.

Potential effects:

- Extra style recalculation work during button creation/update

**Impact uncertainty:** likely moderate in normal usage, more visible with many buttons or frequent reconfiguration.

---

## 6) Avoidable DOM query in `valueChanged`

**File:** `/tmp/workspace/skavan/super-text-input/super-text-input.js`  
**Lines:** 656-659

`valueChanged()` reads value by querying `#textinput` from shadow root (line 657), rather than reading directly from `ev.target.value`.

Potential effects:

- Minor avoidable DOM query overhead on every `change` event

**Impact uncertainty:** low; this event is usually much less frequent than per-keystroke input.

---

## 7) Expensive deep clone/string replace in action handling

**File:** `/tmp/workspace/skavan/super-text-input/card-utils.js`  
**Line:** 168

`handleAction()` does:

```js
JSON.parse(JSON.stringify(actionConfig).replace(...))
```

for each action invocation. That is full serialization + regex replace + parse, which can be expensive for larger nested configs.

Potential effects:

- CPU/GC overhead on each button action trigger

**Impact uncertainty:** low in typical usage (user-triggered clicks), but grows with action config size/complexity.

---

## 8) Recreated entity filter function each render

**File:** `/tmp/workspace/skavan/super-text-input/base-editor.js`  
**Lines:** 207-221 (notably 208)

`buildEntityPickerField()` creates a new `entityFilter` closure on each call:

```js
const entityFilter = contains ? (entity) => ... : null;
```

If parent renders often, passing a new function reference can force additional downstream work in `ha-entity-picker`.

Potential effects:

- Minor avoidable recomputation/churn in entity picker behavior

**Impact uncertainty:** low to moderate depending on how often config UI rerenders while picker is active.

---

## 9) In-place mutation of `_config` in `hass` setter

**File:** `/tmp/workspace/skavan/super-text-input/super-text-input.js`  
**Line:** 175

This line mutates `_config.name` directly:

```js
this._config.name = this._config.name || computeStateName(...)
```

In-place mutation can create subtle update behavior and repeated derived-name checks in a hot setter. It is less a direct CPU hotspot than a pattern that can contribute to unpredictable render/update flow.

**Impact uncertainty:** low direct cost, but potentially relevant for maintainability and avoiding unnecessary update logic in frequent setter paths.

---

## 10) Async deep style application on config changes

**File:** `/tmp/workspace/skavan/super-text-input/super-text-input.js`  
**Lines:** 272-507, invoked at 625

`_applyDeepInputStyles()` is async and touches nested shadow DOM. It is only run when `_config` changes (`updated()`, lines 622-626), which is good, and includes stale-call guards (lines 274-280, 302, 320). Still, rapid config changes can enqueue multiple async style passes before older ones are invalidated.

Potential effects:

- Burst-y async style work during fast config editing

**Impact uncertainty:** moderate for heavy config-edit sessions; likely negligible during normal card runtime.

---

## Relative Priority (Suggested)

### Higher priority
1. Reactive object update/render churn in `set hass(...)` (`super-text-input.js`)
2. YAML editor recreation + repeated listener setup in render path (`base-editor.js` + `editor.js`)

### Medium priority
3. Timer retry chains for compact style injection (`card-utils.js`)
4. Sequential style write volume in button styling (`card-utils.js`)

### Lower priority (quick wins / cleanup)
5. Avoidable querySelector in `valueChanged`
6. Deep clone strategy in `handleAction`
7. Recreated entity filter closure
8. In-place `_config` mutation in setter
9. Async deep-style bursts during rapid config edits

---

## Notes

- This review focuses on client-side performance patterns and likely hotspots from static code inspection.
- Actual user impact depends on runtime conditions: Home Assistant update frequency, number of buttons, config-editing behavior, and card count per dashboard.
- No code changes were made as part of this report.
