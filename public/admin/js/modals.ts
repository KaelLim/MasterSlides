// Modal + drawer overlays for the admin dashboard.
//
// Ported 1:1 from /tmp/anthropic-design/docs/project/app/modals.jsx.
// Each exported entry point mounts a fresh overlay to <body> and returns
// a remove() function that tears it down. Escape closes any open modal
// (except while an import is mid-flight). Class names and DOM shape
// match the prototype exactly so the existing overlays.css / components.css
// styles apply unchanged.

import type { Doc, ConfirmOpts } from './types.js';
import { h, mount } from './h.js';
import { Icon } from './icons.js';

// ─────────────────────────────────────────────────────────────────────
// Escape helper — mirrors useEsc() from the prototype. Returns the
// disposer so callers can detach the listener on teardown.
// ─────────────────────────────────────────────────────────────────────
function bindEsc(onEsc: () => void, gate?: () => boolean): () => void {
  const handler = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (gate && !gate()) return;
    e.stopPropagation();
    onEsc();
  };
  window.addEventListener('keydown', handler, true);
  return () => window.removeEventListener('keydown', handler, true);
}

// ─────────────────────────────────────────────────────────────────────
// parseDocId — accept full Google Docs URLs or bare 6+ alphanum-_ ids.
// ─────────────────────────────────────────────────────────────────────
export function parseDocId(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const m = s.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{6,}$/.test(s)) return s;
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// ConfirmModal — used for destructive + opt-in confirmations.
// ─────────────────────────────────────────────────────────────────────
export function showConfirm(opts: ConfirmOpts): () => void {
  const { title, message, lossItems, confirmLabel, danger, onConfirm, onCancel } = opts;

  const cancel = (): void => {
    remove();
    onCancel();
  };
  const confirm = (): void => {
    remove();
    onConfirm();
  };

  const dlgIcon = h('div', { class: `dlg-icon ${danger ? 'danger' : 'brand'}` },
    Icon(danger ? 'alert' : 'info', { size: 22 }),
  );

  const head = h('div', { class: 'dlg-head' },
    dlgIcon,
    h('h2', null, title),
    message ? h('p', null, message) : null,
  );

  const lossUl = lossItems && lossItems.length > 0
    ? h('div', { class: 'lossbox' },
        h('ul', null, ...lossItems.map((li) => h('li', null, li as unknown as Node | string))),
      )
    : null;

  const body = h('div', { class: 'dlg-body', style: { paddingTop: '0' } }, lossUl);

  const primaryBtn = h('button',
    { class: `btn ${danger ? 'danger' : 'primary'}`, onClick: confirm },
    danger ? Icon('trash', { size: 16 }) : null,
    confirmLabel,
  );

  const foot = h('div', { class: 'dlg-foot' },
    h('button', { class: 'btn', onClick: cancel }, '取消'),
    primaryBtn,
  );

  const dialog = h('div',
    {
      class: 'dialog',
      role: 'alertdialog',
      'aria-modal': 'true',
      style: { maxWidth: '440px' },
    },
    head, body, foot,
  );

  const scrim = h('div',
    {
      class: 'scrim',
      onMousedown: (e: MouseEvent) => { if (e.target === e.currentTarget) cancel(); },
    },
    dialog,
  );

  document.body.appendChild(scrim);
  primaryBtn.focus();

  const detachEsc = bindEsc(cancel);
  let removed = false;
  function remove(): void {
    if (removed) return;
    removed = true;
    detachEsc();
    scrim.remove();
  }
  return remove;
}

// ─────────────────────────────────────────────────────────────────────
// ImportModal — paste Google Docs URL / doc_id → progress → result.
// Simulates the real import pipeline timing so the UX feels identical
// to the prototype; the actual fetch+convert wiring lives in dashboard.ts.
// ─────────────────────────────────────────────────────────────────────
type ImportPhase = 'input' | 'running' | 'error';

interface ImportedRecord {
  doc_id: string;
  title: string;
  state: 'draft';
  updated_at: number;
  created_at: number;
  playlist_count: number;
}

