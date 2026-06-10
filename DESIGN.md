---
name: MasterSlides Admin
description: Clean-white admin console for the Tzu Chi internal Google Docs → presentation pipeline
colors:
  bg: "#ffffff"
  surface: "#ffffff"
  surface-inset: "#f8fafc"
  surface-rail: "#f8fafc"
  surface-hover: "#f1f5f9"
  stroke: "#e5e7eb"
  stroke-strong: "#cbd5e1"
  ink: "#0f172a"
  ink-2: "#334155"
  ink-muted: "#64748b"
  ink-dim: "#94a3b8"
  brand: "#2c6cb5"
  brand-deep: "#1f5598"
  brand-tint: "rgba(44, 108, 181, 0.08)"
  success: "#15803d"
  success-bg: "#dcfce7"
  success-border: "#86efac"
  warning: "#92400e"
  warning-bg: "#fef3c7"
  warning-border: "#fde68a"
  danger: "#dc2626"
  danger-deep: "#b91c1c"
  danger-bg: "#fee2e2"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', 'PingFang TC', 'Hiragino Sans CNS', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', 'PingFang TC', sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', 'PingFang TC', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.6px"
  mono:
    fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "normal"
rounded:
  pill: "999px"
  lg: "12px"
  md-plus: "10px"
  md: "8px"
  sm: "6px"
spacing:
  hairline: "4px"
  tight: "6px"
  xs: "8px"
  sm: "10px"
  md: "12px"
  base: "14px"
  lg: "16px"
  xl: "18px"
  2xl: "20px"
  3xl: "24px"
  4xl: "28px"
  5xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "{colors.brand-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    size: "34px"
  icon-button-hover:
    backgroundColor: "{colors.surface-hover}"
    textColor: "{colors.brand}"
    rounded: "{rounded.md}"
    size: "34px"
  table-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  modal-surface:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md-plus}"
    padding: "24px"
  input-field:
    backgroundColor: "{colors.surface-inset}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  toggle-track-off:
    backgroundColor: "{colors.stroke}"
    rounded: "{rounded.pill}"
    width: "36px"
    height: "20px"
  toggle-track-on:
    backgroundColor: "{colors.brand}"
    rounded: "{rounded.pill}"
    width: "36px"
    height: "20px"
---

# Design System: MasterSlides Admin

## 1. Overview

**Creative North Star: "The Quiet Roster"**

A clean-white roster you can read at a glance. Tzu Chi blue is the one
voice in the system — it lands on the primary action, the toggle's
on-state, the current page in the pager, the active nav link. Everything
else is a calibrated slate-grey ramp: near-white surfaces, hairline
dividers, body type that doesn't shout. Structure is made by spacing
and weight, not by colored panels or display fonts.

The system explicitly rejects every direction that has tempted the
project before: corporate-tech hero gradients, antique-government
portal scaffolding, overt Buddhist iconography, Notion/Linear-clone
whitespace-and-Inter monoculture (PRODUCT.md anti-references), and
the cream/wood baseline an earlier pass produced and the user rejected
as 「整體顏色很奇怪」. There is no display font; 標楷體 is forbidden in
admin chrome because it reads as ceremonial, not operational. The
single accent + slate ramp is what carries the 端莊 (dignified) /
克制 (restrained) / 人本 (humane) brand personality PRODUCT.md commits
to — the dignity lives in restraint, not in decoration.

**Light + dark modes.** Every colour ships as a CSS custom property
on `:root`. The default values are the light palette below. Dark mode
overrides the same tokens on `:root[data-theme="dark"]` and inside an
`@media (prefers-color-scheme: dark)` block that activates when the
user hasn't manually pinned a theme. The toggle is a `Material Symbols
Rounded` icon-button at the right edge of the topbar; it cycles
`system → light → dark → system` and persists in `localStorage`
(`admin_theme`). A FOUC guard inline-script in each admin `<head>`
applies the saved preference before stylesheets resolve.

**Key Characteristics:**
- Body surface is true white (`#ffffff`) in light, slate near-black
  (`#0b1220`) in dark. Surfaces sit on a four-step cool-slate ramp:
  `#ffffff / #0b1220` → `#f8fafc / #1f2937` → `#f1f5f9 / #1f2937` →
  `#e5e7eb / #1f2937`.
- One accent — **Tzu Chi Blue** (`#2c6cb5`) — appears on ≤5% of any
  screen: primary CTA, toggle-on, current-page pager button, active
  nav link, public-state text in the docs table.
