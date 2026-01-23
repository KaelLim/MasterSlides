import { LitElement, html, css } from 'https://esm.sh/lit@3'

const ROLE_LEVELS = { viewer: 0, uploader: 1, admin: 2, super_admin: 3 }

const NAV_ITEMS = [
  { key: 'upload', label: '上傳簡報', minRole: 'uploader', icon: 'upload', href: '/dashboard/upload.html' },
  { key: 'documents', label: '簡報列表', minRole: 'viewer', icon: 'docs', href: '/dashboard/documents.html' },
  { key: 'playlists', label: '播放清單', minRole: 'admin', icon: 'playlist', href: '/dashboard/playlists.html' },
  { key: 'users', label: '用戶管理', minRole: 'super_admin', icon: 'users', href: '/dashboard/users.html' },
]

const ICONS = {
  upload: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`,
  docs: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  playlist: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`,
  users: html`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
}

class MasterSidebar extends LitElement {
  static properties = {
    role: { type: String },
    active: { type: String },
    email: { type: String },
  }

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0;
      left: 0;
      width: 220px;
      height: 100vh;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-right: 1px solid rgba(255, 255, 255, 0.1);
      z-index: 100;
      display: flex;
      flex-direction: column;
    }

    .brand {
      padding: 24px 20px 16px;
      font-size: 18px;
      font-weight: 700;
      color: #FFD700;
      letter-spacing: 0.5px;
    }

    nav {
      flex: 1;
      padding: 8px 0;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: all 0.2s;
      font-size: 14px;
    }

    .nav-item:hover {
      color: white;
      background: rgba(255, 255, 255, 0.08);
    }

    .nav-item.active {
      color: #5FCFC3;
      border-left-color: #5FCFC3;
      background: rgba(95, 207, 195, 0.1);
    }

    .nav-item svg {
      flex-shrink: 0;
    }

    .footer {
      padding: 16px 20px;
      border-top: 1px solid rgba(255,255,255,0.08);
    }

    .user-email {
      display: block;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .btn-logout {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      width: 100%;
      transition: all 0.2s;
    }

    .btn-logout:hover {
      background: rgba(231, 76, 60, 0.2);
      border-color: rgba(231, 76, 60, 0.5);
      color: #e74c3c;
    }
  `

  constructor() {
    super()
    this.role = 'viewer'
    this.active = 'documents'
    this.email = ''
  }

  _hasAccess(minRole) {
    return (ROLE_LEVELS[this.role] || 0) >= (ROLE_LEVELS[minRole] || 0)
  }

  _navigate(item) {
    location.href = item.href
  }

  async _logout() {
    const { getSupabase } = await import('/js/supabase-client.js')
    const supabase = await getSupabase()
    await supabase.auth.signOut()
    location.href = '/login.html'
  }

  render() {
    const items = NAV_ITEMS.filter(item => this._hasAccess(item.minRole))

    return html`
      <div class="brand">MasterSlides</div>
      <nav>
        ${items.map(item => html`
          <div class="nav-item ${this.active === item.key ? 'active' : ''}"
               @click=${() => this._navigate(item)}>
            ${ICONS[item.icon]}
            <span>${item.label}</span>
          </div>
        `)}
      </nav>
      <div class="footer">
        <span class="user-email">${this.email}</span>
        <button class="btn-logout" @click=${this._logout}>登出</button>
      </div>
    `
  }
}

customElements.define('master-sidebar', MasterSidebar)
