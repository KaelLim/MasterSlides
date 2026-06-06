# Palette Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the 4-color regulation palette from Master slide 101 feedback (`#00FDFF` / `#D9D9D9` / `#D7D992` / `#FFFF00`) by updating `:root` tokens, eliminating 13 hardcoded duplicates across modal CSS, and adopting the new `--color-highlight` in the search bar.

**Architecture:** Pure CSS refactor. Token values change in `base.css`; three modal CSS files swap literal hex for `var()`; `search.css` swaps two leftover rgba colors for regulation rgba + `var()`. No JS, no markup, no build config touched. Split into three atomic commits — Task 1 = palette propagation, Task 2 = search highlight regulation adoption, Task 3 = rgba derivatives → `color-mix()` on tokens (added mid-execution after spec review surfaced that 8 rgba calls had encoded regulation colors in disguise, bypassing the hex grep).

**Tech Stack:** CSS custom properties, vanilla rgba.

---

### Task 1: Update tokens + remove 13 hardcoded duplicates

**Why one task:** Changing tokens without simultaneously cleaning the hardcoded modal hexes leaves a visually broken intermediate state (modals stuck at old colors while the rest of the UI flips). All 4 files must land in the same commit.

**Files:**
- Modify: `public/slides/css/base.css` (lines 5-10 in `:root`)
- Modify: `public/slides/css/modals-goto.css` (8 spots)
- Modify: `public/slides/css/modals-help.css` (3 spots)
- Modify: `public/slides/css/modals-remote.css` (2 spots)

- [ ] **Step 1: Update `:root` tokens in `public/slides/css/base.css`**

Current lines 4-10 are:

```css
:root {
  --color-primary: #5FCFC3;
  --color-primary-light: #7EDDD3;
  --color-secondary: #FFD700;
  --color-accent: #FF8C00;
  --color-text-primary: #FFFFFF;
  --color-text-secondary: #E8E8E8;
```

Replace with:

```css
:root {
  --color-primary: #00FDFF;
  --color-primary-light: #7EDDD3;
  --color-secondary: #D7D992;
  --color-accent: #FF8C00;
  --color-text-primary: #FFFFFF;
  --color-text-secondary: #D9D9D9;
  /* Highlight: regulation yellow, adopted in .search-highlight (Task 2) */
  --color-highlight: #FFFF00;
```

(Lines 11+ are unchanged.)

- [ ] **Step 2: Replace 8 hardcoded hexes in `public/slides/css/modals-goto.css`**

| Line | Old | New |
|------|-----|-----|
| 77 | `  background: #5FCFC3;` | `  background: var(--color-primary);` |
| 84 | `.goto-input-wrap button:hover { background: #7EDDD3; }` | `.goto-input-wrap button:hover { background: var(--color-primary-light); }` |
| 92 | `  color: #FFD700;` | `  color: var(--color-secondary);` |
| 117 | `  color: #5FCFC3;` | `  color: var(--color-primary);` |
| 124 | `  color: #E8E8E8;` | `  color: var(--color-text-secondary);` |
| 171 | `  color: #5FCFC3;` | `  color: var(--color-primary);` |
| 223 | `  border-color: #5FCFC3;` | `  border-color: var(--color-primary);` |
| 266 | `  color: #5FCFC3;` | `  color: var(--color-primary);` |

If line numbers have drifted, locate each by searching for the literal hex value — every replacement is uniquely identifiable by the line's full text. Each old string occurs at exactly one site in the file.

- [ ] **Step 3: Replace 3 hardcoded hexes in `public/slides/css/modals-help.css`**

| Line | Old | New |
|------|-----|-----|
| 50 | `  color: #5FCFC3;` | `  color: var(--color-primary);` |
| 69 | `  color: #FFD700;` | `  color: var(--color-secondary);` |
| 81 | `  color: #E8E8E8;` | `  color: var(--color-text-secondary);` |

- [ ] **Step 4: Replace 2 hardcoded hexes in `public/slides/css/modals-remote.css`**

| Line | Old | New |
|------|-----|-----|
| 44 | `  color: #5FCFC3;` | `  color: var(--color-primary);` |
| 68 | `  color: #5FCFC3;` | `  color: var(--color-primary);` |

- [ ] **Step 5: Static check — every replaced old hex is gone**

Run: `grep -rn '#5FCFC3' public/slides/css/`
Expected: empty (was 9 occurrences total: 1 token def + 8 modal duplicates; now token holds `#00FDFF`, modals use `var()`).

Run: `grep -rn '#FFD700' public/slides/css/`
Expected: empty.

Run: `grep -rn '#E8E8E8' public/slides/css/`
Expected: empty.

Run: `grep -rn '#7EDDD3' public/slides/css/`
Expected: exactly one line — `public/slides/css/base.css:6:  --color-primary-light: #7EDDD3;` (token def survives; the one modal duplicate is gone).

- [ ] **Step 6: Static check — new regulation hexes exist exactly once each**

Run: `grep -rn '#00FDFF' public/slides/css/`
Expected: 1 match in `base.css` (token def).

Run: `grep -rn '#D7D992' public/slides/css/`
Expected: 1 match in `base.css` (token def).

