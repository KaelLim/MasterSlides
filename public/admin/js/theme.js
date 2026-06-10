// Theme switcher for admin pages — light / dark / system (follow OS).
// Persists choice in localStorage under "admin_theme".
//
// The initial paint MUST happen with the right theme applied to <html>
// (data-theme attribute) before stylesheets resolve, otherwise the page
// flashes the wrong palette (FOUC). To make that work, every admin page
// inlines a tiny boot snippet in <head> that sets data-theme before any
// stylesheet is parsed. This module then wires the toggle button.

const STORAGE_KEY = "admin_theme";
const ORDER = ["system", "light", "dark"];

export function readTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  return ORDER.includes(v) ? v : "system";
}

export function applyTheme(theme) {
  const html = document.documentElement;
  if (theme === "light") {
    html.setAttribute("data-theme", "light");
  } else if (theme === "dark") {
    html.setAttribute("data-theme", "dark");
  } else {
    html.removeAttribute("data-theme");
  }
}

export function setTheme(theme) {
  if (!ORDER.includes(theme)) return;
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
  syncButton();
}

function nextTheme(current) {
  const i = ORDER.indexOf(current);
  return ORDER[(i + 1) % ORDER.length];
}

function syncButton() {
  const btn = document.getElementById("themeToggle");
  if (!btn) return;
  const current = readTheme();
  const icon = btn.querySelector(".material-symbols-rounded");
  const labelMap = {
    system: { glyph: "computer", title: "跟隨系統（按一下切換到亮色）" },
    light:  { glyph: "light_mode", title: "亮色模式（按一下切換到深色）" },
    dark:   { glyph: "dark_mode", title: "深色模式（按一下跟隨系統）" },
  };
  const m = labelMap[current];
  if (icon) icon.textContent = m.glyph;
  btn.title = m.title;
  btn.setAttribute("aria-label", m.title);
}

// Wire up the toggle button once DOM is ready. Idempotent if the button
// isn't on the page (e.g. /edit/ which doesn't use the admin topbar).
function attachToggle() {
  const btn = document.getElementById("themeToggle");
  if (!btn || btn.dataset.themeWired === "1") return;
  btn.dataset.themeWired = "1";
  btn.addEventListener("click", () => setTheme(nextTheme(readTheme())));
  syncButton();
}

// React to OS-level theme changes when the user has the "system" preference
// active. Without this, switching macOS dark→light leaves the page stuck.
const mql = window.matchMedia("(prefers-color-scheme: dark)");
mql.addEventListener?.("change", () => {
  if (readTheme() === "system") applyTheme("system");
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attachToggle);
} else {
  attachToggle();
}
