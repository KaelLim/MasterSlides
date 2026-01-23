import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { getSupabase } from '/js/supabase-client.js'
import { toast } from '/js/components/master-toast.js'

const ROLES = ['viewer', 'uploader', 'admin', 'super_admin']
const ROLE_LABELS = { viewer: 'Viewer', uploader: 'Uploader', admin: 'Admin', super_admin: 'Super Admin' }

class MasterUserManager extends LitElement {
  static properties = {
    _users: { state: true },
    _search: { state: true },
    _currentUserId: { state: true },
  }

  static styles = css`
    :host { display: block; }

    .page-header { margin-bottom: 24px; }
    .page-header h2 {
      font-size: 30px; font-weight: 900;
      color: #111318; letter-spacing: -0.02em;
    }
    .page-header p { color: #616f89; margin-top: 4px; }

    .search-card {
      display: flex; align-items: center; gap: 12px;
      background: #fff; padding: 16px;
      border: 1px solid #dbdfe6; border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .search-field {
      flex: 1; display: flex; align-items: center;
      background: #f0f2f4; border-radius: 8px;
      padding: 0 16px; height: 44px;
    }
    .search-field .icon {
      font-family: 'Material Symbols Outlined'; font-size: 20px;
      color: #616f89; margin-right: 8px;
    }
    .search-field input {
      flex: 1; border: none; background: transparent;
      font-size: 14px; color: #111318; outline: none;
      font-family: inherit;
    }
    .search-field input::placeholder { color: #616f89; }

    .table-card {
      background: #fff;
      border: 1px solid #dbdfe6;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    table {
      width: 100%; border-collapse: collapse;
      text-align: left;
    }
    thead tr {
      background: rgba(246,246,248,0.5);
      border-bottom: 1px solid #dbdfe6;
    }
    th {
      padding: 16px 24px;
      font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: #616f89;
    }
    tbody tr {
      border-bottom: 1px solid #f0f2f4;
      transition: background 0.1s;
    }
    tbody tr:last-child { border-bottom: none; }
    tbody tr:hover { background: rgba(246,246,248,0.5); }
    tbody tr.is-current { background: rgba(19,91,236,0.03); }
    td { padding: 16px 24px; font-size: 14px; }
    .email-cell {
      display: flex; flex-direction: column;
    }
    .email-text { font-weight: 600; color: #111318; display: flex; align-items: center; gap: 8px; }
    .you-badge {
      background: rgba(19,91,236,0.1); color: #135bec;
      font-size: 11px; font-weight: 600;
      padding: 2px 8px; border-radius: 4px;
    }
    .date-text { color: #616f89; font-size: 13px; }
    .role-select {
      height: 36px; padding: 0 12px;
      border: none; border-radius: 8px;
      background: #f0f2f4; color: #111318;
      font-size: 13px; font-weight: 500;
      cursor: pointer; width: 140px;
      font-family: inherit;
    }
    .role-select:focus { outline: none; box-shadow: 0 0 0 2px rgba(19,91,236,0.2); }
    .role-select:disabled { opacity: 0.6; cursor: not-allowed; }

    .table-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 24px;
      border-top: 1px solid #f0f2f4;
      background: rgba(246,246,248,0.3);
    }
    .footer-count { font-size: 12px; color: #616f89; }

    .security-note {
      margin-top: 24px;
      padding: 16px;
      background: rgba(19,91,236,0.05);
      border: 1px solid rgba(19,91,236,0.15);
      border-radius: 12px;
      display: flex; align-items: flex-start; gap: 12px;
    }
    .security-note .icon {
      font-family: 'Material Symbols Outlined';
      font-size: 20px; color: #135bec;
      flex-shrink: 0;
    }
    .security-note .note-title { font-size: 14px; font-weight: 600; color: #135bec; }
    .security-note .note-text { font-size: 12px; color: rgba(19,91,236,0.7); margin-top: 2px; }
  `

  constructor() {
    super()
    this._users = []
    this._search = ''
    this._currentUserId = null
  }

  async connectedCallback() {
    super.connectedCallback()
    await this._loadUsers()
  }

  async _loadUsers() {
    const supabase = await getSupabase()
    const { data: { session } } = await supabase.auth.getSession()
    this._currentUserId = session?.user?.id

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) { toast.show(error.message, 'error'); return }
    this._users = data || []
  }

  get _filtered() {
    if (!this._search) return this._users
    const q = this._search.toLowerCase()
    return this._users.filter(u => (u.email || u.id).toLowerCase().includes(q))
  }

  async _changeRole(user, newRole) {
    const supabase = await getSupabase()
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', user.id)

    if (error) { toast.show(error.message, 'error'); return }
    toast.show(`Role updated to ${ROLE_LABELS[newRole]}`, 'success')
    await this._loadUsers()
  }

  _formatDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
  }

  render() {
    const users = this._filtered
    return html`
      <div class="page-header">
        <h2>User Management</h2>
        <p>Manage enterprise roles and Google Docs integration permissions.</p>
      </div>

      <div class="search-card">
        <div class="search-field">
          <span class="icon">search</span>
          <input type="text"
            placeholder="Search users by email address..."
            .value=${this._search}
            @input=${e => this._search = e.target.value}
          />
        </div>
      </div>

      <div class="table-card">
        <table>
          <thead>
            <tr>
              <th>User Email</th>
              <th>Created Date</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => html`
              <tr class=${u.id === this._currentUserId ? 'is-current' : ''}>
                <td>
                  <div class="email-cell">
                    <span class="email-text">
                      ${u.email || u.id}
                      ${u.id === this._currentUserId ? html`<span class="you-badge">You</span>` : ''}
                    </span>
                  </div>
                </td>
                <td class="date-text">${this._formatDate(u.created_at)}</td>
                <td>
                  <select class="role-select"
                    ?disabled=${u.id === this._currentUserId}
                    @change=${e => this._changeRole(u, e.target.value)}
                  >
                    ${ROLES.map(r => html`
                      <option value=${r} ?selected=${u.role === r}>${ROLE_LABELS[r]}</option>
                    `)}
                  </select>
                </td>
              </tr>
            `)}
          </tbody>
        </table>
        <div class="table-footer">
          <span class="footer-count">Showing ${users.length} of ${this._users.length} users</span>
        </div>
      </div>

      <div class="security-note">
        <span class="icon">info</span>
        <div>
          <div class="note-title">Security Note</div>
          <div class="note-text">Role changes take effect immediately. Upgrading users to 'Admin' or 'Super Admin' grants access to sensitive platform settings.</div>
        </div>
      </div>
    `
  }
}

customElements.define('master-user-manager', MasterUserManager)