Run: `grep -rn '#D9D9D9' public/slides/css/`
Expected: 1 match in `base.css` (token def).

Run: `grep -rn '#FFFF00' public/slides/css/`
Expected: 1 match in `base.css` (the new `--color-highlight` token).

- [ ] **Step 7: Build check**

Run: `bun run build`
Expected: completes successfully, `public/slides/dist/app.js` regenerated. (No JS changed in this task, but the build also revalidates the CSS imports indirectly through the bundled HTML.)

- [ ] **Step 8: Paginator test (regression backstop)**

Run: `bun test public/slides/js/paginator.test.ts`
Expected: all tests pass. (Paginator is color-independent; this proves no unrelated breakage.)

- [ ] **Step 9: Commit**

```bash
git add public/slides/css/base.css \
        public/slides/css/modals-goto.css \
        public/slides/css/modals-help.css \
        public/slides/css/modals-remote.css
git commit -m "$(cat <<'EOF'
feat(palette): align tokens to Master slide 101 regulation

:root now holds the regulation hexes #00FDFF (primary cyan),
#D7D992 (secondary yellow-green), #D9D9D9 (text-secondary gray),
and the new #FFFF00 (--color-highlight) slot. 13 hardcoded duplicates
in modals-goto/help/remote replaced by var() references so the
regulation propagates everywhere — not just through :root.

Colors the regulation did not list (--color-primary-light, --color-accent,
body bg #1a1a2e, status indicators, kbd-key greys) intentionally preserved
per "regulation = diff list" rule.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Adopt `--color-highlight` in search bar

**Why a separate task:** `.search-highlight` currently uses two rgba duplicates of the OLD gold and orange (leftovers from the pre-token era). Replacing them is a small but distinct behavior change — the search highlight visibly switches hue (gold→yellow) and the current-match indicator changes (orange ring → cyan ring). Keeping this isolated from Task 1 makes the change easy to read, easy to revert, and gives the new `--color-highlight` token its first rendered adoption point.

**Files:**
- Modify: `public/slides/css/search.css` (lines 81-91)

- [ ] **Step 1: Replace the `.search-highlight` block in `public/slides/css/search.css`**

Current lines 81-91:

```css
/* Search Highlights */
.search-highlight {
  background: rgba(255, 215, 0, 0.4);
  color: inherit;
  border-radius: 2px;
  padding: 0 1px;
}
.search-highlight.current {
  background: rgba(255, 140, 0, 0.8);
  box-shadow: 0 0 0 2px rgba(255, 140, 0, 0.4);
}
```

Replace with:

```css
/* Search Highlights — regulation yellow (#FFFF00); current match gets
   a cyan ring (--color-primary) for visual lock-on. Yellow + cyan are
   complements, so the active match pops out unambiguously. */
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

- [ ] **Step 2: Static check — old gold/orange rgba leftovers are gone**

Run: `grep -rn 'rgba(255, 215, 0' public/slides/css/`
Expected: empty.

Run: `grep -rn 'rgba(255, 140, 0' public/slides/css/`
Expected: empty.

- [ ] **Step 3: Static check — new highlight color resolves through tokens**

Run: `grep -n 'var(--color-highlight)\|var(--color-primary)' public/slides/css/search.css`
Expected: both `var(--color-highlight)` and `var(--color-primary)` appear in `search.css` (lines around 88-90).

Run: `grep -n '#FFFF00\|#FF8C00\|#FFD700' public/slides/css/search.css`
Expected: empty (no literal regulation OR pre-regulation hexes survive in this file).

- [ ] **Step 4: Build check**

Run: `bun run build`
Expected: completes successfully.

- [ ] **Step 5: Paginator test (regression backstop)**

Run: `bun test public/slides/js/paginator.test.ts`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add public/slides/css/search.css
git commit -m "$(cat <<'EOF'
feat(search): adopt --color-highlight for search match indicators

Search bar matches were the only surface still using the pre-token
gold (rgba 255,215,0) and orange (rgba 255,140,0). Now matches render
in regulation #FFFF00 — soft tint for plain matches, solid + cyan ring
for the current match. Yellow + cyan are complements, so the active
match has the strongest possible visual contrast against the soft tint
of inactive matches while keeping every color inside the regulation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Manual visual smoke (user task)**

Open http://localhost:3000 and walk through:

| Surface | What to confirm |
|---------|-----------------|
| Viewer | H1/H2 headings saturated cyan (was teal) |
| Sidebar (`S`) | Settings labels in `#D9D9D9` gray; active toggle button cyan |
| Help modal (`?` / `H`) | Section heading cyan; subheading yellow-green; kbd keys unchanged |
| Goto modal (`G`) | Tab accents and TOC items cyan |
| Remote QR modal (`R`) | Heading + URL line cyan; "connected" green unchanged |
| Search (`Cmd+F`) | Soft yellow match tint; arrow through matches; current match = solid yellow + cyan ring |

If anything looks off, report back with the surface and the issue.

---

### Task 3: Replace rgba derivatives of regulation colors with `color-mix()` on tokens

