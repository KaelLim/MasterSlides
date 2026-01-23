import { LitElement, html, css } from 'https://esm.sh/lit@3'

const NAV_ITEMS = [
  { key: 'documents', label: 'Documents', icon: 'description', minRole: 'viewer', href: '/dashboard/documents.html' },
  { key: 'playlists', label: 'Playlists', icon: 'playlist_play', minRole: 'admin', href: '/dashboard/playlists.html' },
  { key: 'users', label: 'User Management', icon: 'manage_accounts', minRole: 'super_admin', href: '/dashboard/users.html' },
]

const ROLE_RANK = { viewer: 0, uploader: 1, admin: 2, super_admin: 3 }

class MasterSidebar extends LitElement {
  static properties = {
    role: { type: String },
    email: { type: String },
    active: { type: String },
  }

  static styles = css`
    :host {
      display: block;
      position: fixed;
      top: 0; left: 0;
      width: 288px;
      height: 100vh;
      z-index: 100;
    }
    aside {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
      border-right: 1px solid #dbdfe6;
    }
    .brand {
      padding: 24px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 40px; height: 40px;
      background: rgba(19, 91, 236, 0.1);
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
    }
    .brand-icon .icon { font-size: 28px; color: #135bec; }
    .brand-text h1 { font-size: 16px; font-weight: 700; color: #111318; }
    .brand-text p { font-size: 11px; color: #616f89; margin-top: 2px; }
    nav {
      flex: 1;
      padding: 8px 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    nav a {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px;
      border-radius: 8px;
      text-decoration: none;
      font-size: 14px; font-weight: 500;
      color: #616f89;
      transition: all 0.15s;
    }
    nav a:hover { background: #f0f2f4; }
    nav a.active {
      background: #135bec;
      color: #fff;
      font-weight: 600;
    }
    nav a.active .icon {
      font-variation-settings: 'FILL' 1, 'wght' 400, 'GRAD' 0, 'opsz' 24;
    }
    .icon {
      font-family: 'Material Symbols Outlined';
      font-size: 22px;
      font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
    }
    .user-footer {
      padding: 16px;
      border-top: 1px solid #dbdfe6;
    }
    .user-info {
      display: flex; align-items: center; gap: 12px;
      padding: 8px;
    }
    .avatar {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: #f0f2f4;
      display: flex; align-items: center; justify-content: center;
      font-size: 15px; font-weight: 600; color: #616f89;
      flex-shrink: 0;
    }
    .user-details { flex: 1; min-width: 0; }
    .user-details .name {
      font-size: 14px; font-weight: 600; color: #111318;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .user-details .email {
      font-size: 12px; color: #616f89;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .btn-logout {
      background: transparent; border: none;
      color: #616f89; cursor: pointer;
      padding: 6px; border-radius: 6px;
      transition: all 0.15s;
      display: flex; align-items: center;
    }
    .btn-logout:hover { color: #111318; background: #f0f2f4; }
  `

  _visibleItems() {
    const rank = ROLE_RANK[this.role] ?? 0
    return NAV_ITEMS.filter(it => rank >= ROLE_RANK[it.minRole])
  }

  async _logout() {
    const { getSupabase } = await import('/js/supabase-client.js')
    const supabase = await getSupabase()
    await supabase.auth.signOut()
    location.href = '/login.html'
  }

  render() {
    const items = this._visibleItems()
    const initial = (this.email || '?')[0].toUpperCase()
    return html`
      <aside>
        <div class="brand">
          <div class="brand-icon"><span class="icon">folder_managed</span></div>
          <div class="brand-text">
            <h1>MasterSlides</h1>
            <p>Admin Dashboard</p>
          </div>
        </div>
        <nav>
          ${items.map(it => html`
            <a href=${it.href} class=${this.active === it.key ? 'active' : ''}>
              <span class="icon">${it.icon}</span>
              <span>${it.label}</span>
            </a>
          `)}
        </nav>
        <div class="user-footer">
          <div class="user-info">
            <div class="avatar">${initial}</div>
            <div class="user-details">
              <div class="name">${this.email?.split('@')[0] || ''}</div>
              <div class="email">${this.email || ''}</div>
            </div>
            <button class="btn-logout" @click=${this._logout} title="Logout">
              <span class="icon">logout</span>
            </button>
          </div>
        </div>
      </aside>
    `
  }
}

customElements.define('master-sidebar', MasterSidebar)
