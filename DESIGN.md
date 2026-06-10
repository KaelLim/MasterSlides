---
name: MasterSlides Admin
description: Internal admin console for the Tzu Chi Google Docs → presentation pipeline (current baseline; pre-rebrand snapshot)
colors:
  console-base: "#f6f1e6"
  console-deep: "#ece5d4"
  console-rail: "#e1d8c3"
  console-surface: "#fbf8f0"
  console-surface-hover: "#eee5d0"
  console-stroke: "#d2c6ab"
  console-stroke-strong: "#b8a785"
  ink-primary: "#312922"
  ink-secondary: "#4d4339"
  ink-muted: "#6b5e50"
  ink-dim: "#8a7e6f"
  process-blue: "#2c6cb5"
  process-blue-deep: "#1f5598"
  hint-cyan: "#2a87a8"
  danger-red: "#c54a35"
  danger-red-deep: "#9a3324"
  danger-red-bed: "#f5dbcf"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', 'PingFang TC', 'Hiragino Sans CNS', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  headline:
    fontFamily: "'MOEStandardKaiti', 'DFKai-SB', 'BiauKai', '標楷體', 'Kaiti TC', '楷體-繁', 'STKaiti', serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.5px"
  title:
    fontFamily: "'MOEStandardKaiti', 'DFKai-SB', 'BiauKai', '標楷體', 'Kaiti TC', '楷體-繁', 'STKaiti', serif"
    fontSize: "18px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "normal"
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
    backgroundColor: "{colors.process-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "{colors.process-blue-deep}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "9px 16px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    size: "34px"
  icon-button-hover:
    backgroundColor: "{colors.console-stroke}"
    textColor: "{colors.hint-cyan}"
    rounded: "{rounded.md}"
    size: "34px"
  icon-button-danger-hover:
    backgroundColor: "{colors.danger-red-bed}"
    textColor: "{colors.danger-red-deep}"
    rounded: "{rounded.md}"
    size: "34px"
  table-surface:
    backgroundColor: "{colors.console-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
  modal-surface:
    backgroundColor: "{colors.console-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md-plus}"
    padding: "24px"
  input-field:
    backgroundColor: "{colors.console-deep}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.sm}"
    padding: "10px 12px"
  toggle-track-off:
    backgroundColor: "{colors.console-stroke}"
    rounded: "{rounded.pill}"
    width: "36px"
    height: "20px"
  toggle-track-on:
    backgroundColor: "{colors.process-blue}"
    rounded: "{rounded.pill}"
    width: "36px"
    height: "20px"
---

# Design System: MasterSlides Admin

> **Pre-rebrand baseline.** This file documents the current state of the admin
> surface (the `dark-slate engineering placeholder` PRODUCT.md calls
> transitional). It exists so the next pass — Tzu Chi blue + cream + 標楷體 —
> has an honest "before" snapshot to diff against. Do not treat any colour or
> rule here as the brand. The brand commitments live in PRODUCT.md.

## 1. Overview

**Creative North Star: "The Maintenance Console"**

This is the work surface a developer reaches for when the admin needs another
button — not a brand artefact. The whole system reads as "engineer sitting at
a dark navy console after hours, adding what's needed and shipping it". It is
not posed, not aestheticised, not aspirational. Density is moderate, palette
is monochromatic with a single utility accent, and typography defaults to the
operating-system stack so a fresh install on any laptop still reads correctly.

What it explicitly rejects: corporate-tech hero gradients (PRODUCT.md
anti-reference), Notion/Linear-clone whitespace-and-Inter monoculture
(PRODUCT.md anti-reference), and any decorative element that postpones the
underlying task. There is no character font, no display headline scale, no
floating particles, no scroll-driven choreography. The page is the table.

A planned successor system — the Tzu Chi blue / cream / 標楷體 identity in
PRODUCT.md — will replace this one. Until then, this baseline ships because
it is legible, accessible, and honest about its own provenance.

**Key Characteristics:**
- Single-tenant dark surface (`#f6f1e6` console base) with a four-step tonal
  ramp climbing toward `#b8a785` strokes.
- One accent (`Process Blue #2c6cb5`) carries every primary action and the
  on-state of toggles. Used on ≤5% of any given screen.
- Tables are the dominant pattern; cards exist only inside the playlist
  picker, where two-column comparison demands them.
