# Palette Alignment to Feedback Regulation — Design

**Date:** 2026-06-06
**Status:** Approved
**Author:** kael1996 + Claude

## Context

User feedback document (`Masterslide101.html`, delivered as part of the Master slide 101 review) prescribes a 4-color regulation palette that the slides viewer must align to. Decision authority: **must-align** — these hex values are non-negotiable. Colors not listed in the regulation **stay at their current values** (regulation is treated as a diff list, not a complete palette spec).

## Regulation Palette

| Role (inferred) | Hex |
|-----------------|-----|
| Primary | `#00FDFF` (saturated cyan) |
| Secondary text | `#D9D9D9` (light gray) |
| Secondary accent | `#D7D992` (muted yellow-green) |
| Highlight | `#FFFF00` (pure yellow) |

## Goals

1. Bring the 4 regulation hex codes into the codebase as `:root` design tokens.
2. Eliminate every hardcoded duplicate of the changed colors so the regulation propagates everywhere.
3. Introduce `--color-highlight` as a new token slot AND adopt it in a real component (search highlight) so the regulation color is observable in the rendered UI, not merely defined.
4. Preserve every color the regulation did not list.

## Non-Goals

- Tokenize the body background `#1a1a2e` (not in regulation; deferred).
- Remove the dead `--color-accent` token (regulation says "keep what isn't listed"; deferred).
- Touch `public/remote/remote.css` or `public/admin/css/admin.css` (different surfaces; regulation didn't address).
- Visually redesign anything beyond hex substitution.

## §1 — Token Changes (`public/slides/css/base.css :root`)

| Token | Before | After | Change Type |
|-------|--------|-------|-------------|
| `--color-primary` | `#5FCFC3` | `#00FDFF` | UPDATE (規範) |
| `--color-primary-light` | `#7EDDD3` | `#7EDDD3` | KEEP (規範未列) |
| `--color-secondary` | `#FFD700` | `#D7D992` | UPDATE (規範) |
| `--color-accent` | `#FF8C00` | `#FF8C00` | KEEP (規範未列；仍是 0-usage 死 token) |
| `--color-text-primary` | `#FFFFFF` | `#FFFFFF` | UNCHANGED |
| `--color-text-secondary` | `#E8E8E8` | `#D9D9D9` | UPDATE (規範) |
| `--color-highlight` | — | `#FFFF00` | ADD (規範新增 slot) |

The new `--color-highlight` is added immediately after `--color-text-secondary` in the `:root` block, with a comment noting its `<mark.search-highlight>` adoption point.

## §2 — Hardcoded Hex Cleanup (13 replacements, same commit as §1)

Without this step, changing the tokens alone leaves three modal surfaces (goto / help / remote) at their old hardcoded colors. The cleanup makes the propagation complete.

### `public/slides/css/modals-goto.css` (8 spots)

| Line | Old literal | Replace with |
|------|-------------|--------------|
| 77 | `#5FCFC3` | `var(--color-primary)` |
| 84 | `#7EDDD3` | `var(--color-primary-light)` |
| 92 | `#FFD700` | `var(--color-secondary)` |
| 117 | `#5FCFC3` | `var(--color-primary)` |
| 124 | `#E8E8E8` | `var(--color-text-secondary)` |
| 171 | `#5FCFC3` | `var(--color-primary)` |
| 223 | `#5FCFC3` | `var(--color-primary)` |
| 266 | `#5FCFC3` | `var(--color-primary)` |

### `public/slides/css/modals-help.css` (3 spots)

| Line | Old literal | Replace with |
|------|-------------|--------------|
| 50 | `#5FCFC3` | `var(--color-primary)` |
| 69 | `#FFD700` | `var(--color-secondary)` |
| 81 | `#E8E8E8` | `var(--color-text-secondary)` |

### `public/slides/css/modals-remote.css` (2 spots)

| Line | Old literal | Replace with |
|------|-------------|--------------|
| 44 | `#5FCFC3` | `var(--color-primary)` |
| 68 | `#5FCFC3` | `var(--color-primary)` |

**Post-condition:** `grep -E '#(5FCFC3|7EDDD3|FFD700|E8E8E8)' public/slides/css/` returns zero matches (those hex values exist ONLY as token definitions in `base.css`).

## §3 — Search Highlight Adoption (`public/slides/css/search.css:81-91`)

The new `--color-highlight: #FFFF00` must have at least one real adoption point so the regulation color is actually rendered. The natural slot is `.search-highlight` (used by `search.js` to wrap matched text in `<mark>` elements).

Current code uses two hardcoded rgba colors (a gold and an orange — both leftover from the pre-token palette):

```css
.search-highlight {
  background: rgba(255, 215, 0, 0.4);
}
.search-highlight.current {
  background: rgba(255, 140, 0, 0.8);
  box-shadow: 0 0 0 2px rgba(255, 140, 0, 0.4);
}
```

**Replace with (pure regulation, intensity-based state distinction):**

```css
.search-highlight {
  background: rgba(255, 255, 0, 0.35);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
.search-highlight.current {
  background: var(--color-highlight);
  box-shadow: 0 0 0 2px var(--color-primary);
}
```

**Rationale for the cyan ring:** Yellow + cyan are complementary; the ring gives the current match an unambiguous visual lock-on. Both colors are in the regulation, so the search feature is now 100% regulation-coherent.

## §4 — Explicitly Out of Scope

| Item | Why not changed |
|------|-----------------|
| Body background `#1a1a2e` | Regulation didn't list it |
| `--color-primary-light: #7EDDD3` (single h4 usage) | Regulation didn't list it; visual disconnect with new primary is mild and only affects h4 |
| `--color-accent: #FF8C00` | Regulation didn't list it; still 0 token usages |
| modals-help.css kbd-key styling (`#ccc/#999/#f5f5f5/#e0e0e0/#333`) | Light-themed component; not part of brand palette |
| modals-remote.css `#4CAF50` (connected-status green) | Status indicator color, not brand |
| Random grays (`#888 / #333 / #555 / #999`) elsewhere | Regulation-silent; case-by-case judgement |
| `public/admin/` | Different page surface |
| `public/remote/remote.css` | Mobile remote; regulation didn't address |

## §5 — Validation

1. **Static check** — `grep -E '#(5FCFC3|7EDDD3|FFD700|E8E8E8|FF8C00)\b' public/slides/css/ | grep -v base.css` returns empty. Hardcoded gold rgba (`255, 215, 0`) and hardcoded orange rgba (`255, 140, 0`) in `search.css` are gone.
2. **Build** — `bun run build` completes without error.
3. **Test suite** — `bun test` all green (paginator/drust/convert/storage/playlists unaffected — no color references in any test file).
4. **Visual smoke (manual)** — `bun run dev` then walk through:
   - Viewer with a sample doc — primary cyan visible on H1/H2 headings, sidebar drawer, active toggle button.
   - Sidebar open — settings labels in new gray, primary cyan on active vertical/horizontal toggle.
   - `?` / `H` help modal — heading rows use new cyan/yellow-green/gray; kbd-key styling unchanged.
   - `G` goto modal — primary cyan on tab indicators and TOC accents.
   - `R` remote modal — cyan on heading and URL line; green connected indicator unchanged.
   - `Cmd+F` search — type a common term, confirm all matches show soft yellow tint; arrow through matches, confirm "current" match shows solid yellow with cyan ring.

## §6 — Commit Strategy

Single commit recommended, message:

```
feat(palette): align design tokens to Master slide 101 regulation

Mandated palette: cyan (#00FDFF), gray (#D9D9D9), yellow-green (#D7D992),
highlight yellow (#FFFF00). All four hex codes now resolve through
:root tokens, with 13 prior-hardcoded duplicates in modals-goto/help/remote
replaced by var() references. New --color-highlight token adopted by
.search-highlight for the search bar's match indicators.

Colors not listed in the regulation (--color-primary-light, --color-accent,
body bg #1a1a2e, kbd-key greys, status indicators) intentionally preserved
per "regulation = diff list" rule.
```

If review of individual scopes is preferred, the work can split into two commits: (a) token + hardcoded cleanup; (b) search highlight adoption.
