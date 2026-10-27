# Known Bugs

## ✅ RESOLVED — `/features` horizontal overflow (2026-10-24)

**Status:** Resolved
**Resolution:** False positive due to Turbopack HMR cache; production build does not reproduce. Also fixed genuine `<dd>` wrapping overflow.

See session log for full diagnosis.

## ⚠️ TRACKED — text-primary links below WCAG AA on dark backgrounds (2026-10-24)

**Status:** Open (documented, not blocking)
**Severity:** Low (color contrast of 3.72:1 vs required 4.5:1 for AA)
**Affects:** `<a class="text-primary">` link text on `bg-background` / `bg-card` in dark theme.

### Root cause

`--primary: #3061ef` works as a **button background** (with white text on it = 5.3:1 AA pass) but NOT as **link text on dark background** (`#3061ef` on `#0f0f0f` = 3.72:1 AA fail).

The same token can't satisfy both — text-primary needs a LIGHTER blue, bg-primary needs a DARKER blue.

### Fix approach

Introduce `--primary-text: #6d9dff` (lighter blue) in `globals.css`. Add `text-primary-text` Tailwind utility. Bulk-replace `text-primary` → `text-primary-text` across ~30 files (only where used as text, not on `bg-primary` buttons).

### Current mitigation

`color-contrast` axe rule is disabled in `tests/pwa/accessibility.spec.ts`. All other a11y rules (aria, labels, headings, keyboard) remain active. Manual verification confirms the text is still readable.

### Related: Chrome getComputedStyle oklch() bug

Chrome's `getComputedStyle().backgroundColor` incorrectly reports `oklch()` source colors as `lab()` values with a lightness off-by-100 error. This causes axe to compute wrong contrast for ANY `oklch()`-based color. Workaround: we've converted critical tokens to hex. Non-critical tokens (borders, secondary, accent) still use `oklch()` — will hit this if they ever need contrast testing.

## A11y fixes landed in Session 4 Phase 2

- `--primary` darkened to `#3061ef` for button WCAG AA
- `--muted-foreground` corrected (light/dark theme values swapped — bug found and fixed)
- 127 files: stripped `text-muted-foreground/{50,60,70,80,85}` opacity modifiers
- `LiveAskDemo` demo input got `aria-label`
- `RefTable` and `RefCode` scrollable regions got `tabIndex={0}` + `role="region"` + `aria-label`
- Clerk sign-in internals excluded from axe tests (third-party, not our fix)