- System font stack with Noto Sans TC fallback for Traditional Chinese; no
  webfont request for body or headings. Material Symbols Rounded is the only
  third-party font, loaded for icon glyphs.
- Motion is `120ms ease` on background / colour / border — feedback only, no
  choreography.

## 2. Colors

A monochromatic dark-slate surface ramp paired with one saturated utility
accent and a strict danger red.

### Primary
- **Process Blue** (`#2c6cb5`): Primary action surface — `Save`, `Add new doc`,
  toggle-on state, the active page in the pager. Borrowed from Tailwind's
  `blue-600`; honest about its origin.
- **Process Blue Deep** (`#1f5598`): Hover state for Process Blue surfaces;
  never used standalone.

### Secondary
- **Hint Cyan** (`#2a87a8`): Link hover and icon-button hover ink. Reserved
  for "this is interactive" affordance feedback; never a fill.

### Neutral (the surface ramp)
- **Console Base** (`#f6f1e6`): Document background. The far floor of the
  ramp.
- **Console Deep** (`#ece5d4`): Inset surfaces — input fields, modals'
  embedded fields. Sits half a step below the surface to read as recessed.
- **Console Rail** (`#e1d8c3`): Table headers, panel headers in the playlist
  picker. The "structural" tier — content above it should feel like the
  active surface.
- **Console Surface** (`#fbf8f0`): The default raised surface — top bar,
  table body, modal body, panel body.
- **Console Surface Hover** (`#eee5d0`): Row hover; one notch warmer than
  Surface to read without being loud.
- **Console Stroke** (`#d2c6ab`): 1px dividers, button borders, table
  borders, toggle off-track.
- **Console Stroke Strong** (`#b8a785`): Icon-button border at rest; the
  outer edge of the system.

### Neutral (the ink ramp)
- **Ink Primary** (`#312922`): Body text, table titles, modal headers.
  Roughly 92% lightness — softened off-white that doesn't glare on the dark
  surface ramp.
- **Ink Secondary** (`#4d4339`): Secondary text — secondary button labels,
  table sub-content.
- **Ink Muted** (`#6b5e50`): Helper text, table column labels, doc_id
  monospace, navigation when inactive.
- **Ink Dim** (`#8a7e6f`): Empty-state copy, panel meta lines, the muted
  edges of the system.

### Tertiary (danger)
- **Danger Red** (`#c54a35`): Inline warning copy in playlist picker
  (`已設為私有，請改回公開或移除`), modal error states.
- **Danger Red Deep** (`#9a3324`): Danger icon-button hover border.
- **Danger Red Bed** (`#f5dbcf`): Danger icon-button hover surface.

### Named Rules

**The One Accent Rule.** Process Blue is the only saturated colour on any
screen. The pager's current page, the primary CTA, and the toggle-on state
are the three places it appears. If a fourth would land on the page, find
something to remove first.

**The Four-Tier Surface Rule.** Every surface above the document floor is
exactly one of four tiers: Base / Rail / Surface / Surface-hover. New
surfaces do not invent a fifth; they pick the tier that matches their
function and reuse the token.

## 3. Typography

**Display Font:** 標楷體 stack — `MOEStandardKaiti`, `DFKai-SB`, `BiauKai`,
`標楷體`, `Kaiti TC`, `楷體-繁`, `STKaiti`, falling back to `serif`. Mirrored
from the viewer (`public/slides/css/base.css`) so the admin carries the same
Tzu Chi voice on its section markers.
**Body Font:** System UI stack — `-apple-system`, `BlinkMacSystemFont`,
`Segoe UI`, `Roboto`, then `Noto Sans TC`, `PingFang TC`, `Hiragino Sans CNS`,
falling back to `sans-serif`.
**Label/Mono Font:** `ui-monospace`, `SF Mono`, `Menlo`, then `monospace`.
Used only for `doc_id` cells and inline code-like values.

**Character:** A deliberate display-tier addition — 標楷體 lands on H1 / H2 / H3
to carry the single Tzu Chi voice on section markers; body and meta stay
OS-native so Chinese body text renders with the OS's own engine. On macOS
that's `PingFang TC`, on Windows `Microsoft JhengHei`, on iOS/iPadOS
`PingFang TC` — three real body renderings paired with one shared display
voice, instead of one Inter-shaped fake one.

### Hierarchy
- **Headline** (`600`, `22px`, line-height `1.3`, letter-spacing `0.5px`):
  Page H2 (`<h2>文件</h2>`). One per page.
