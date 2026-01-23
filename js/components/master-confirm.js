import { LitElement, html, css } from 'https://esm.sh/lit@3'

class MasterConfirm extends LitElement {
  static properties = {
    _open: { state: true },
    _opts: { state: true },
  }

  static styles = css`
    :host { display: block; position: fixed; inset: 0; z-index: 10001; pointer-events: none; }
    :host([open]) { pointer-events: auto; }

    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.5);
      backdrop-filter: blur(2px);
      opacity: 0; transition: opacity 0.15s;
    }
    :host([open]) .overlay { opacity: 1; }

    .dialog {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) scale(0.95);
      width: 90%; max-width: 400px;
      background: #fff;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.15);
      opacity: 0; transition: all 0.2s;
      text-align: center;
    }
    :host([open]) .dialog { opacity: 1; transform: translate(-50%, -50%) scale(1); }

    .icon-circle {
      width: 56px; height: 56px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 20px;
    }
    .icon-circle.danger { background: #fef2f2; }
    .icon-circle.warning { background: #fffbeb; }
    .icon-circle.info { background: rgba(19,91,236,0.1); }
    .icon-circle .icon {
      font-family: 'Material Symbols Outlined'; font-size: 28px;
    }
    .icon-circle.danger .icon { color: #ef4444; }
    .icon-circle.warning .icon { color: #f59e0b; }
    .icon-circle.info .icon { color: #135bec; }

    h3 { font-size: 18px; font-weight: 700; color: #111318; margin-bottom: 8px; }
    p { font-size: 14px; color: #616f89; line-height: 1.5; margin-bottom: 28px; }

    .actions { display: flex; gap: 12px; }
    .btn {
      flex: 1; height: 44px;
      border-radius: 8px;
      font-size: 14px; font-weight: 700;
      cursor: pointer; transition: all 0.15s;
      border: none; font-family: inherit;
    }
    .btn-ghost {
      background: #fff;
      border: 1px solid #dbdfe6;
      color: #111318;
    }
    .btn-ghost:hover { background: #f6f6f8; }
    .btn-danger { background: #ef4444; color: #fff; }
    .btn-danger:hover { background: #dc2626; }
    .btn-primary { background: #135bec; color: #fff; }
    .btn-primary:hover { background: #0f4fd4; }
    .btn-warning { background: #f59e0b; color: #fff; }
    .btn-warning:hover { background: #d97706; }
  `

  constructor() {
    super()
    this._open = false
    this._opts = {}
    this._resolve = null
  }

  show(opts) {
    this._opts = opts
    this._open = true
    this.setAttribute('open', '')
    return new Promise(resolve => { this._resolve = resolve })
  }

  _respond(value) {
    this._open = false
    this.removeAttribute('open')
    this._resolve?.(value)
  }

  _getIcon(type) {
    if (type === 'danger') return 'warning'
    if (type === 'warning') return 'error_outline'
    return 'info'
  }

  render() {
    const { title, message, type = 'danger', confirmText = 'Confirm' } = this._opts
    const btnClass = type === 'danger' ? 'btn-danger' : type === 'warning' ? 'btn-warning' : 'btn-primary'
    return html`
      <div class="overlay" @click=${() => this._respond(false)}></div>
      <div class="dialog">
        <div class="icon-circle ${type}">
          <span class="icon">${this._getIcon(type)}</span>
        </div>
        <h3>${title || 'Confirm'}</h3>
        <p>${message || 'Are you sure?'}</p>
        <div class="actions">
          <button class="btn btn-ghost" @click=${() => this._respond(false)}>Cancel</button>
          <button class="btn ${btnClass}" @click=${() => this._respond(true)}>${confirmText}</button>
        </div>
      </div>
    `
  }
}

customElements.define('master-confirm', MasterConfirm)

let _instance = null
export const confirm = {
  get _el() {
    if (!_instance) {
      _instance = document.createElement('master-confirm')
      document.body.appendChild(_instance)
    }
    return _instance
  },
  show(opts) { return this._el.show(opts) },
}