export interface ShowImportOpts {
  existingIds: string[];
  onClose: () => void;
  onImported: (d: ImportedRecord) => void;
  // If provided, the modal hands off to the real server-side import and
  // surfaces its outcome. If omitted, falls back to the prototype's
  // simulated 3-step tick chain (kept for offline UX preview).
  importer?: (docId: string) => Promise<{ doc_id: string; title: string }>;
  // Optional: map a thrown server error to { title, msg } pair displayed
  // in the error phase. Defaults to a generic Chinese message.
  errorClassifier?: (err: unknown) => { title: string; msg: string };
}

export function showImport(opts: ShowImportOpts): () => void {
  const { existingIds, onClose, onImported, importer, errorClassifier } = opts;

  let raw = '';
  let err = '';
  let phase: ImportPhase = 'input';
  let step = 0; // 0 fetch, 1 convert, 2 upsert
  let serverErr = '';
  let pendingTimers: number[] = [];

  const steps = ['從 Google Docs 擷取文件', '轉換為簡報頁面', '儲存至資料庫'];

  const dialog = h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true' });

  const scrim = h('div',
    {
      class: 'scrim',
      onMousedown: (e: MouseEvent) => {
        if (e.target === e.currentTarget && phase !== 'running') close();
      },
    },
    dialog,
  );

  function close(): void {
    remove();
    onClose();
  }

  function start(): void {
    const id = parseDocId(raw);
    if (!id) {
      err = '無法辨識連結。請貼上 Google Docs 網址或文件 ID。';
      render();
      return;
    }
    if (existingIds.includes(id)) {
      err = '這份文件已匯入過了。';
      render();
      return;
    }
    err = '';
    phase = 'running';
    step = 0;
    render();

    if (importer) {
      // Real-network mode: animate steps independently of the actual call.
      // Step 0 stays active until the request resolves; on success we
      // sweep 1→3 quickly so the user sees the phases without pretending
      // we know which one the server is in. Cancellation is handled by
      // checking the closure-captured `removed` flag (set inside remove())
      // — every async resolution branch reads it and bails on a dismissed
      // modal. The flag is hoisted (let) but only ever true after remove(),
      // and these handlers all run after `start()` returns, so accessing
      // it here is safe.
      pendingTimers.push(window.setTimeout(() => { if (removed) return; step = 1; render(); }, 600));

      importer(id).then((doc) => {
        if (removed) return;
        step = 2;
        render();
        pendingTimers.push(window.setTimeout(() => {
          if (removed) return;
          step = 3;
          render();
          pendingTimers.push(window.setTimeout(() => {
            if (removed) return;
            const now = Date.now();
            onImported({
              doc_id: doc.doc_id,
              title: doc.title || ('未命名文件 — ' + doc.doc_id.slice(0, 6)),
              state: 'draft',
              updated_at: now,
              created_at: now,
              playlist_count: 0,
            });
            remove();
          }, 350));
        }, 220));
      }).catch((errOnServer: unknown) => {
        if (removed) return;
        const cls = errorClassifier
          ? errorClassifier(errOnServer)
          : { title: '匯入失敗', msg: errOnServer instanceof Error ? errOnServer.message : '請稍候再試。' };
        serverErr = cls.title + '｜' + cls.msg;
        phase = 'error';
        render();
      });
      return;
    }

    // Fallback: simulate fetch → convert → upsert (prototype demo behaviour).
    const failAt = raw.includes('403') ? 0 : raw.includes('500') ? 1 : -1;
    const errMap: Record<number, { title: string; msg: string }> = {
      0: { title: '無法存取文件', msg: 'Google Docs 回應「沒有權限」。請將文件的共用權限設為「知道連結的人可檢視」後再試一次。' },
      1: { title: '轉換失敗', msg: '伺服器在轉換過程發生錯誤。請稍候再試，若持續發生請聯絡系統管理員。' },
    };

    let s = 0;
    const tick = (): void => {
      if (failAt === s) {
        serverErr = errMap[s].title + '｜' + errMap[s].msg;
        phase = 'error';
        render();
        return;
      }
      s += 1;
      step = s;
      render();
      if (s >= 3) {
        pendingTimers.push(window.setTimeout(() => {
          const now = Date.now();
          onImported({
            doc_id: id,
            title: '未命名文件 — ' + id.slice(0, 6),
            state: 'draft',
            updated_at: now,
            created_at: now,
            playlist_count: 0,
          });
          remove();
        }, 500));
        return;
      }
      pendingTimers.push(window.setTimeout(tick, 850));
    };
    pendingTimers.push(window.setTimeout(tick, 700));
  }

  function renderInputPhase(): Node[] {
    const primaryBtn = h('button',
      { class: 'btn primary', onClick: start, disabled: !raw.trim() },
      Icon('plus', { size: 16 }),
      '匯入並轉換',
    ) as HTMLButtonElement;

    const input = h('input', {
      class: `input mono ${err ? 'err' : ''}`,
      placeholder: 'https://docs.google.com/document/d/1xR9...',
      value: raw,
      onInput: (e: Event) => {
        raw = (e.currentTarget as HTMLInputElement).value;
        // Sync disabled state without a full re-render so the input keeps focus.
        primaryBtn.disabled = !raw.trim();
        if (err) { err = ''; render(); }
      },
      onKeydown: (e: KeyboardEvent) => { if (e.key === 'Enter') start(); },
    }) as HTMLInputElement;

    const fieldHint = err
      ? h('div', { class: 'errline' }, Icon('alert', { size: 14 }), err)
      : h('div', { class: 'hintline' }, '提示：文件須開啟「知道連結的人可檢視」權限。');

    const body = h('div', { class: 'dlg-body' },
      h('div', { class: 'field' },
        h('label', null, 'Google Docs 網址或文件 ID'),
        input,
        fieldHint,
      ),
    );

    const foot = h('div', { class: 'dlg-foot' },
      h('button', { class: 'btn', onClick: close }, '取消'),
      primaryBtn,
    );

    // Focus the input after mount.
    queueMicrotask(() => input.focus());
    return [body, foot];
  }

  function renderRunningPhase(): Node[] {
    const stepNodes = steps.map((label, i) => {
      const stateClass = i < step ? 'done' : i === step ? 'active' : '';
      return h('div', { class: `prog-step ${stateClass}` },
        h('span', { class: 'ps-ic' },
          i < step ? Icon('check', { size: 13 }) : h('span', null, String(i + 1)),
        ),
        label,
      );
    });

    const body = h('div', { class: 'dlg-body' },
      h('div', { class: 'import-prog' },
        h('div', { class: 'spinner' }),
        h('div', { class: 'prog-steps' }, ...stepNodes),
      ),
    );
    return [body];
  }

  function renderErrorPhase(): Node[] {
    const [errTitle, errMsg] = serverErr.split('｜');

    const body = h('div', { class: 'dlg-body' },
      h('div', {
        class: 'lossbox',
        style: { borderColor: 'var(--danger)', background: 'var(--danger-weak)' },
      },
        h('div', { style: { display: 'flex', gap: '10px' } },
          h('span', { style: { color: 'var(--danger)', flex: '0 0 auto' } },
            Icon('xCircle', { size: 20 }),
          ),
          h('div', null,
            h('div', { style: { fontWeight: '700', marginBottom: '4px' } }, errTitle || ''),
            h('div', { style: { fontSize: '13.5px', color: 'var(--text-2)', lineHeight: '1.55' } }, errMsg || ''),
          ),
        ),
      ),
    );

    const foot = h('div', { class: 'dlg-foot' },
      h('button', { class: 'btn', onClick: close }, '關閉'),
      h('button', {
        class: 'btn primary',
        onClick: () => { phase = 'input'; render(); },
      }, Icon('refresh', { size: 16 }), '重新輸入'),
    );

    return [body, foot];
  }

  function render(): void {
    const head = h('div', { class: 'dlg-head' },
      h('div', { class: 'dlg-icon brand' }, Icon('plus', { size: 22 })),
      h('h2', null, '匯入 Google 文件'),
      h('p', null, '貼上 Google Docs 的分享網址或文件 ID，系統會擷取、轉換並儲存為簡報。'),
    );

    const tail = phase === 'input'
      ? renderInputPhase()
      : phase === 'running'
        ? renderRunningPhase()
        : renderErrorPhase();

    mount(dialog as HTMLElement, [head, ...tail]);
  }

  render();
  document.body.appendChild(scrim);

  const detachEsc = bindEsc(close, () => phase !== 'running');

  let removed = false;
  function remove(): void {
    if (removed) return;
    removed = true;
    for (const t of pendingTimers) clearTimeout(t);
    pendingTimers = [];
    detachEsc();
    scrim.remove();
  }
  return remove;
}