- **Title** (`600`, `18px`, line-height `1.3`): Modal and `<h3>` headers.
- **Body** (`400`, `14px`, line-height `1.5`): Default — table cells, panel
  copy, button labels.
- **Subtle** (`400`, `13px`, line-height `1.5`): Secondary table content,
  status text under the footer bar, modal description.
- **Label** (`600`, `12px`, `letter-spacing 0.6px`, uppercase, `color: ink-muted`):
  Form-field labels, panel header eyebrows (`可選文件`, `已加入（順序）`),
  empty-state secondary copy. The single uppercase tier of the system.
- **Mono** (`400`, `12px`): `doc_id` slugs, monospace meta.

### Named Rules

**The One Uppercase Tier Rule.** Uppercase + letter-spacing appears at
exactly one size (the Label tier). It marks system-defined meta — labels,
panel-head eyebrows — not section dividers and not button labels. If a
second uppercase tier wants in, it joins the Label tier or doesn't ship.

**The OS-Native Type Rule.** Body text uses the operating system's own
default sans-serif and the operating system's own Chinese rendering. The
admin reads with the user's own system on the tiers that matter for
legibility. Exception: the display tier (headline, title) opts into 標楷體
to carry the Tzu Chi voice on section markers. Body, subtle, label, mono
remain OS-native.

## 4. Elevation

Flat by default. Depth is conveyed entirely through the four-tier surface
ramp (Base → Rail → Surface → Surface-hover); there are no `box-shadow`
declarations anywhere in the admin CSS, and the modal does not float on a
drop shadow — it sits on a `rgba(0,0,0,0.6)` backdrop that darkens the
underlying surface instead.

### Named Rules

**The No-Shadow Rule.** Depth comes from the surface ramp and the backdrop
overlay. `box-shadow` is forbidden in admin CSS. If a surface needs to
"lift," promote it to the next tier of the ramp — don't paint a shadow.

**The Backdrop-Over-Float Rule.** Modal dialogs darken the page behind them
(`rgba(0,0,0,0.6)`) rather than floating on a shadow. The backdrop is the
elevation cue.

## 5. Components

### Buttons
- **Shape:** All buttons are gently rounded (`6px` radius).
- **Primary:** Process Blue fill, white ink, `9px 18px` padding, weight 500.
  Hover: Process Blue Deep. Primary buttons appear in two places — section
  headers (`新增文件`, `新增 Playlist`) and the modal action bar (`匯入`,
  `儲存`). Pair with a Material Symbols Rounded icon at `18px` when the
  action takes a noun (`add` before `新增文件`).
- **Secondary:** Transparent fill, 1px Console Stroke Strong border, Ink
  Secondary ink, `9px 16px` padding. Hover: Console Stroke fill. Used for
  `取消` in modals and forms.
- **Icon-Button:** Transparent fill with 1px Console Stroke Strong border,
  Ink Secondary ink, `34px` square, `8px` radius. Hover surface is Console
  Stroke; hover ink shifts to Hint Cyan. Danger variant flips to Danger Red
  Bed background, Danger Red Deep border, white ink on hover. Icon-buttons
  carry one Material Symbols Rounded glyph at `20px`; the button width is
  not negotiable across the row.

### Tables (the dominant pattern)
- **Container:** Console Surface background, 1px Console Stroke border, `8px`
  radius, `overflow: hidden` so the corner radius clips the top row.
- **Header:** Console Rail background, Ink Muted uppercase labels at the
  Label type tier (`12px`, weight 600, letter-spacing `0.6px`), `12px 16px`
  padding, 1px Console Stroke bottom border.
- **Row:** `14px 16px` cell padding, 1px Console Stroke bottom border,
  vertical-align middle, body type tier. Last row's bottom border is
  removed by the container border.
- **Row hover:** Surface flips to Console Surface Hover (`#eee5d0`).
- **Title cell:** Ink Primary ink, weight 500, `max-width: 360px`, clickable
  via a `.link` span. `.link:hover` flips ink to Hint Cyan and underlines.
- **Doc-ID cell:** Mono type tier, Ink Muted, truncated at 16 chars + `…`.
- **Date cell:** Body type tier at `13px`, Ink Muted, `white-space: nowrap`.
- **Actions cell:** Right-aligned, `white-space: nowrap`, holds the
  icon-button row.

### Toggle (the public-state switch)
- **Track:** `36×20px`, fully pilled (`999px` radius). Off: Console Stroke
  fill. On: Process Blue fill.