- Tables are the dominant pattern. Row alignment is normative: every
  cell sits on one baseline. State is single-line text (公開 · 在 N
  個 playlist), never two-stacked badges.
- All text uses the OS sans stack — `-apple-system / SF Pro / Segoe UI
  / Roboto` with `Noto Sans TC` / `PingFang TC` for Traditional Chinese.
  Material Symbols Rounded is the only webfont, loaded for icon glyphs.
- Motion is `120ms ease` on background / colour / border — feedback
  only, no choreography. Reduced-motion override clamps to ~0.

## 2. Colors

A near-monochrome cool-slate surface ramp with one saturated brand
accent and standard semantic tones for success / warning / danger.
Every colour ships as both light and dark via CSS custom properties;
the brand hue stays the same (Tzu Chi Blue) but lightens in dark mode
(`#6e9cc4`) to keep WCAG AA contrast on the dark surface.

### Dark mode equivalents

| Token | Light | Dark |
|---|---|---|
| `bg` | `#ffffff` | `#0b1220` |
| `surface` | `#ffffff` | `#111827` |
| `surface-inset` | `#f8fafc` | `#0b1220` |
| `surface-hover` | `#f1f5f9` | `#1f2937` |
| `stroke` | `#e5e7eb` | `#1f2937` |
| `stroke-strong` | `#cbd5e1` | `#374151` |
| `ink` | `#0f172a` | `#f1f5f9` |
| `ink-2` | `#334155` | `#cbd5e1` |
| `ink-muted` | `#64748b` | `#94a3b8` |
| `ink-dim` | `#94a3b8` | `#64748b` |
| `brand` | `#2c6cb5` | `#6e9cc4` |
| `brand-deep` | `#1f5598` | `#93b8d8` |
| `success` | `#15803d` / `#dcfce7` | `#4ade80` / `#052e16` |
| `warning` | `#92400e` / `#fef3c7` | `#fbbf24` / `#422006` |
| `danger` | `#dc2626` / `#fee2e2` | `#f87171` / `#450a0a` |

### Primary
- **Tzu Chi Blue** (`#2c6cb5`): The system's only saturated colour.
  Primary CTA fill, toggle-on track, current-page pager fill, active
  nav link colour, public-state label, link hover, focus rings.
- **Tzu Chi Blue Deep** (`#1f5598`): Hover state for Tzu Chi Blue
  surfaces; never used standalone.
- **Tzu Chi Blue Tint** (`rgba(44, 108, 181, 0.08)`): Background for
  active nav, selected rows, just-added pulse origin.

### Neutral (the surface ramp)
- **Bg** (`#ffffff`): Body background. Table body. Modal body. The
  default surface.
- **Surface Inset** (`#f8fafc`): Input fields, kbd glyphs, modal field
  bgs, help-note callouts. Sits half a step below white to read as
  recessed.
- **Surface Rail** (`#f8fafc`): Table header row, panel-head bg in the
  playlist picker, picker panel-foot.
- **Surface Hover** (`#f1f5f9`): Row hover, nav-link hover.
- **Stroke** (`#e5e7eb`): 1px dividers, table borders, modal borders,
  panel borders.
- **Stroke Strong** (`#cbd5e1`): Icon-button rest border, kbd box-
  shadow underline, table state separator.

### Neutral (the ink ramp)
- **Ink** (`#0f172a`): Body text, primary headings, table titles. Slate
  near-black with a cool undertone — matches the surface ramp.
- **Ink Secondary** (`#334155`): Secondary text — button labels, nav
  hover.
- **Ink Muted** (`#64748b`): Helper text, table column labels, doc_id
  mono, navigation when inactive, draft-state label.
- **Ink Dim** (`#94a3b8`): Empty-state copy, panel meta, unused-state
  label, placeholder.

### Tertiary (semantic)
- **Success** (`#15803d` text / `#dcfce7` bg / `#86efac` border):
  Notify success toast tone.
- **Warning** (`#92400e` text / `#fef3c7` bg / `#fde68a` border): Notify
  caution toast, private-doc panel banner.
- **Danger** (`#dc2626`): Modal danger button bg, icon-btn danger hover
  border, error toast border.
- **Danger Deep** (`#b91c1c`): Hover state.
- **Danger Bg** (`#fee2e2`): Error toast bg, danger icon-btn hover bg.

### Named Rules

**The One Accent Rule.** Tzu Chi Blue is the only saturated colour on
any screen. If a fifth surface wants the accent treatment, find one of
the existing four to demote first. Semantic tones (success / warning
/ danger) are not accents — they're meaning-bearing context, used only
inside toasts and banners.

