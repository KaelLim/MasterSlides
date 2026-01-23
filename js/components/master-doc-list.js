import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { store } from '/js/store.js'
import * as documentsApi from '/js/documents.js'
import { fetchGoogleDoc, extractDocIdFromUrl } from '/js/upload.js'
import { toast } from '/js/components/master-toast.js'
import { confirm } from '/js/components/master-confirm.js'

class MasterDocList extends LitElement {
  static properties = {
    mode: { type: String },          // 'full' | 'select'
    selectedIds: { type: Array },     // for select mode
    _docs: { state: true },
    _search: { state: true },
    _filter: { state: true },
    _url: { state: true },
    _uploading: { state: true },
  }

  static styles = css`
    :host { display: block; }

    /* Page heading */
    .page-header { margin-bottom: 32px; }
    .page-header h2 {
      font-size: 30px; font-weight: 900;
      color: #111318; letter-spacing: -0.02em;
    }
    .page-header p { color: #616f89; margin-top: 4px; }

    /* Upload section */
    .upload-card {
      background: #fff;
      border: 1px solid #dbdfe6;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    }
    .upload-card h3 {
      font-size: 16px; font-weight: 700;
      color: #111318; margin-bottom: 16px;
    }
    .upload-row {
      display: flex; gap: 16px; align-items: flex-end;
      flex-wrap: wrap;
    }
    .upload-field { flex: 1; min-width: 280px; }
    .upload-field label {
      display: block; font-size: 13px;
      font-weight: 600; color: #111318;
      margin-bottom: 8px;
    }
    .input-wrap {
      position: relative;
      display: flex; align-items: center;
    }
    .input-wrap .icon {
      position: absolute; left: 14px;
      font-family: 'Material Symbols Outlined'; font-size: 20px;
      color: #616f89;
    }
    .input-wrap input {
      width: 100%; height: 48px;
      padding: 0 16px 0 44px;
      border: 1px solid #dbdfe6;
      border-radius: 8px;
      font-size: 14px; color: #111318;
      background: #fff;
      outline: none; transition: all 0.15s;
      font-family: inherit;
    }
    .input-wrap input:focus { border-color: #135bec; box-shadow: 0 0 0 2px rgba(19,91,236,0.15); }
    .input-wrap input::placeholder { color: #616f89; }
    .btn-fetch {
      display: flex; align-items: center; gap: 8px;
      height: 48px; padding: 0 24px;
      background: #135bec; color: #fff;
      border: none; border-radius: 8px;
      font-size: 14px; font-weight: 700;
      cursor: pointer; white-space: nowrap;
      transition: all 0.15s;
      box-shadow: 0 2px 4px rgba(19,91,236,0.2);
      font-family: inherit;
    }
    .btn-fetch:hover { background: #0f4fd4; }
    .btn-fetch:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-fetch .icon {
      font-family: 'Material Symbols Outlined'; font-size: 20px;
    }

    /* Filter bar */
    .filter-bar {
      display: flex; align-items: center; justify-content: space-between;
      gap: 16px; margin-bottom: 24px; flex-wrap: wrap;
    }
    .filter-left {
      display: flex; align-items: center; gap: 12px;
      flex: 1; min-width: 280px;
    }
    .search-wrap {
      position: relative; flex: 1; max-width: 400px;
    }
    .search-wrap .icon {
      position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      font-family: 'Material Symbols Outlined'; font-size: 20px;
      color: #616f89;
    }
    .search-wrap input {
      width: 100%; height: 40px;
      padding: 0 14px 0 40px;
      border: 1px solid #dbdfe6;
      border-radius: 8px;
      font-size: 13px; color: #111318;
      background: #fff; outline: none;
      transition: all 0.15s;
      font-family: inherit;
      box-sizing: border-box;
    }
    .search-wrap input:focus { border-color: #135bec; box-shadow: 0 0 0 2px rgba(19,91,236,0.1); }
    .filter-select {
      position: relative; z-index: 1;
      height: 40px; padding: 0 32px 0 14px;
      border: 1px solid #dbdfe6;
      border-radius: 8px;
      font-size: 13px; font-weight: 500;
      color: #111318; background: #fff;
      appearance: none; cursor: pointer;
      flex-shrink: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23616f89' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 10px center;
      outline: none;
      font-family: inherit;
    }
    .filter-count { font-size: 13px; color: #616f89; font-weight: 500; white-space: nowrap; }

    /* Card grid */
    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
    }
    .card {
      background: #fff;
      border: 1px solid #dbdfe6;
      border-radius: 12px;
      padding: 20px;
      transition: all 0.2s;
    }
    .card:hover { border-color: rgba(19,91,236,0.4); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
    .card-top {
      display: flex; justify-content: space-between;
      align-items: flex-start; margin-bottom: 16px;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 11px; font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge.public { background: rgba(19,91,236,0.1); color: #135bec; }
    .badge.private { background: #f0f2f4; color: #6b7280; }
    .card-icon {
      font-family: 'Material Symbols Outlined';
      font-size: 22px; color: #dbdfe6;
      transition: color 0.15s;
    }
    .card:hover .card-icon { color: #135bec; }
    .card-title {
      font-size: 16px; font-weight: 700;
      color: #111318; margin-bottom: 4px;
      white-space: nowrap; overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-meta {
      font-size: 12px; color: #616f89;
      display: flex; align-items: center; gap: 4px;
      margin-bottom: 20px;
    }
    .card-meta .icon {
      font-family: 'Material Symbols Outlined';
      font-size: 14px;
    }
    .card-actions {
      display: flex; align-items: center; gap: 8px;
      padding-top: 16px;
      border-top: 1px solid #f0f2f4;
    }
    .btn-play {
      flex: 1;
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px 0;
      background: #135bec; color: #fff;
      border: none; border-radius: 8px;
      font-size: 13px; font-weight: 700;
      cursor: pointer; transition: all 0.15s;
      font-family: inherit;
    }
    .btn-play:hover { background: #0f4fd4; }
    .btn-play .icon { font-family: 'Material Symbols Outlined'; font-size: 16px; }
    .btn-icon {
      width: 40px; height: 40px;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid #dbdfe6;
      border-radius: 8px;
      background: #fff;
      cursor: pointer; transition: all 0.15s;
      color: #616f89;
    }
    .btn-icon:hover { background: #f6f6f8; }
    .btn-icon.lock-active { background: rgba(19,91,236,0.1); color: #135bec; border-color: transparent; }
    .btn-icon.danger { color: #ef4444; }
    .btn-icon.danger:hover { background: #fef2f2; }
    .btn-icon .icon { font-family: 'Material Symbols Outlined'; font-size: 20px; }

    /* Select mode */
    .select-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.1s;
    }
    .select-item:hover { background: rgba(19,91,236,0.05); }
    .select-item input[type="checkbox"] {
      width: 20px; height: 20px;
      accent-color: #135bec;
      cursor: pointer;
    }
    .select-item .info { display: flex; flex-direction: column; }
    .select-item .info .title { font-size: 14px; font-weight: 500; color: #111318; }
    .select-item .info .meta { font-size: 11px; color: #616f89; text-transform: uppercase; margin-top: 2px; }

    .empty { text-align: center; padding: 60px 20px; color: #616f89; }
  `

