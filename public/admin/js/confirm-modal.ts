// Shared in-page confirmation modal. Replaces window.confirm().
//
// Usage:
//   const ok = await confirmDestructive({
//     title: "刪除文件",
//     body: "確定要刪除嗎？此操作無法復原。",
//     dangerLabel: "刪除",
//     cancelLabel: "取消",
//     tone: "danger", // or "caution"
//   });
//
// `body` is rendered as HTML — callers must pre-escape any interpolated
// user content with escapeHTML before passing it in.
//
// Resolves true when the primary (danger/caution) button is clicked.
// Resolves false on cancel, ESC, or backdrop click.

export type ConfirmTone = "danger" | "caution";

export interface ConfirmDestructiveOptions {
  title?: string;
  body?: string;
  dangerLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

export function confirmDestructive({
  title,
  body,
  dangerLabel = "確定",
  cancelLabel = "取消",
  tone = "danger",
}: ConfirmDestructiveOptions = {}): Promise<boolean> {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-backdrop";
    const primaryClass = tone === "caution" ? "primary" : "danger";
    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="cm-title">
        <h3 id="cm-title">${title ?? ""}</h3>
        <p class="desc">${body ?? ""}</p>
        <div class="actions">
          <button class="secondary" data-cm="cancel">${cancelLabel}</button>
          <button class="${primaryClass}" data-cm="confirm">${dangerLabel}</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);

    const cleanup = (value: boolean): void => {
      document.removeEventListener("keydown", onKey);
      wrap.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.preventDefault(); cleanup(false); }
      else if (e.key === "Enter") { e.preventDefault(); cleanup(true); }
    };
    document.addEventListener("keydown", onKey);

    wrap.addEventListener("click", (e: MouseEvent) => {
      if (e.target === wrap) { cleanup(false); return; }
      const target = e.target as Element | null;
      const btn = target?.closest<HTMLElement>("[data-cm]");
      if (!btn) return;
      cleanup(btn.dataset.cm === "confirm");
    });

    // Focus the cancel button by default — safer landing target for ENTER-happy users.
    queueMicrotask(() => wrap.querySelector<HTMLButtonElement>('[data-cm="cancel"]')?.focus());
  });
}
