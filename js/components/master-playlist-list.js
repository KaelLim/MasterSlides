import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { store } from '/js/store.js'
import * as playlistsApi from '/js/playlists.js'
import { toast } from '/js/components/master-toast.js'
import { confirm } from '/js/components/master-confirm.js'
import '/js/components/master-playlist-editor.js'

class MasterPlaylistList extends LitElement {
  static properties = {
    _playlists: { state: true },
    _search: { state: true },
  }

  static styles = css`
    :host { display: block; }

    .page-header {
      display: flex; justify-content: space-between; align-items: flex-start;
      margin-bottom: 24px; flex-wrap: wrap; gap: 16px;
    }
    .page-header h2 {
      font-size: 30px; font-weight: 900;
      color: #111318; letter-spacing: -0.02em;
    }
    .page-header p { color: #616f89; margin-top: 4px; }
    .btn-new {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 20px;
      background: #135bec; color: #fff;
      border: none; border-radius: 8px;
      font-size: 14px; font-weight: 700;
      cursor: pointer; transition: all 0.15s;
      font-family: inherit;
    }
    .btn-new:hover { background: #0f4fd4; }
    .btn-new .icon { font-family: 'Material Symbols Outlined'; font-size: 18px; }

    .search-bar {
      margin-bottom: 24px;
      position: relative;
      max-width: 400px;
    }
    .search-bar .icon {
      position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
      font-family: 'Material Symbols Outlined'; font-size: 20px; color: #616f89;
    }
    .search-bar input {
      width: 100%; height: 42px;
      padding: 0 14px 0 40px;
      border: none; border-radius: 12px;
      font-size: 13px; color: #111318;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      outline: none; font-family: inherit;
    }
    .search-bar input:focus { box-shadow: 0 0 0 2px rgba(19,91,236,0.15); }

    .card-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 24px;
    }
    .card {
      background: #fff;
      border: 1px solid #dbdfe6;
      border-radius: 12px;
      overflow: hidden;
      transition: all 0.2s;
      display: flex; flex-direction: column;
    }
    .card:hover { border-color: rgba(19,91,236,0.3); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }

    .card-cover {
      height: 120px;
      background: linear-gradient(135deg, rgba(19,91,236,0.15), rgba(19,91,236,0.05));
      position: relative;
    }
    .card-cover .status-badge {
      position: absolute; top: 12px; right: 12px;
      padding: 3px 8px; border-radius: 4px;
      font-size: 10px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .status-badge.active { background: rgba(59,130,246,0.1); color: #2563eb; }
    .status-badge.draft { background: rgba(245,158,11,0.1); color: #d97706; }

    .card-body { padding: 20px; flex: 1; display: flex; flex-direction: column; }
    .card-body h3 {
      font-size: 16px; font-weight: 700;
      color: #111318; transition: color 0.15s;
    }
    .card:hover .card-body h3 { color: #135bec; }
    .card-body .desc {
      font-size: 13px; color: #616f89;
      margin-top: 8px; line-height: 1.5;
      display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden;
    }
    .card-meta {
      display: flex; align-items: center; gap: 16px;
      margin-top: 16px; font-size: 12px; color: #616f89;
    }
    .card-meta .item {
      display: flex; align-items: center; gap: 4px;
    }
    .card-meta .icon {
      font-family: 'Material Symbols Outlined'; font-size: 16px;
    }
    .card-toolbar {
      margin-top: 20px; padding-top: 16px;
      border-top: 1px solid #f0f2f4;
      display: flex; justify-content: space-between;
    }
    .toolbar-left { display: flex; gap: 4px; }
    .btn-tool {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 8px;
      background: transparent;
      color: #616f89; cursor: pointer;
      transition: all 0.15s;
    }
    .btn-tool:hover { background: rgba(19,91,236,0.08); color: #135bec; }
    .btn-tool.danger:hover { background: #fef2f2; color: #ef4444; }
    .btn-tool .icon { font-family: 'Material Symbols Outlined'; font-size: 20px; }

    .card-placeholder {
      border: 2px dashed #dbdfe6;
      border-radius: 12px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 32px; min-height: 280px;
      cursor: pointer; transition: all 0.2s;
      text-align: center;
    }
    .card-placeholder:hover { border-color: #135bec; background: rgba(19,91,236,0.03); }
    .card-placeholder .plus-icon {
      width: 56px; height: 56px;
      background: #f0f2f4; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin-bottom: 16px; color: #616f89;
    }
    .card-placeholder .plus-icon .icon { font-family: 'Material Symbols Outlined'; font-size: 28px; }
    .card-placeholder h4 { font-size: 16px; font-weight: 700; color: #111318; }
    .card-placeholder p { font-size: 13px; color: #616f89; margin-top: 8px; max-width: 200px; }

    .empty { text-align: center; padding: 60px 20px; color: #616f89; }
  `