  constructor() {
    super()
    this.mode = 'full'
    this.selectedIds = []
    this._docs = []
    this._search = ''
    this._filter = 'all'
    this._url = ''
    this._uploading = false
    this._onStoreChange = () => { this._docs = [...store.documents] }
  }

  connectedCallback() {
    super.connectedCallback()
    store.addEventListener('documents-updated', this._onStoreChange)
    this._docs = [...store.documents]
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    store.removeEventListener('documents-updated', this._onStoreChange)
  }

  get _filtered() {
    let docs = this._docs
    if (this._filter === 'public') docs = docs.filter(d => d.is_public)
    else if (this._filter === 'private') docs = docs.filter(d => !d.is_public)
    if (this._search) {
      const q = this._search.toLowerCase()
      docs = docs.filter(d => (d.title || d.doc_id).toLowerCase().includes(q))
    }
    return docs
  }

  async _handleFetch() {
    const docId = extractDocIdFromUrl(this._url)
    if (!docId) { toast.show('Invalid Google Docs URL', 'error'); return }
    this._uploading = true
    try {
      await fetchGoogleDoc({ docId })
      toast.show('Document fetched successfully', 'success')
      this._url = ''
      await store.refreshDocuments()
    } catch (e) {
      toast.show(e.message || 'Fetch failed', 'error')
    }
    this._uploading = false
  }

  async _togglePublic(doc) {
    try {
      await documentsApi.updateDocument(doc.doc_id, { is_public: !doc.is_public })
      await store.refreshDocuments()
    } catch (e) { toast.show(e.message, 'error') }
  }