// ─────────────────────────────────────────────────────────────────────
// EditDrawer — date / title / reporters editor for one doc.
// ─────────────────────────────────────────────────────────────────────
export interface ShowEditDrawerOpts {
  doc: Doc;
  onClose: () => void;
  onSave: (d: Doc) => void;
  onOpenExternal: (d: Doc) => void;
}

export function showEditDrawer(opts: ShowEditDrawerOpts): () => void {
  const { doc, onClose, onSave, onOpenExternal } = opts;

  let title = doc.title;
  const initialDate = doc.presentation_date != null
    ? new Date(doc.presentation_date)
    : new Date();
  let date = isFinite(initialDate.getTime())
    ? initialDate.toISOString().slice(0, 10)
    : '';
  let reporters: string[] = (doc.reporters && doc.reporters.length)
    ? [...doc.reporters]
    : [''];

  const close = (): void => {
    remove();
    onClose();
  };

  function save(): void {
    const next: Doc = {
      ...doc,
      title: title.trim() || doc.title,
      presentation_date: date ? new Date(date).getTime() : doc.presentation_date ?? null,
      reporters: reporters.map((r) => r.trim()).filter(Boolean),
    };
    remove();
    onSave(next);
  }

  const drawer = h('div', { class: 'drawer', role: 'dialog', 'aria-modal': 'true' });
  const scrim = h('div', { class: 'drawer-scrim', onClick: close });

  function setRep(i: number, v: string): void {
    reporters = reporters.map((x, j) => (j === i ? v : x));
  }
  function addRep(): void {
    reporters = [...reporters, ''];
    renderRepField();
  }
  function delRep(i: number): void {
    reporters = reporters.filter((_, j) => j !== i);
    if (reporters.length === 0) reporters = [''];
    renderRepField();
  }

  // Reporter list lives in its own field so we can re-render the rows
  // without nuking focus on the title/date inputs above it.
  const repField = h('div', { class: 'field' });

  function renderRepField(): void {
    const rows = reporters.map((r, i) => {
      const input = h('input', {
        class: 'input',
        placeholder: `報告人 ${i + 1}`,
        value: r,
        onInput: (e: Event) => { setRep(i, (e.currentTarget as HTMLInputElement).value); },
      });
      const delBtn = h('button',
        {
          class: 'btn icon',
          onClick: () => delRep(i),
          'aria-label': '移除',
          disabled: reporters.length === 1 && !r,
        },
        Icon('x', { size: 16 }),
      );
      return h('div', { class: 'rep-row' }, input, delBtn);
    });

    mount(repField as HTMLElement, [
      h('label', null, '報告人員 / 單位報告'),
      ...rows,
      h('button', { class: 'btn sm', onClick: addRep, style: { marginTop: '2px' } },
        Icon('plus', { size: 15 }), '新增報告人',
      ),
      h('div', { class: 'hintline' }, '這些資訊會顯示在簡報封面。'),
    ]);
  }
  renderRepField();

  const head = h('div', { class: 'drawer-head' },
    h('div', { class: 'dh-title' },
      h('div', { class: 'eyebrow' }, '編輯文件資訊'),
      h('h2', null, doc.title),
    ),
    h('button',
      { class: 'btn sm ghost', onClick: () => onOpenExternal(doc), title: '在獨立編輯頁開啟' },
      Icon('external', { size: 15 }), '編輯頁',
    ),
    h('button', { class: 'iconbtn', onClick: close, 'aria-label': '關閉' },
      Icon('x', { size: 18 }),
    ),
  );

  const body = h('div', { class: 'drawer-body' },
    h('div', { class: 'field' },
      h('label', null, '文件標題'),
      h('input', {
        class: 'input',
        value: title,
        onInput: (e: Event) => { title = (e.currentTarget as HTMLInputElement).value; },
      }),
    ),
    h('div', { class: 'field' },
      h('label', null, '簡報日期'),
      h('input', {
        class: 'input',
        type: 'date',
        value: date,
        onInput: (e: Event) => { date = (e.currentTarget as HTMLInputElement).value; },
      }),
    ),
    repField,
    h('div', { class: 'field' },
      h('label', null, '文件 ID'),
      h('input', {
        class: 'input mono',
        value: doc.doc_id,
        readOnly: true,
        style: { color: 'var(--text-3)' },
      }),
    ),
  );

  const foot = h('div', { class: 'drawer-foot' },
    h('div', { class: 'grow' }),
    h('button', { class: 'btn', onClick: close }, '取消'),
    h('button', { class: 'btn primary', onClick: save },
      Icon('check', { size: 16 }), '儲存變更',
    ),
  );

  mount(drawer as HTMLElement, [head, body, foot]);

  document.body.appendChild(scrim);
  document.body.appendChild(drawer);

  const detachEsc = bindEsc(close);

  let removed = false;
  function remove(): void {
    if (removed) return;
    removed = true;
    detachEsc();
    scrim.remove();
    drawer.remove();
  }
  return remove;
}

