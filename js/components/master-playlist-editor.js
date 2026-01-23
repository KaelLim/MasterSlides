import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { store } from '/js/store.js'
import * as playlistsApi from '/js/playlists.js'
import { toast } from '/js/components/master-toast.js'

class MasterPlaylistEditor extends LitElement {
  static properties = {
    playlistId: { type: String },
    _name: { state: true },
    _desc: { state: true },
    _selectedIds: { state: true },
    _docs: { state: true },
    _search: { state: true },
    _sort: { state: true },
    _range: { state: true },
    _saving: { state: true },
    _dragIdx: { state: true },
  }

  static styles = css`
    :host { display: block; position: fixed; inset: 0; z-index: 9000; }
    .overlay {
      position: absolute; inset: 0;
      background: rgba(0,0,0,0.6);
      backdrop-filter: blur(4px);
    }
    .modal {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 95%; max-width: 1000px;
      height: 85vh;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
      display: flex; flex-direction: column;
      overflow: hidden;
    }

    /* Header */
    .modal-header {
      padding: 24px; border-bottom: 1px solid #dbdfe6;
    }
    .header-top {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 20px;
    }
    .header-top h2 { font-size: 22px; font-weight: 700; color: #111318; }
    .header-top p { font-size: 13px; color: #616f89; margin-top: 4px; }
    .btn-close {
      background: transparent; border: none;
      color: #616f89; cursor: pointer; padding: 4px;
      transition: color 0.15s;
    }
    .btn-close:hover { color: #111318; }
    .btn-close .icon { font-family: 'Material Symbols Outlined'; font-size: 24px; }
    .form-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
    }
    .form-row label { display: flex; flex-direction: column; gap: 6px; }
    .form-row .label-text { font-size: 13px; font-weight: 500; color: #111318; }
    .form-row input {
      height: 44px; padding: 0 16px;
      border: 1px solid #dbdfe6; border-radius: 8px;
      font-size: 14px; color: #111318;
      outline: none; font-family: inherit;
    }
    .form-row input:focus { border-color: #135bec; box-shadow: 0 0 0 2px rgba(19,91,236,0.1); }

    /* Body columns */
    .modal-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }

    /* Left column */
    .col-left {
      flex: 1; display: flex; flex-direction: column;
      border-right: 1px solid #dbdfe6;
    }
    .col-header {
      padding: 16px;
      border-bottom: 1px solid #dbdfe6;
      background: rgba(246,246,248,0.5);
    }
    .col-header-row {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 12px;
    }
    .col-title {
      font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em;
      color: #616f89;
    }
    .col-count { font-size: 12px; color: #616f89; }
    .col-search {
      position: relative;
    }
    .col-search .icon {
      position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      font-family: 'Material Symbols Outlined'; font-size: 20px; color: #616f89;
    }
    .col-search input {
      width: 100%; height: 36px;
      padding: 0 12px 0 38px;
      border: 1px solid #dbdfe6; border-radius: 8px;
      font-size: 13px; color: #111318;
      outline: none; font-family: inherit;
      box-sizing: border-box;
    }
    .col-search input:focus { border-color: #135bec; }
    .col-filters {
      display: flex; gap: 8px; margin-top: 10px;
    }
    .col-filters select {
      height: 32px; padding: 0 24px 0 8px;
      border: 1px solid #dbdfe6; border-radius: 6px;
      font-size: 12px; font-weight: 500;
      color: #111318; background: #fff;
      appearance: none; cursor: pointer;
      flex-shrink: 0; outline: none;
      font-family: inherit;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%23616f89' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 6px center;
    }
    .doc-list {
      flex: 1; overflow-y: auto; padding: 8px;
    }
    .doc-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px; border-radius: 8px;
      cursor: pointer; transition: background 0.1s;
    }
    .doc-item:hover { background: rgba(19,91,236,0.05); }
    .doc-item input[type="checkbox"] {
      width: 20px; height: 20px;
      accent-color: #135bec; cursor: pointer;
      flex-shrink: 0;
    }
    .doc-item .doc-name {
      font-size: 14px; font-weight: 500; color: #111318;
      flex: 1; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* Right column */
    .col-right {
      flex: 1; display: flex; flex-direction: column;
      background: #f6f6f8;
    }
    .col-right .col-header { background: #fff; }
    .selected-badge {
      background: rgba(19,91,236,0.1); color: #135bec;
      font-size: 10px; font-weight: 700;
      padding: 2px 8px; border-radius: 9999px;
    }
    .selected-list { flex: 1; overflow-y: auto; padding: 16px; }
    .selected-list .s-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px; margin-bottom: 12px;
      background: #fff; border: 1px solid #dbdfe6;
      border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);
      transition: opacity 0.15s, border-color 0.15s;
    }
    .s-item.dragging { opacity: 0.4; }
    .s-item.drag-over { border-color: #135bec; background: rgba(19,91,236,0.03); }
    .s-item .grip {
      font-family: 'Material Symbols Outlined'; font-size: 20px;
      color: #616f89; cursor: grab;
    }
    .s-item .grip:active { cursor: grabbing; }
    .s-item .num {
      width: 24px; height: 24px;
      background: rgba(19,91,236,0.1); color: #135bec;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 700;
      flex-shrink: 0;
    }
    .s-item .s-name { flex: 1; font-size: 14px; font-weight: 500; color: #111318; }
    .s-item .btn-remove {
      background: transparent; border: none;
      color: #616f89; cursor: pointer;
      opacity: 0; transition: all 0.15s; padding: 4px;
    }
    .s-item:hover .btn-remove { opacity: 1; }
    .s-item .btn-remove:hover { color: #ef4444; }
    .s-item .btn-remove .icon { font-family: 'Material Symbols Outlined'; font-size: 18px; }

    .empty-selected {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      height: 200px; text-align: center;
    }
    .empty-selected .icon {
      font-family: 'Material Symbols Outlined'; font-size: 48px;
      color: #616f89; margin-bottom: 8px;
    }
    .empty-selected p { font-size: 13px; color: #616f89; }
    .empty-selected .sub { font-size: 11px; color: rgba(97,111,137,0.6); margin-top: 4px; }

    /* Footer */
    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #dbdfe6;
      display: flex; justify-content: space-between; align-items: center;
      background: #fff;
    }
    .footer-info {
      display: flex; align-items: center; gap: 8px;
      font-size: 12px; color: #616f89;
    }
    .footer-info .icon { font-family: 'Material Symbols Outlined'; font-size: 16px; }
    .footer-actions { display: flex; gap: 12px; }
    .btn-cancel {
      padding: 10px 20px;
      border: 1px solid #dbdfe6; border-radius: 8px;
      background: #fff; color: #111318;
      font-size: 14px; font-weight: 700;
      cursor: pointer; transition: all 0.15s;
      font-family: inherit;
    }
    .btn-cancel:hover { background: #f6f6f8; }
    .btn-save {
      padding: 10px 24px;
      background: #135bec; color: #fff;
      border: none; border-radius: 8px;
      font-size: 14px; font-weight: 700;
      cursor: pointer; transition: all 0.15s;
      box-shadow: 0 4px 8px rgba(19,91,236,0.2);
      font-family: inherit;
    }
    .btn-save:hover { background: #0f4fd4; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
  `