**The Four-Tier Surface Rule.** Every surface above the document floor
is exactly one of four tiers: Bg / Inset / Hover / Stroke-bordered. New
surfaces do not invent a fifth; they pick the tier that matches their
function and reuse the token.

**The No-Stripe Rule.** `border-left` and `border-right` greater than
1px as coloured accents on banners, cards, callouts, or list items are
forbidden. Use full 1px borders, background tints, leading icons, or
nothing. (Side stripes are an AI-slop tell and were stripped from
help-note and ds-first-run during this pass.)

## 3. Typography

**Display Font:** none. The admin has no display tier. Earlier passes
used 標楷體 for headings; that was reverted because 標楷體 reads as
ceremonial and out of place on an operational workbench.

**Body / Heading Font:** System UI stack — `-apple-system`,
`BlinkMacSystemFont`, `Segoe UI`, `Roboto`, then `Noto Sans TC`,
`PingFang TC`, `Hiragino Sans CNS`, falling back to `sans-serif`. One
family throughout; hierarchy is carried by weight + size + letter-
spacing, not by family.

**Mono Font:** `ui-monospace`, `SF Mono`, `Menlo`, then `monospace`.
Used only for `doc_id` cells, inline code-like values, and `<kbd>` keys
in the help modal.

**Character:** Quiet, professional, OS-native. The page renders with the
user's own system font — three real Chinese renderings (macOS PingFang,
Windows Microsoft JhengHei, iOS PingFang) instead of one webfont-shaped
average. No font request, no FOUT, no opinion that doesn't belong here.

### Hierarchy
- **Headline** (`600`, `24px`, line-height `1.3`, letter-spacing
  `-0.01em`): Page H2 (`<h2>文件</h2>`). One per page. Tightened
  letter-spacing distinguishes it from body without needing a different
  family.
- **Title** (`600`, `18px`, line-height `1.3`, letter-spacing
  `-0.005em`): Modal and `<h3>` headers, auth-card titles.
- **Body** (`400`, `14px`, line-height `1.5`): Default — table cells,
  panel copy, button labels.
- **Subtle** (`400`, `13px`, line-height `1.5`): Secondary table
  content, status text under the footer bar, modal description.
- **Label** (`600`, `12px`, `letter-spacing 0.6px`, uppercase, ink
  muted): Form-field labels, table column headers, panel-head titles
  in the picker, meta-row labels. The single uppercase tier.
- **Mono** (`400`, `12px`): `doc_id` slugs, `<kbd>` keys.

### Named Rules

**The One Family Rule.** Body and headings share the OS sans stack.
Hierarchy via weight (400 → 600), size (12 → 24px), and letter-spacing
(0 → ±0.01em). Adding a display family — 標楷體, serif, anything — is
forbidden in admin chrome.

**The One Uppercase Tier Rule.** Uppercase + letter-spacing appears at
exactly one size (the Label tier). It marks system-defined meta — form
labels, table column headers, panel-head eyebrows — not section
dividers and not button labels.

## 4. Elevation

Flat by default. Depth comes from the surface ramp + 1px hairline
borders. There are no `box-shadow` declarations on resting surfaces.
Modal dialogs darken the page behind them with a `rgba(0,0,0,0.6)`
backdrop, and toasts get a soft `0 6px 18px rgba(15, 23, 42, 0.12)` to
lift them off the canvas — that's the only shadow vocabulary.

### Named Rules

**The No-Shadow Rule (Resting State).** Surfaces are flat at rest.
`box-shadow` is reserved for ephemeral overlays (toasts) and the
sticky selection bar. New components inherit the No-Shadow default;
shadow exceptions need a written reason.

**The Backdrop-Over-Float Rule.** Modal dialogs sit on a
`rgba(0,0,0,0.6)` backdrop rather than floating on a drop shadow. The
backdrop IS the elevation cue.

## 5. Components

### Buttons
- **Shape:** 6px radius, transitioning to 8px for icon-buttons.
- **Primary:** Tzu Chi Blue fill, white ink, `9px 18px` padding, weight
  500. Hover: Tzu Chi Blue Deep. Pairs with a Material Symbols Rounded
  glyph at `18px` when the action takes a noun (`add` before `新增
  文件`).
- **Secondary:** Transparent fill, 1px stroke-strong border, ink-2 ink,
  `9px 16px` padding. Hover: surface-hover fill. Used for `取消` in
  modals and the footer-bar.
