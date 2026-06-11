// Toast notification system for the admin surface.
//
// Why this exists: PRODUCT.md line 11 — 承辦人 don't read English error
// messages, and `alert("HTTP 500")` is the same noise. notify() renders
// classified, 中文-friendly errors with an optional 重試 affordance for
// transient failures (network / 5xx).
//
// API:
//   notify({ tone, title?, body, retry?, durationMs? }) → () => void
//   classifyHttpError(status) → { kind, message }
//
// Container is a single <ol class="ds-toast-stack"> lazily appended to
// <body> on first call. Subsequent toasts append as <li> items.

const STACK_CLASS = "ds-toast-stack";

export type Tone = "success" | "caution" | "error";

const DEFAULT_DURATIONS: Record<Tone, number> = {
  success: 3000,
  caution: 5000,
  error: 0, // sticky until dismissed or retried
};

const ICONS: Record<Tone, string> = {
  success: "check_circle",
  caution: "warning",
  error: "error",
};

const prefersReducedMotion = (): boolean =>
  !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function getStack(): Element {
  let stack = document.querySelector(`.${STACK_CLASS}`);
  if (!stack) {
    stack = document.createElement("ol");
    stack.className = STACK_CLASS;
    document.body.appendChild(stack);
  }
  return stack;
}

function escapeHTML(s: unknown): string {
  const map: Record<string, string> = {
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  };
  return String(s ?? "").replace(/[&<>"']/g, (c) => map[c] as string);
}

export interface NotifyOptions {
  tone?: Tone;
  title?: string;
  body: string;
  retry?: () => void | Promise<void>;
  durationMs?: number;
}

export interface HttpErrorClassification {
  kind: "network" | "permission" | "not_found" | "server" | "unknown";
  message: string;
}

/**
 * Show a toast. Returns a handle: callable to dismiss for backwards compat,
 * with `.dismiss()` and `.element` for callers that need to address this
 * specific toast (e.g., live-update its message during a long operation
 * without racing concurrent notify() calls in the same stack).
 */
export interface ToastHandle {
  (): void;
  dismiss: () => void;
  element: HTMLLIElement;
}

export function notify(
  { tone = "success", title, body, retry, durationMs }: NotifyOptions = {} as NotifyOptions,
): ToastHandle {
  if (!body) throw new Error("notify(): body is required");

  const stack = getStack();
  const li = document.createElement("li");
  li.className = `ds-toast ds-toast--${tone}`;
  li.setAttribute("role", "status");
  li.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");

  const hasRetry = typeof retry === "function";
  const showActions = hasRetry;

  li.innerHTML = `
    <span class="ds-toast__icon material-symbols-rounded">${ICONS[tone] || "info"}</span>
    <div class="ds-toast__body">
      ${title ? `<strong class="ds-toast__title">${escapeHTML(title)}</strong>` : ""}
      <p class="ds-toast__message">${escapeHTML(body)}</p>
      ${showActions ? `
        <div class="ds-toast__actions">
          ${hasRetry ? `<button type="button" class="ds-toast__retry">重試</button>` : ""}
          <button type="button" class="ds-toast__dismiss">關閉</button>
        </div>
      ` : ""}
    </div>
    <button type="button" class="ds-toast__close" aria-label="關閉">
      <span class="material-symbols-rounded">close</span>
    </button>
  `;

  let dismissed = false;
  let autoTimer: ReturnType<typeof setTimeout> | null = null;

  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    // Quick fade-out unless reduced motion.
    if (prefersReducedMotion()) {
      li.remove();
    } else {
      li.classList.add("ds-toast--leaving");
      setTimeout(() => li.remove(), 200);
    }
  };

  // Wire close + dismiss buttons.
  li.querySelector(".ds-toast__close")!.addEventListener("click", dismiss);
  const dismissBtn = li.querySelector(".ds-toast__dismiss");
  if (dismissBtn) dismissBtn.addEventListener("click", dismiss);

  // Wire retry button. The retry thunk owns the request; if it resolves
  // (no throw), we auto-dismiss as a success signal. Caller can also
  // pop its own success toast inside the thunk.
  if (hasRetry) {
    const retryBtn = li.querySelector<HTMLButtonElement>(".ds-toast__retry")!;
    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      const originalText = retryBtn.textContent;
      retryBtn.textContent = "重試中…";
      try {
        await retry!();
        dismiss();
      } catch {
        // Leave toast open so the user can try again. Surface the error
        // inline by appending a short note (only once).
        retryBtn.disabled = false;
        retryBtn.textContent = originalText;
        if (!li.querySelector(".ds-toast__retry-error")) {
          const note = document.createElement("p");
          note.className = "ds-toast__retry-error";
          note.textContent = "仍然失敗，請稍候再試。";
          li.querySelector(".ds-toast__body")!.appendChild(note);
        }
      }
    });
  }

  stack.appendChild(li);

  // Schedule auto-dismiss.
  const duration = typeof durationMs === "number"
    ? durationMs
    : DEFAULT_DURATIONS[tone] ?? 3000;
  if (duration > 0) {
    autoTimer = setTimeout(dismiss, duration);
  }

  // Build a callable handle that also exposes dismiss + the toast's <li>.
  // Callable form preserves the pre-existing `const f = notify(...); f()` idiom.
  const handle = (() => dismiss()) as ToastHandle;
  handle.dismiss = dismiss;
  handle.element = li;
  return handle;
}

/**
 * Map an HTTP status into a friendly { kind, message } pair.
 * status 0 OR navigator.onLine === false → 'network'.
 */
export function classifyHttpError(status: number): HttpErrorClassification {
  if (status === 0 || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    return { kind: "network", message: "請檢查網路連線後再試。" };
  }
  if (status === 401 || status === 403) {
    return { kind: "permission", message: "權限不足，請重新整理或聯絡管理員。" };
  }
  if (status === 404) {
    return { kind: "not_found", message: "找不到該項目，可能已被刪除。" };
  }
  if (status >= 500) {
    return { kind: "server", message: "系統暫時無法處理，請稍候再試。" };
  }
  return { kind: "unknown", message: `發生未預期的錯誤（${status}）。` };
}
