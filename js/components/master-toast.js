import { LitElement, html, css } from 'https://esm.sh/lit@3'

class MasterToast extends LitElement {
  static properties = {
    _messages: { state: true },
  }

  static styles = css`
    :host {
      position: fixed;
      bottom: 32px;
      right: 32px;
      z-index: 10000;
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      display: flex; align-items: center; gap: 12px;
      padding: 16px 20px;
      background: #111318;
      color: #fff;
      border-radius: 12px;
      font-size: 14px; font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.2);
      animation: slide-up 0.25s ease;
      pointer-events: auto;
      max-width: 400px;
      letter-spacing: -0.01em;
    }
    .toast.fade-out {
      animation: fade-out 0.2s ease forwards;
    }
    .icon {
      font-family: 'Material Symbols Outlined';
      font-size: 22px;
      flex-shrink: 0;
    }
    .icon.success { color: #4ade80; }
    .icon.error { color: #f87171; }
    .icon.info { color: #60a5fa; }
    .msg { flex: 1; }
    .btn-close {
      background: transparent; border: none;
      color: rgba(255,255,255,0.4);
      cursor: pointer; padding: 2px;
      transition: color 0.15s;
      display: flex; align-items: center;
    }
    .btn-close:hover { color: #fff; }
    .btn-close .icon { font-size: 18px; color: inherit; }

    @keyframes slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes fade-out {
      from { opacity: 1; }
      to { opacity: 0; transform: translateY(10px); }
    }
  `

  constructor() {
    super()
    this._messages = []
  }

  _getIcon(type) {
    if (type === 'success') return 'check_circle'
    if (type === 'error') return 'error'
    return 'info'
  }

  _dismiss(id) {
    this._messages = this._messages.map(m =>
      m.id === id ? { ...m, fading: true } : m
    )
    setTimeout(() => {
      this._messages = this._messages.filter(m => m.id !== id)
    }, 200)
  }

  addMessage({ message, type = 'info', duration = 3500 }) {
    const id = Date.now() + Math.random()
    this._messages = [...this._messages, { id, message, type, fading: false }]
    setTimeout(() => {
      if (this._messages.find(m => m.id === id && !m.fading)) {
        this._dismiss(id)
      }
    }, duration)
  }

  render() {
    return html`
      ${this._messages.map(m => html`
        <div class="toast ${m.fading ? 'fade-out' : ''}">
          <span class="icon ${m.type}">${this._getIcon(m.type)}</span>
          <span class="msg">${m.message}</span>
          <button class="btn-close" @click=${() => this._dismiss(m.id)}>
            <span class="icon">close</span>
          </button>
        </div>
      `)}
    `
  }
}

customElements.define('master-toast', MasterToast)

export const toast = {
  show(message, type = 'info', duration = 3500) {
    let el = document.querySelector('master-toast')
    if (!el) {
      el = document.createElement('master-toast')
      document.body.appendChild(el)
    }
    el.addMessage({ message, type, duration })
  }
}