- **Thumb:** `16×16px` white circle, `2px` inset, translates `16px` on the
  X-axis when checked.
- **Transition:** `background 120ms ease` on track, `transform 120ms ease`
  on thumb.

### Modal
- **Backdrop:** `position: fixed; inset: 0`, `rgba(0,0,0,0.6)`, centred
  flex layout, `z-index: 100`.
- **Surface:** Console Surface background, 1px Console Stroke border,
  `10px` radius, `24px` internal padding, `460px` max width.
- **Header (`<h3>`):** Title type tier, `0 0 8px` margin.
- **Description:** Subtle type tier, Ink Muted, `0 0 18px` bottom margin.
- **Field label:** Label type tier, `12px 0 6px` margin block, Ink Muted.
- **Field input:** Console Deep background, 1px Console Stroke border,
  `6px` radius, `10px 12px` padding, Ink Primary text. Focus border flips
  to Process Blue (`#2c6cb5`), no glow.
- **Action bar:** Right-aligned flex with `8px` gap, `22px` top margin.

### Pager
- **Container:** Centred flex with `6px` gap, `18px` top margin from the
  table.
- **Buttons:** Console Surface fill, 1px Console Stroke border, `34px`
  square (or `34px` tall with `10px` horizontal padding for the numbered
  buttons), `8px` radius, body type at `13px`. Hover: Console Stroke fill
  with Console Stroke Strong border. Disabled: 35% opacity, `not-allowed`
  cursor.
- **Current page:** Process Blue fill, white ink, Process Blue border. The
  one accent moment in the strip.
- **Ellipsis (`…`):** Ink Dim, no surface.
- **Summary line:** Ink Muted at `12px`, `12px` right margin. Reads
  `第 X–Y 筆，共 N 筆` so the user always sees both the slice and the total.

### Playlist Picker (signature component)
A two-panel grid (`1fr 1fr`, `20px` gap, `480px` minimum height) used to
compose a playlist by moving docs from `可選文件` to `已加入（順序）`. The
panels share a structure:
- **Panel container:** Console Surface fill, 1px Console Stroke border,
  `10px` radius, `display: flex; flex-direction: column; overflow: hidden`.
- **Panel head:** Console Rail background, 1px Console Stroke bottom
  border, `14px 18px` padding, holds (a) a Label-tier title with a Hint Cyan
  Material Symbols icon at `18px`, and (b) either a search-filter input
  (left panel) or a "N 份" count pill (right panel).
- **Filter input:** Console Deep fill, 1px Console Stroke border, `6px`
  radius, `8px 10px 8px 34px` padding so the inline `search` icon at `10px`
  from the left has room. Focus shifts the border to Process Blue.
- **Count pill:** Console Stroke fill, Ink Secondary text, `3px 10px`
  padding, `10px` radius. Hidden when the right panel is empty.
- **Panel body:** Scrollable, `4px 0` padding.
- **Item row:** `12px 16px` padding, `12px` gap between elements, 1px
  Console Stroke bottom border. Row hover surface: Console Surface Hover.
- **Item title:** Body tier, truncated with ellipsis; below it sits a
  doc-meta row at `11px`, Ink Dim, showing the truncated `doc_id` and
  `created_at` separated by a bullet.
- **Index badge (selected panel only):** `26×26px` Process Blue disc, `13px`
  radius, white `12px` weight-600 numeral. The badge is the system's only
  use of Process Blue as a fill outside primary buttons and toggles.
- **Item actions:** `30×30px` icon buttons, `6px` radius. Add-button uses
  the Primary variant (Process Blue fill); reorder buttons (`↑`, `↓`) use
  the default icon-button variant; remove button uses the danger variant.
- **Panel foot:** Console Rail background, 1px Console Stroke top border,
  `10px 12px` padding, holds the pager for the available panel.
- **Empty state:** Centred Ink Dim copy, prefaced by a `32px` Material
  Symbols glyph (`lock` / `search_off` / `add_circle`) that names the
  failure mode.

### Top Bar / Navigation
- **Container:** Console Surface background, 1px Console Stroke bottom
  border, `14px 28px` padding, flex with `28px` gap.
- **Brand mark:** `<h1>簡報後台</h1>` at `18px`, weight 600, letter-spacing
  `0.5px`. Single line of text; no logo image.