  constructor() {
    super()
    this._playlists = []
    this._search = ''
    this._onStoreChange = () => { this._playlists = [...store.playlists] }
  }

  connectedCallback() {
    super.connectedCallback()
    store.addEventListener('playlists-updated', this._onStoreChange)
    this._playlists = [...store.playlists]
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    store.removeEventListener('playlists-updated', this._onStoreChange)
  }

  get _filtered() {
    if (!this._search) return this._playlists
    const q = this._search.toLowerCase()
    return this._playlists.filter(p => p.name.toLowerCase().includes(q))
  }

  _openEditor(playlist = null) {
    const editor = document.createElement('master-playlist-editor')
    if (playlist) editor.playlistId = playlist.id
    document.body.appendChild(editor)
  }

  async _togglePublic(pl) {
    try {
      await playlistsApi.updatePlaylist(pl.id, { is_public: !pl.is_public })
      await store.refreshPlaylists()
    } catch (e) { toast.show(e.message, 'error') }
  }

  async _delete(pl) {
    const ok = await confirm.show({
      title: 'Delete Playlist',
      message: `"${pl.name}" will be permanently deleted.`,
      type: 'danger',
      confirmText: 'Delete',
    })
    if (!ok) return
    try {
      await playlistsApi.deletePlaylist(pl.id)
      await store.refreshPlaylists()
      toast.show('Playlist deleted', 'success')
    } catch (e) { toast.show(e.message, 'error') }
  }

  _formatDate(d) {
    if (!d) return ''
    return new Date(d).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  render() {
    const filtered = this._filtered
    return html`
      <div class="page-header">
        <div>
          <h2>Playlists</h2>
          <p>Manage and organize your curated document collections.</p>
        </div>
        <button class="btn-new" @click=${() => this._openEditor()}>
          <span class="icon">add_circle</span>
          <span>New Playlist</span>
        </button>
      </div>

      <div class="search-bar">
        <span class="icon">search</span>
        <input
          type="text"
          placeholder="Search playlists..."
          .value=${this._search}
          @input=${e => this._search = e.target.value}
        />
      </div>

      <div class="card-grid">
        ${filtered.map(pl => this._renderCard(pl))}
        <div class="card-placeholder" @click=${() => this._openEditor()}>
          <div class="plus-icon"><span class="icon">add</span></div>
          <h4>Create New Playlist</h4>
          <p>Start grouping your documents for easier access and sharing.</p>
        </div>
      </div>
    `
  }

  _renderCard(pl) {
    const docCount = pl.document_ids?.length || 0
    return html`
      <div class="card">
        <div class="card-cover">
          <span class="status-badge ${pl.is_public ? 'active' : 'draft'}">
            ${pl.is_public ? 'Active' : 'Draft'}
          </span>
        </div>
        <div class="card-body">
          <h3>${pl.name}</h3>
          ${pl.description ? html`<p class="desc">${pl.description}</p>` : ''}
          <div class="card-meta">
            <div class="item"><span class="icon">description</span><span>${docCount} docs</span></div>
            <div class="item"><span class="icon">calendar_today</span><span>${this._formatDate(pl.updated_at)}</span></div>
          </div>
          <div class="card-toolbar">
            <div class="toolbar-left">
              <button class="btn-tool" @click=${() => window.open(`/slides.html?playlist=${pl.id}`, '_blank')} title="Play">
                <span class="icon">play_arrow</span>
              </button>
              <button class="btn-tool" @click=${() => this._openEditor(pl)} title="Edit">
                <span class="icon">edit</span>
              </button>
              <button class="btn-tool" @click=${() => this._togglePublic(pl)} title="${pl.is_public ? 'Public' : 'Private'}">
                <span class="icon">${pl.is_public ? 'public' : 'lock'}</span>
              </button>
            </div>
            <button class="btn-tool danger" @click=${() => this._delete(pl)} title="Delete">
              <span class="icon">delete</span>
            </button>
          </div>
        </div>
      </div>
    `
  }
}

customElements.define('master-playlist-list', MasterPlaylistList)