**Why added (post-hoc):** Tasks 1+2 moved every literal regulation `#hex` into `:root` tokens and confirmed the grep was clean. But spec review surfaced — and a follow-up sweep confirmed — that 8 rgba calls had been encoding the same regulation colors in disguise:

- 5 in `modals-goto.css` as `rgba(95, 207, 195, X)` = old `#5FCFC3` cyan with alpha
- 2 in `context-menu.css` as `rgba(95, 207, 195, X)` = same disguise
- 1 in `search.css` as `rgba(255, 255, 0, 0.35)` = new regulation yellow as a literal rgba (created by Task 2)

Both forms — old hex in rgba syntax, and new hex in rgba syntax — fail the "regulation = single source of truth" goal: if the token ever changes, these derived tints stay frozen at the old value. The user approved extending scope to fix all 8 in one commit.

**Why `color-mix()` and not `rgba(0, 253, 255, X)`?** Substituting one literal for another only swaps which value is duplicated. `color-mix(in srgb, var(--token) N%, transparent)` produces the same alpha-blended result but ties the tint directly to the token — change the token, every tint follows. Browser support is universal across our 2026 target (Chrome 111+, Safari 16.2+, Firefox 113+).

**Files:**
- Modify: `public/slides/css/modals-goto.css` (5 spots)
- Modify: `public/slides/css/context-menu.css` (2 spots)
- Modify: `public/slides/css/search.css` (1 spot)

- [x] **Step 1: Replace 5 rgba(95,207,195,…) sites in `modals-goto.css`**

| Line | Old (suffix) | New |
|------|--------------|-----|
| 71 | `box-shadow: 0 0 0 3px rgba(95,207,195,0.2);` | `box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 20%, transparent);` |
| 116 | `background: rgba(95,207,195,0.15);` | `background: color-mix(in srgb, var(--color-primary) 15%, transparent);` |
| 170 | `background: rgba(95,207,195,0.2);` | `background: color-mix(in srgb, var(--color-primary) 20%, transparent);` |
| 219 | `border-color: rgba(95,207,195,0.5);` | `border-color: color-mix(in srgb, var(--color-primary) 50%, transparent);` |
| 224 | `box-shadow: 0 0 0 2px rgba(95,207,195,0.3);` | `box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 30%, transparent);` |

- [x] **Step 2: Replace 2 rgba(95, 207, 195, …) sites in `context-menu.css`**

Note the spaced form (`95, 207, 195` with spaces) vs the compact form in `modals-goto.css`.

| Line | Old | New |
|------|-----|-----|
| 38 | `background: rgba(95, 207, 195, 0.15);` | `background: color-mix(in srgb, var(--color-primary) 15%, transparent);` |
| 42 | `background: rgba(95, 207, 195, 0.25);` | `background: color-mix(in srgb, var(--color-primary) 25%, transparent);` |

- [x] **Step 3: Replace the 1 rgba(255, 255, 0, …) site in `search.css`**

| Line | Old | New |
|------|-----|-----|
| 85 | `background: rgba(255, 255, 0, 0.35);` | `background: color-mix(in srgb, var(--color-highlight) 35%, transparent);` |

- [x] **Step 4: Static check — rgba derivatives of regulation colors are gone globally**

Run: `grep -rn 'rgba(95' public/slides/css/`
Expected: empty (no surviving old-primary-in-rgba anywhere).

Run: `grep -rn 'rgba(255, 255, 0' public/slides/css/`
Expected: empty (no surviving new-yellow-as-literal-rgba anywhere).

- [x] **Step 5: Static check — color-mix() correctly wires through tokens**

Run: `grep -rn 'color-mix(in srgb, var(--color-primary)' public/slides/css/`
Expected: 7 matches total (5 in `modals-goto.css` + 2 in `context-menu.css`).

Run: `grep -rn 'color-mix(in srgb, var(--color-highlight)' public/slides/css/`
Expected: 1 match in `search.css`.

- [x] **Step 6: Build check**

Run: `bun run build`
Expected: completes successfully.

- [x] **Step 7: Commit**

```bash
git add public/slides/css/modals-goto.css \
        public/slides/css/context-menu.css \
        public/slides/css/search.css
git commit -m "refactor(palette): replace rgba derivatives with color-mix on tokens"
```

Landed as commit `ab81ef7`. Full commit body documents the 5+2+1 breakdown and browser support rationale.

---

## Out-of-Scope Reminders (do NOT touch in this plan)

- Body background `#1a1a2e` — regulation didn't list it
- `--color-primary-light` token value `#7EDDD3` — regulation didn't list it (single h4 usage; mild hue disconnect from new primary is acceptable)
- `--color-accent` token value `#FF8C00` — regulation didn't list it (still 0 usages; deferred cleanup)
- `modals-help.css` kbd-key greys (`#ccc / #999 / #f5f5f5 / #e0e0e0 / #333`) — light-themed component, not brand
- `modals-remote.css` `#4CAF50` (connected-status green) — status indicator, not brand
- `public/admin/css/admin.css` — separate page, regulation didn't address
- `public/remote/remote.css` — mobile remote, regulation didn't address