- **Nav links:** Ink Muted at `14px`, `6px 12px` padding, `6px` radius. The
  active link gets Console Stroke fill and Ink Primary ink; hover gets
  Console Stroke fill and Ink Secondary ink.

### Inputs
- **Surface:** Console Deep fill, 1px Console Stroke border, `6px` radius,
  `10px 12px` padding, Ink Primary text.
- **Focus:** Border colour flips to Process Blue. No glow, no outline-ring,
  no shadow — the colour change is the entire focus treatment.
- **Error:** No dedicated error border. Errors appear as Danger Red text
  beneath the field with a `min-height: 18px` reserved slot so layout
  doesn't jump.

### Material Symbols
- **Variant:** Material Symbols Rounded only. `axes: opsz 20..24, wght 400, FILL 0, GRAD 0`.
- **Loading strategy:** `display=block` on the Google Fonts URL so the
  variable axes don't FOUT.
- **Sizing:** `20px` inside `icon-btn`, `18px` inside primary buttons and
  panel-head titles, `32px` in empty states.
- **Vertical alignment:** `vertical-align: middle` set on the base class so
  glyphs sit on the text baseline inside flex rows.

## 6. Do's and Don'ts

### Do:
- **Do** use Process Blue on ≤5% of any screen — primary CTA, toggle-on,
  current-page pager button. The One Accent Rule (Colors) is normative.
- **Do** use the four-tier surface ramp (Base / Rail / Surface / Surface-hover)
  for every elevation choice. The Four-Tier Surface Rule (Colors) is normative.
- **Do** carry every column-header label, panel-head eyebrow, and form-field
  label in the Label tier (12px / 600 / letter-spacing 0.6px / uppercase /
  Ink Muted). The One Uppercase Tier Rule (Typography) is normative.
- **Do** lead destructive actions with a confirm dialog that names the
  collateral effect. The deletion confirm in `dashboard.js:122` reads
  `確定要刪除「X」嗎？此操作無法復原，且會同步從所有 Playlist 移除` — that
  pattern is the floor.
- **Do** show pagination summary in both directions (`第 X–Y 筆，共 N 筆`),
  never just `Page 1 of 10`. The user needs the total to decide whether to
  page or filter.
- **Do** reserve a `min-height: 18px` slot for inline errors so the form
  layout does not jump when validation fires.
- **Do** use `display=block` on the Material Symbols stylesheet URL so the
  variable axes do not FOUT.

### Don't:
- **Don't** ship corporate-tech hero gradients, scroll-driven choreography,
  or hero metric tiles in the admin. (PRODUCT.md anti-reference:
  "corporate-tech 藍黃漸層、炸開的網狀背景、scroll-driven 動畫".)
- **Don't** add antique-government-portal scaffolding — heart icons, 3D
  bevels, neon list rows, Comic Sans / 微軟正黑體粗體 headings. (PRODUCT.md
  anti-reference: "古董政府網站".)
- **Don't** drop Buddhist iconography into admin chrome — lotus watermarks,
  Buddha silhouettes, sutra-script display fonts, gold/purple ceremonial
  palettes. (PRODUCT.md anti-reference: "過度佛教元素".)
- **Don't** clone the Notion / Linear all-white-and-Inter look. The admin
  must read as Tzu Chi's tool, not a generic SaaS template. (PRODUCT.md
  anti-reference: "Notion / Linear 風克隆".)
- **Don't** use `border-left` or `border-right` greater than 1px as a
  coloured stripe on table rows, callouts, or cards. Use a full 1px border
  or background tint.
- **Don't** introduce a fifth surface tier. Pick Base, Rail, Surface, or
  Surface-hover. A fifth shade reads as drift, not depth.
- **Don't** introduce gradient text (`background-clip: text`), gradient
  fills, or glass / blur cards. Flat surfaces only.
- **Don't** float modals on `box-shadow`. The backdrop overlay is the
  elevation cue (The Backdrop-Over-Float Rule).
- **Don't** add a second uppercase tier (section dividers, eyebrow
  kickers, numbered scaffolds `01 / 02 / 03`). Uppercase lives at the
  Label tier or nowhere.
- **Don't** treat this baseline as the brand. PRODUCT.md commits to a Tzu
  Chi blue / cream / 標楷體 identity the next pass will land. Until then,
  prefer "could survive the rebrand" choices: tokenised surfaces, semantic
  type tiers, OS-native body font. New work that hard-codes dark navy is
  rework debt.