- **Icon-Button:** Transparent fill, 1px stroke-strong border, ink-2
  ink, `34px` square, `8px` radius. Hover surface flips to surface-
  hover; hover ink shifts to brand blue. Danger variant flips to
  danger-bg fill, danger border, danger ink on hover. Carries one
  Material Symbols glyph at `20px`.

### Top Bar / Nav
- **Container:** White bg, 1px stroke bottom border, `14px 28px`
  padding, flex with `28px` gap. No logo image; the brand mark is
  the H1 `簡報後台` at 16px / weight 600 / `-0.01em` letter-spacing.
- **Nav links:** Ink muted at `14px`, `7px 12px` padding, `6px`
  radius. Hover: ink primary + surface-hover bg. **Active: Tzu Chi
  Blue text on Tzu Chi Blue Tint bg** — the one accent moment on
  the chrome.

### Tables (the dominant pattern)
- **Container:** White bg, 1px stroke border, `8px` radius, `overflow:
  hidden` so the corner radius clips the top row.
- **Header:** Surface-rail bg (`#f8fafc`), ink-muted uppercase labels
  at the Label type tier, `12px 16px` padding, 1px stroke bottom border.
- **Row:** `14px 16px` cell padding, 1px stroke bottom border, vertical-
  align middle, body type tier. Last row's bottom border is removed by
  the container border.
- **Row hover:** Surface flips to surface-hover (`#f1f5f9`).
- **Title cell:** Ink primary, weight 500, `max-width: 360px`, clickable
  via a `.link` span. `.link:hover` flips ink to brand and underlines.
- **Status cell:** Single line of typography — no pills. The state word
  (`公開` Tzu Chi Blue / `草稿` ink-dim, both weight 600 at 13px), a
  hairline `·` separator (stroke-strong), then the playlist count as
  muted meta (`在 1 個 playlist` ink-muted, or `未使用` ink-dim italic).
  The whole cell shares a single baseline with title / date / actions.
- **Date cell:** Body type tier at `13px`, ink muted, `white-space:
  nowrap`.
- **Actions cell:** Right-aligned, `white-space: nowrap`, holds the
  icon-button row.

### Status Cell — signature pattern

Where the previous workflow stacked two pills in a `flex column`, this
system writes a single-line sentence:

```
公開 · 在 1 個 playlist
草稿 · 未使用
```

Implementation:
```html
<td class="col-state">
  <span class="state state--public">公開</span>
  <span class="state-sep">·</span>
  <span class="state-meta">在 1 個 playlist</span>
</td>
```

Why: row baselines stay aligned (cell heights stop drifting with badge
count), the cell reads as a sentence not as a UI metadata strip, and
the accent appears as ink colour — the one-accent rule scales without
hex-fill paint.

### Toggle
- **Track:** `36×20px`, pill radius. Off: stroke fill. On: Tzu Chi Blue.
- **Thumb:** `16×16px` white circle, `2px` inset, translates `16px`
  when checked. Transition `120ms ease`.
- **Inflight state:** `.is-toggling` dims to 0.6 opacity + disables
  pointer events during the PATCH.

### Toast (notify.js)
- **Stack:** Fixed top-right, `380px` max width, `10px` gap between
  toasts.
- **Surface:** Tone-tinted bg (success / caution / danger), 1px tone
  border, `10px` radius, `12px 16px` padding, `0 6px 18px
  rgba(15,23,42,0.12)` lift shadow.
- **Tones:** Success uses `#dcfce7 / #15803d / #86efac`. Caution uses
  `#fef3c7 / #92400e / #fde68a`. Danger uses `#fee2e2 / #b91c1c /
  #dc2626`. Error tone is sticky (no auto-dismiss) and supports a
  `重試` button.

### Modal
- **Backdrop:** `position: fixed; inset: 0`, `rgba(0,0,0,0.6)`, centred
  flex, z-index 100.
- **Surface:** White, 1px stroke border, `10px` radius, `24px` padding,
  `460px` max width (`640px` for help modal).
- **Header (`<h3>`):** Title tier — 18px / 600 / `-0.005em` letter-
  spacing / ink.
- **Field input:** Surface-inset bg, 1px stroke border, `6px` radius,
  `10px 12px` padding. Focus flips border + 2px outline to Tzu Chi
  Blue.

### Pager
- **Container:** Centred flex, `6px` gap, `18px` top margin.
- **Buttons:** White fill, 1px stroke border, `34px` square (or 34px
  tall + `10px` horizontal padding for numbered buttons), `8px`
  radius. Hover: surface-hover + stroke-strong border. Current: Tzu
  Chi Blue fill, white ink.
