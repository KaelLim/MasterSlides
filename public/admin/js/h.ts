// Tiny DOM-creation helper. No virtual DOM, no diffing — components are
// functions returning HTMLElements; re-renders happen by full subtree
// replacement via mount() below.
//
// API roughly mirrors React.createElement: tag name, props (event handlers
// use the lowercase DOM property name without the `on` prefix removed —
// e.g. `onClick`, `onInput`), then children (nodes, strings, arrays,
// nullish values are pruned). Use this in place of JSX when porting
// React prototypes to vanilla TS.

export type Child = Node | string | number | null | undefined | false | Child[];

type AnyProps = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: AnyProps | null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  applyProps(el as Element, props);
  appendChildren(el as Element, children);
  return el;
}

export function svg(
  tag: string,
  props?: AnyProps | null,
  ...children: Child[]
): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag) as SVGElement;
  applyProps(el, props, true);
  appendChildren(el, children);
  return el;
}

function applyProps(el: Element, props: AnyProps | null | undefined, isSvg = false): void {
  if (!props) return;
  for (const key of Object.keys(props)) {
    const v = props[key];
    if (v == null) continue;

    // ARIA tristate attributes (and a few HTML attrs that ALSO require an
    // explicit "true"/"false" string rather than presence-or-absence): when
    // a boolean comes in, write the literal string. Without this, our CSS
    // selectors like [aria-selected="true"] never match (boolean true → "").
    if (typeof v === 'boolean' && (
      key.startsWith('aria-') || key === 'draggable' || key === 'contenteditable' || key === 'spellcheck'
    )) {
      el.setAttribute(key, v ? 'true' : 'false');
      continue;
    }
    // For non-ARIA boolean attributes (disabled, hidden, required, ...),
    // false = absent, true = empty-string attribute (standard HTML).
    if (v === false) continue;

    if (key === 'class' || key === 'className') {
      el.setAttribute('class', String(v));
    } else if (key === 'style' && typeof v === 'object' && v !== null) {
      Object.assign((el as HTMLElement).style, v as Record<string, string>);
    } else if (key === 'dataset' && typeof v === 'object' && v !== null) {
      for (const [dk, dv] of Object.entries(v as Record<string, string>)) {
        (el as HTMLElement).dataset[dk] = dv;
      }
    } else if (key.startsWith('on') && typeof v === 'function') {
      // onClick → 'click', onMouseDown → 'mousedown'
      el.addEventListener(key.slice(2).toLowerCase(), v as EventListener);
    } else if (typeof v === 'boolean') {
      if (v) el.setAttribute(key, '');
    } else if (isSvg) {
      el.setAttribute(key, String(v));
    } else {
      // Prefer property assignment for common DOM properties so values
      // like .value / .checked / .disabled flow correctly.
      const k = key === 'htmlFor' ? 'for' : key;
      if (k in el && k !== 'list' && k !== 'role' && k !== 'type' && k !== 'href') {
        (el as unknown as Record<string, unknown>)[k] = v;
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
}

function appendChildren(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) appendChildren(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

// Replace `host`'s children with a freshly rendered fragment.
export function mount(host: HTMLElement, node: Node | Node[]): void {
  host.replaceChildren(...(Array.isArray(node) ? node : [node]));
}
