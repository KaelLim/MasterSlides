import { LitElement, html, css } from 'https://esm.sh/lit@3'

class MasterToast extends LitElement {
  static properties = {
    _messages: { state: true },
  }

  static styles = css`
    :host {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 10000;
      display: flex;
      flex-direction: column-reverse;
      gap: 8px;
      pointer-events: none;
    }

    .toast {
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      color: #fff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      animation: slide-in 0.3s ease;
      pointer-events: auto;
      max-width: 360px;
    }

    .toast.fade-out {
      animation: fade-out 0.3s ease forwards;
    }

    .toast.success { background: #1a6b63; border-left: 4px solid #5FCFC3; }
    .toast.error { background: #6b1a1a; border-left: 4px solid #e74c3c; }
    .toast.info { background: #1a2a4a; border-left: 4px solid #5FCFC3; }

    @keyframes slide-in {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
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

  addMessage({ message, type = 'info', duration = 3000 }) {
    const id = Date.now() + Math.random()
    this._messages = [...this._messages, { id, message, type, fading: false }]

    setTimeout(() => {
      this._messages = this._messages.map(m =>
        m.id === id ? { ...m, fading: true } : m
      )
      setTimeout(() => {
        this._messages = this._messages.filter(m => m.id !== id)
      }, 300)
    }, duration)
  }

  render() {
    return html`
      ${this._messages.map(m => html`
        <div class="toast ${m.type} ${m.fading ? 'fade-out' : ''}">
          ${m.message}
        </div>
      `)}
    `
  }
}

customElements.define('master-toast', MasterToast)

export const toast = {
  show(message, type = 'info', duration = 3000) {
    let el = document.querySelector('master-toast')
    if (!el) {
      el = document.createElement('master-toast')
      document.body.appendChild(el)
    }
    el.addMessage({ message, type, duration })
  }
}