- **Summary:** Ink muted at `12px` (`第 X–Y 筆，共 N 筆`).

### Playlist Picker (signature component)
Two-panel grid (`1fr 1fr`, `20px` gap, `480px` min-height) for
composing playlists. Panel structure: white surface, 1px stroke border,
`10px` radius, three rows (head / body / foot). Panel head bg is
surface-rail; foot mirrors. Items: 12px x 16px padding, hover surface-
hover. Selected panel rows are draggable with `cursor: grab`; reorder
via HTML5 DnD with ↑↓ keyboard fallback. Newly added rows pulse with a
Tzu Chi Blue tint for 1500ms.

### Selection bar
Sticky-top white card (`12px 16px` padding, 1px stroke border, `8px`
radius, soft slate shadow). Shows `已選 N 份` + bulk action buttons
(public / draft / delete / clear).

## 6. Do's and Don'ts

### Do:
- **Do** use Tzu Chi Blue on ≤5% of any screen — primary CTA, toggle
  on, current-page pager button, active nav link, public-state label.
  The One Accent Rule is normative.
- **Do** use the four-tier surface ramp (Bg / Inset / Hover / Stroke).
  The Four-Tier Surface Rule is normative.
- **Do** carry table column headers, panel-head labels in the picker,
  and form-field labels in the Label tier (12px / 600 / `0.6px` /
  uppercase / ink-muted). The One Uppercase Tier Rule is normative.
- **Do** render row state as one line of typography — `公開 · 在 N 個
  playlist`. Single baseline, no pills.
- **Do** lead destructive actions with a confirm-modal that names the
  collateral effect (e.g. `會同步從所有 Playlist 移除`).
- **Do** classify HTTP errors into Chinese-readable categories before
  showing them. `HTTP 500` is engineering noise, not user copy.
- **Do** keep the OS sans stack throughout. Body and headings share one
  family — hierarchy via weight + size + letter-spacing.

### Don't:
- **Don't** use 標楷體 / DFKai-SB / any ceremonial display font in
  admin chrome. 標楷體 reads as ceremonial and confuses the operational
  register. (This system explicitly reverted the earlier pass that put
  楷體 on headings.)
- **Don't** ship cream / sand / paper / wood / earth-tone palettes in
  admin. The user's feedback `「整體顏色很奇怪」` named that
  experiment dead. Body bg is white; surfaces are cool slate.
- **Don't** ship corporate-tech hero gradients, scroll-driven
  choreography, or hero-metric tiles. (PRODUCT.md anti-reference:
  `corporate-tech 藍黃漸層、炸開的網狀背景`.)
- **Don't** add antique-government-portal scaffolding — heart icons,
  3D bevels, neon list rows, Comic Sans / 微軟正黑體 粗體 headings.
- **Don't** drop Buddhist iconography into admin chrome — lotus
  watermarks, Buddha silhouettes, sutra-script fonts, gold/purple
  ceremonial palettes.
- **Don't** clone the Notion / Linear all-white-and-Inter look. The
  admin must read as Tzu Chi's tool. Tzu Chi Blue on active nav, on
  the public-state label, and on the primary CTA is what distinguishes
  this from a generic SaaS template.
- **Don't** use `border-left` or `border-right` greater than 1px as a
  coloured stripe on banners, callouts, list items, or cards. The
  No-Stripe Rule is normative. (Two violations were stripped from
  `help-note` and `ds-first-run` in this pass — don't reintroduce
  them.)
- **Don't** stack two badges in a status cell. State is one line of
  typography. If a third meta needs to surface, demote one of the
  existing two to a row-hover tooltip.
- **Don't** introduce a fifth surface tier. Pick Bg, Inset, Hover, or
  Stroke-bordered. A fifth shade reads as drift, not depth.
- **Don't** introduce gradient text (`background-clip: text`), gradient
  fills, or glass / blur cards. Flat surfaces only.
- **Don't** float modals on `box-shadow`. The backdrop overlay is the
  elevation cue. (Backdrop-Over-Float Rule.)
- **Don't** add a second uppercase tier (section dividers, eyebrow
  kickers, numbered scaffolds `01 / 02 / 03`). Uppercase lives at the
  Label tier or nowhere.
- **Don't** show raw HTTP codes to users. Classify into network /
  permission / not-found / server / unknown buckets via notify.js's
  `classifyHttpError`. Engineering colleagues read the original status
  via `console.error` or DevTools.
- **Don't** use `outline: none` on inputs or buttons without replacing
  with a visible focus indicator. WCAG 2.1 SC 2.4.7 is normative.
