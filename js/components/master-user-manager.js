import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { getSupabase } from '/js/supabase-client.js'
import { toast } from '/js/components/master-toast.js'

const ROLES = ['viewer', 'uploader', 'admin', 'super_admin']

class MasterUserManager extends LitElement {
  static properties = {
    _users: { state: true },
    _loading: { state: true },
  }

  static styles = css`
    :host { display: block; }

    h2 {
      color: white;
      margin: 0 0 20px;
      font-size: 20px;
      font-weight: 600;
    }

    .table-container {
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 500px;
    }

    th {
      text-align: left;
      padding: 14px 16px;
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    td {
      padding: 12px 16px;
      color: white;
      font-size: 14px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    tr:hover td {
      background: rgba(255, 255, 255, 0.03);
    }

    .email { color: #5FCFC3; }
    .name { color: white; }
    .date { color: rgba(255, 255, 255, 0.5); font-size: 12px; }

    select {
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      font-size: 13px;
      cursor: pointer;
      outline: none;
    }

    select:focus { border-color: #5FCFC3; }

    select option {
      background: #1a1a2e;
      color: white;
    }

    .loading {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      padding: 24px;
      text-align: center;
    }
  `

  constructor() {
    super()
    this._users = []
    this._loading = true
    this._loadUsers()
  }

  async _loadUsers() {
    this._loading = true
    try {
      const supabase = await getSupabase()
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })
      if (error) throw error
      this._users = data || []
    } catch (err) {
      toast.show(`載入用戶失敗: ${err.message}`, 'error')
    }
    this._loading = false
  }

  async _changeRole(userId, newRole) {
    try {
      const supabase = await getSupabase()
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId)
      if (error) throw error
      this._users = this._users.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      )
      toast.show(`角色已更新為 ${newRole}`, 'success')
    } catch (err) {
      toast.show(err.message, 'error')
    }
  }

  _formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
  }

  render() {
    if (this._loading) {
      return html`<h2>用戶管理</h2><div class="loading">載入中...</div>`
    }

    return html`
      <h2>用戶管理</h2>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>名稱</th>
              <th>角色</th>
              <th>建立時間</th>
            </tr>
          </thead>
          <tbody>
            ${this._users.map(u => html`
              <tr>
                <td class="email">${u.email || '-'}</td>
                <td class="name">${u.display_name || '-'}</td>
                <td>
                  <select .value=${u.role}
                          @change=${e => this._changeRole(u.id, e.target.value)}>
                    ${ROLES.map(r => html`
                      <option value=${r} ?selected=${u.role === r}>${r}</option>
                    `)}
                  </select>
                </td>
                <td class="date">${this._formatDate(u.created_at)}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>
    `
  }
}

customElements.define('master-user-manager', MasterUserManager)