  async _delete(doc) {
    const ok = await confirm.show({
      title: 'Delete Document',
      message: `"${doc.title || doc.doc_id}" will be permanently deleted.`,
      type: 'danger',
      confirmText: 'Delete',
    })
    if (!ok) return
    try {
      await documentsApi.deleteDocument(doc.doc_id)
      await store.refreshDocuments()
      toast.show('Document deleted', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  _toggleSelect(docId) {
    const set = new Set(this.selectedIds)
    set.has(docId) ? set.delete(docId) : set.add(docId)
    this.selectedIds = [...set]
    this.dispatchEvent(new CustomEvent('selection-change', { detail: this.selectedIds }))
  }

  _formatDate(d) {
    if (!d) return ''
    const dt = new Date(d)
    return dt.toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
      + ' ' + dt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  _timeAgo(d) {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `Updated ${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `Updated ${hrs}h ago`
    const days = Math.floor(hrs / 24)
    if (days < 7) return `Updated ${days}d ago`
    return `Updated ${this._formatDate(d)}`
  }

  render() {
    if (this.mode === 'select') return this._renderSelect()
    const filtered = this._filtered
    const userRole = store.profile?.role
    const canUpload = ROLE_RANK[userRole] >= ROLE_RANK['uploader']

    return html`
      <div class="page-header">
        <h2>Document Management</h2>
        <p>Manage and organize your Google Docs library.</p>
      </div>

      ${canUpload ? html`
        <section class="upload-card">
          <h3>Import Document</h3>
          <div class="upload-row">
            <div class="upload-field">
              <label>Google Docs URL</label>
              <div class="input-wrap">
                <span class="icon">link</span>
                <input
                  type="text"
                  placeholder="https://docs.google.com/document/d/..."
                  .value=${this._url}
                  @input=${e => this._url = e.target.value}
                  @keydown=${e => e.key === 'Enter' && this._handleFetch()}
                />
              </div>
            </div>
            <button class="btn-fetch" ?disabled=${this._uploading} @click=${this._handleFetch}>
              <span class="icon">cloud_download</span>
              <span>${this._uploading ? 'Fetching...' : 'Fetch'}</span>
            </button>
          </div>
        </section>
      ` : ''}

      <div class="filter-bar">
        <div class="filter-left">
          <div class="search-wrap">
            <span class="icon">search</span>
            <input
              type="text"
              placeholder="Search documents..."
              .value=${this._search}
              @input=${e => this._search = e.target.value}
            />
          </div>
          <select class="filter-select" @change=${e => this._filter = e.target.value}>
            <option value="all">All Status</option>
            <option value="public">Public Only</option>
            <option value="private">Private Only</option>
          </select>
        </div>
        <div class="filter-count">Showing ${filtered.length} of ${this._docs.length} documents</div>
      </div>

      ${filtered.length === 0
        ? html`<div class="empty">No documents found</div>`
        : html`
          <div class="card-grid">
            ${filtered.map(doc => this._renderCard(doc))}
          </div>
        `}
    `
  }

  _renderCard(doc) {
    return html`
      <div class="card">
        <div class="card-top">
          <span class="badge ${doc.is_public ? 'public' : 'private'}">
            ${doc.is_public ? 'Public' : 'Private'}
          </span>
          <span class="card-icon">description</span>
        </div>
        <div class="card-title">${doc.title || doc.doc_id}</div>
        <div class="card-meta">
          <span class="icon">history</span>
          ${this._timeAgo(doc.updated_at)}
        </div>
        <div class="card-actions">
          <button class="btn-play" @click=${() => window.open(`/slides.html?src=${doc.doc_id}`, '_blank')}>
            <span class="icon">open_in_new</span> Play
          </button>
          <button class="btn-icon ${doc.is_public ? '' : 'lock-active'}" @click=${() => this._togglePublic(doc)} title="Toggle Privacy">
            <span class="icon">${doc.is_public ? 'lock_open' : 'lock'}</span>
          </button>
          <button class="btn-icon danger" @click=${() => this._delete(doc)} title="Delete">
            <span class="icon">delete</span>
          </button>
        </div>
      </div>
    `
  }

  _renderSelect() {
    const docs = this._docs
    return html`
      ${docs.map(doc => html`
        <label class="select-item">
          <input type="checkbox"
            .checked=${this.selectedIds.includes(doc.doc_id)}
            @change=${() => this._toggleSelect(doc.doc_id)}
          />
          <div class="info">
            <span class="title">${doc.title || doc.doc_id}</span>
            <span class="meta">Google Doc${doc.updated_at ? ` \u2022 ${this._timeAgo(doc.updated_at)}` : ''}</span>
          </div>
        </label>
      `)}
    `
  }
}

const ROLE_RANK = { viewer: 0, uploader: 1, admin: 2, super_admin: 3 }

customElements.define('master-doc-list', MasterDocList)
