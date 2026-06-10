// Registry-based hotkey system. Each route registers its bindings on
// page load; hotkeys.js maintains a single document keydown listener.
//
// Hotkeys are disabled while focus is inside an <input>, <textarea>,
// <select>, or contentEditable element — EXCEPT for Escape (always
// active) and Cmd/Ctrl+Enter / Cmd/Ctrl+S (always active for submit).
// The `/` key triggers filter focus UNLESS the user is typing in a
// non-filter input.
//
// API:
//   bindHotkey({ key, mod?, label, handler, scope? })
//     key:   "?" | "/" | "j" | "k" | "Enter" | "Backspace" | "Delete" | etc.
//     mod:   "cmd" | "ctrl" | "shift" | "meta" — optional
//            (cmd matches meta on mac / ctrl on win+linux)
//     label: short Chinese description for the help modal
//     handler: (e) => void
//     scope:  optional string label for grouping in the help modal
//   unbindAll()      — clear the registry (for SPA-like teardown)
//   getBindings()    — for the ? help modal to render the list

const bindings = [];
let listenerInstalled = false;

function isMac() {
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

function isTypingTarget(target) {
  if (!target || target.nodeType !== 1) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return false;
}

function modMatches(e, mod) {
  // No required modifier — match only when no cmd/ctrl modifier is held,
  // since plain "j" should not fire on Cmd+J.
  if (!mod) return !(e.metaKey || e.ctrlKey);
  if (mod === "cmd") return isMac() ? e.metaKey : e.ctrlKey;
  if (mod === "ctrl") return e.ctrlKey;
  if (mod === "meta") return e.metaKey;
  if (mod === "shift") return e.shiftKey;
  return false;
}

function keyMatches(e, key) {
  // Normalize: `?` is typed via Shift+/ on US layouts; check both
  // event.key === "?" and event.key === "/" with shiftKey.
  if (key === "?") return e.key === "?" || (e.key === "/" && e.shiftKey);
  if (key.length === 1) return e.key.toLowerCase() === key.toLowerCase();
  return e.key === key;
}

function onKey(e) {
  const typing = isTypingTarget(e.target);
  const targetIsFilter =
    typing && e.target.classList && e.target.classList.contains("filter");

  for (const b of bindings) {
    if (!keyMatches(e, b.key)) continue;
    if (!modMatches(e, b.mod)) continue;

    // Escape is always allowed (e.g. dismiss modal / clear focus).
    const alwaysOn = b.key === "Escape";
    // Cmd/Ctrl+Enter and Cmd/Ctrl+S are always allowed for submit.
    const submitCombo =
      (b.mod === "cmd" || b.mod === "ctrl" || b.mod === "meta") &&
      (b.key === "Enter" || b.key.toLowerCase() === "s");

    if (typing && !alwaysOn && !submitCombo) {
      // `/` is special: focus the filter input even from elsewhere — but
      // if the user is already typing in a non-filter input, leave them
      // alone. If they are in a filter input, `/` should pass through as
      // a normal character.
      if (b.key === "/" && !targetIsFilter && !e.shiftKey) {
        // fall through to handler below
      } else {
        continue;
      }
    }

    e.preventDefault();
    try {
      b.handler(e);
    } catch (err) {
      // Don't let one broken binding kill the whole listener.
      // eslint-disable-next-line no-console
      console.error("[hotkeys] handler error", err);
    }
    return;
  }
}

function installListener() {
  if (listenerInstalled) return;
  document.addEventListener("keydown", onKey);
  listenerInstalled = true;
}

export function bindHotkey({ key, mod, label, handler, scope } = {}) {
  if (!key || typeof handler !== "function") return;
  bindings.push({ key, mod, label: label || "", handler, scope: scope || "" });
  installListener();
}

export function unbindAll() {
  bindings.length = 0;
}

export function getBindings() {
  return bindings.slice();
}

// Render a human-readable hint like "Cmd+S" or "Shift+?".
export function formatBinding(b) {
  const parts = [];
  if (b.mod === "cmd") parts.push(isMac() ? "⌘" : "Ctrl");
  else if (b.mod === "ctrl") parts.push("Ctrl");
  else if (b.mod === "meta") parts.push("⌘");
  else if (b.mod === "shift") parts.push("Shift");
  parts.push(b.key === " " ? "Space" : b.key);
  return parts.join("+");
}