// ─────────────────────────────────────────────────────────────────────
// KeyboardHelp — read-only cheatsheet overlay.
// ─────────────────────────────────────────────────────────────────────
type KbdRow = [string, string[] | null];

export interface ShowKeyboardHelpOpts {
  onClose: () => void;
}

export function showKeyboardHelp(opts: ShowKeyboardHelpOpts): () => void {
  const { onClose } = opts;

  const close = (): void => {
    remove();
    onClose();
  };

  const rows: KbdRow[] = [
    ['導覽', null],
    ['上 / 下移動焦點', ['J', 'K']],
    ['上 / 下移動焦點', ['↑', '↓']],
    ['開啟所選列', ['Enter']],
    ['聚焦搜尋', ['/']],
    ['切換文件 / 播放清單', ['G']],
    ['顯示此說明', ['?']],
    ['選取', null],
    ['勾選 / 取消目前列', ['X']],
    ['範圍選取', ['⇧', '點按']],
    ['全選 / 取消全選', ['⌘', 'A']],
    ['清除選取 / 關閉', ['Esc']],
    ['操作', null],
    ['重新同步', ['R']],
    ['編輯資訊', ['E']],
    ['切換發佈狀態', ['P']],
    ['複製分享連結', ['C']],
    ['刪除', ['⌫']],
  ];

  const head = h('div',
    {
      class: 'dlg-head',
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    },
    h('h2', { style: { display: 'flex', alignItems: 'center', gap: '9px' } },
      Icon('keyboard', { size: 20 }), '鍵盤快捷鍵',
    ),
    h('button', { class: 'iconbtn', onClick: close, 'aria-label': '關閉' },
      Icon('x', { size: 18 }),
    ),
  );

  const gridChildren: Node[] = rows.map((r) => {
    if (r[1] === null) {
      return h('h4', null, r[0]);
    }
    return h('div', { class: 'kbd-row' },
      h('span', null, r[0]),
      h('span', { class: 'kbd-keys' }, ...r[1].map((k) => h('kbd', null, k))),
    );
  });

  const body = h('div', { class: 'dlg-body' },
    h('div', { class: 'kbd-grid' }, ...gridChildren),
  );

  const dialog = h('div',
    { class: 'dialog kbdhelp', role: 'dialog', 'aria-modal': 'true' },
    head, body,
  );

  const scrim = h('div',
    {
      class: 'scrim',
      onMousedown: (e: MouseEvent) => { if (e.target === e.currentTarget) close(); },
    },
    dialog,
  );

  document.body.appendChild(scrim);

  const detachEsc = bindEsc(close);

  let removed = false;
  function remove(): void {
    if (removed) return;
    removed = true;
    detachEsc();
    scrim.remove();
  }
  return remove;
}