  constructor() {
    super()
    this._name = ''
    this._desc = ''
    this._selectedIds = []
    this._docs = []
    this._search = ''
    this._sort = 'newest'
    this._range = 'all'
    this._saving = false
    this._dragIdx = -1
  }

  async connectedCallback() {
    super.connectedCallback()
    this._docs = [...store.documents]
    if (this.playlistId) {
      try {
        const data = await playlistsApi.getWithDocuments(this.playlistId, { publicOnly: false })
        const pl = store.playlists.find(p => p.id === this.playlistId)
        if (pl) {
          this._name = pl.name || ''
          this._desc = pl.description || ''
        }
        this._selectedIds = data.map(d => d.doc_id)
      } catch (e) {
        toast.show('Failed to load playlist', 'error')
      }
    }
  }

  get _filteredDocs() {
    let docs = this._docs

    // Time range filter
    if (this._range !== 'all') {
      const now = Date.now()
      const days = this._range === '7d' ? 7 : this._range === '30d' ? 30 : 365
      const cutoff = now - days * 86400000
      docs = docs.filter(d => new Date(d.updated_at || d.created_at).getTime() >= cutoff)
    }

    // Search filter
    if (this._search) {
      const q = this._search.toLowerCase()
      docs = docs.filter(d => (d.title || d.doc_id).toLowerCase().includes(q))
    }

    // Sort
    docs = [...docs].sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at).getTime()
      const tb = new Date(b.updated_at || b.created_at).getTime()
      return this._sort === 'newest' ? tb - ta : ta - tb
    })

    return docs
  }

  _toggle(docId) {
    const set = new Set(this._selectedIds)
    set.has(docId) ? set.delete(docId) : set.add(docId)
    this._selectedIds = [...set]
  }

  _remove(docId) {
    this._selectedIds = this._selectedIds.filter(id => id !== docId)
  }

  _onDragStart(e, idx) {
    this._dragIdx = idx
    e.dataTransfer.effectAllowed = 'move'
  }

  _onDragOver(e, idx) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  _onDrop(e, idx) {
    e.preventDefault()
    if (this._dragIdx === -1 || this._dragIdx === idx) return
    const ids = [...this._selectedIds]
    const [moved] = ids.splice(this._dragIdx, 1)
    ids.splice(idx, 0, moved)
    this._selectedIds = ids
    this._dragIdx = -1
  }

  _onDragEnd() {
    this._dragIdx = -1
  }

  _close() { this.remove() }

  async _save() {
    if (!this._name.trim()) { toast.show('Name is required', 'error'); return }
    this._saving = true
    try {
      if (this.playlistId) {
        await playlistsApi.updatePlaylist(this.playlistId, {
          name: this._name.trim(),
          description: this._desc.trim() || null,
          document_ids: this._selectedIds,
        })
      } else {
        await playlistsApi.createPlaylist({
          name: this._name.trim(),
          description: this._desc.trim() || null,
          document_ids: this._selectedIds,
        })
      }
      await store.refreshPlaylists()
      toast.show(this.playlistId ? 'Playlist updated' : 'Playlist created', 'success')
      this._close()
    } catch (e) { toast.show(e.message, 'error') }
    this._saving = false
  }

  _getDocTitle(docId) {
    const d = this._docs.find(x => x.doc_id === docId)
    return d?.title || docId
  }

  render() {
    const filtered = this._filteredDocs
    const selectedDocs = this._selectedIds

    return html`
      <div class="overlay" @click=${this._close}></div>
      <div class="modal">
        <div class="modal-header">
          <div class="header-top">
            <div>
              <h2>Playlist Editor</h2>
              <p>Sequence documents and manage playlist metadata</p>
            </div>
            <button class="btn-close" @click=${this._close}>
              <span class="icon">close</span>
            </button>
          </div>
          <div class="form-row">
            <label>
              <span class="label-text">Playlist Name *</span>
              <input type="text" placeholder="e.g., Q4 Board Review"
                .value=${this._name}
                @input=${e => this._name = e.target.value}
              />
            </label>
            <label>
              <span class="label-text">Description</span>
              <input type="text" placeholder="Brief summary of this playlist"
                .value=${this._desc}
                @input=${e => this._desc = e.target.value}
              />
            </label>
          </div>
        </div>

        <div class="modal-body">
          <div class="col-left">
            <div class="col-header">
              <div class="col-header-row">
                <span class="col-title">Available Documents</span>
                <span class="col-count">${this._docs.length} Total</span>
              </div>
              <div class="col-search">
                <span class="icon">search</span>
                <input type="text" placeholder="Search files..."
                  .value=${this._search}
                  @input=${e => this._search = e.target.value}
                />
              </div>
              <div class="col-filters">
                <select @change=${e => this._sort = e.target.value}>
                  <option value="newest" ?selected=${this._sort === 'newest'}>Newest</option>
                  <option value="oldest" ?selected=${this._sort === 'oldest'}>Oldest</option>
                </select>
                <select @change=${e => this._range = e.target.value}>
                  <option value="all" ?selected=${this._range === 'all'}>All Time</option>
                  <option value="7d" ?selected=${this._range === '7d'}>Last 7 Days</option>
                  <option value="30d" ?selected=${this._range === '30d'}>Last 30 Days</option>
                  <option value="1y" ?selected=${this._range === '1y'}>Last Year</option>
                </select>
              </div>
            </div>
            <div class="doc-list">
              ${filtered.map(doc => html`
                <label class="doc-item">
                  <input type="checkbox"
                    .checked=${this._selectedIds.includes(doc.doc_id)}
                    @change=${() => this._toggle(doc.doc_id)}
                  />
                  <span class="doc-name">${doc.title || doc.doc_id}</span>
                </label>
              `)}
            </div>
          </div>

          <div class="col-right">
            <div class="col-header">
              <div class="col-header-row">
                <span class="col-title">Selected Documents</span>
                <span class="selected-badge">${selectedDocs.length} Selected</span>
              </div>
            </div>
            <div class="selected-list">
              ${selectedDocs.length === 0 ? html`
                <div class="empty-selected">
                  <span class="icon">description</span>
                  <p>No documents selected yet</p>
                  <p class="sub">Check items from the left list to add</p>
                </div>
              ` : selectedDocs.map((id, i) => html`
                <div class="s-item ${this._dragIdx === i ? 'dragging' : ''}"
                  draggable="true"
                  @dragstart=${e => this._onDragStart(e, i)}
                  @dragover=${e => this._onDragOver(e, i)}
                  @drop=${e => this._onDrop(e, i)}
                  @dragend=${this._onDragEnd}
                >
                  <span class="grip">drag_indicator</span>
                  <span class="num">${i + 1}</span>
                  <span class="s-name">${this._getDocTitle(id)}</span>
                  <button class="btn-remove" @click=${() => this._remove(id)}>
                    <span class="icon">delete</span>
                  </button>
                </div>
              `)}
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <div class="footer-info">
            <span class="icon">cloud_done</span>
            <span>Changes autosaved to Supabase</span>
          </div>
          <div class="footer-actions">
            <button class="btn-cancel" @click=${this._close}>Cancel</button>
            <button class="btn-save" ?disabled=${this._saving} @click=${this._save}>
              Save Playlist
            </button>
          </div>
        </div>
      </div>
    `
  }
}

customElements.define('master-playlist-editor', MasterPlaylistEditor)
