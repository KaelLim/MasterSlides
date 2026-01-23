import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { store } from '/js/store.js'
import * as playlistsApi from '/js/playlists.js'
import { toast } from '/js/components/master-toast.js'
import '/js/components/master-playlist-editor.js'

class MasterPlaylistList extends LitElement {
  static properties = {
    _playlists: { state: true },
    _editorOpen: { state: true },
    _editingPlaylist: { state: true },
  }

  static styles = css`
    :host { display: block; }

    .playlist-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 20px;
    }

    h2 {
      color: white;
      margin: 0;
      font-size: 20px;
      font-weight: 600;
    }

    .btn-create {
      padding: 10px 18px;
      background: #5FCFC3;
      color: #1a1a2e;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-create:hover { background: #7EDDD3; }

    .playlist-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .playlist-card {
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      transition: all 0.2s;
    }

    .playlist-card:hover {
      background: rgba(0, 0, 0, 0.5);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .playlist-name {
      color: white;
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .playlist-desc {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      margin-bottom: 8px;
    }

    .playlist-meta {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      margin-bottom: 12px;
    }

    .playlist-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .playlist-actions button {
      padding: 8px 14px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .playlist-actions button:hover { opacity: 0.85; }

    .btn-play {
      background: #FFD700;
      color: #1a1a2e;
      font-weight: 600;
    }

    .btn-edit {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: white;
    }

    .btn-public {
      background: rgba(95, 207, 195, 0.15);
      border: 1px solid rgba(95, 207, 195, 0.3);
      color: #5FCFC3;
    }

    .btn-private {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: rgba(255, 255, 255, 0.6);
    }

    .btn-delete {
      background: rgba(231, 76, 60, 0.15);
      border: 1px solid rgba(231, 76, 60, 0.3);
      color: #e74c3c;
    }

    .empty {
      color: rgba(255, 255, 255, 0.5);
      font-size: 14px;
      padding: 24px;
      text-align: center;
    }
  `

  constructor() {
    super()
    this._playlists = store.playlists
    this._editorOpen = false
    this._editingPlaylist = null

    this._onPlaylistsUpdated = () => {
      this._playlists = store.playlists
    }
    store.addEventListener('playlists-updated', this._onPlaylistsUpdated)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    store.removeEventListener('playlists-updated', this._onPlaylistsUpdated)
  }

  _create() {
    this._editingPlaylist = null
    this._editorOpen = true
  }

  _edit(pl) {
    this._editingPlaylist = pl
    this._editorOpen = true
  }

  _play(pl) {
    window.open(`/slides.html?playlist=${pl.id}`, '_blank')
  }

  async _togglePublic(pl) {
    try {
      await playlistsApi.togglePublic(pl.id, !pl.is_public)
      await store.refreshPlaylists()
      toast.show(pl.is_public ? '已設為私人' : '已設為公開', 'success')
    } catch (err) {
      toast.show(err.message, 'error')
    }
  }

  async _delete(pl) {
    if (!confirm(`確定刪除播放清單「${pl.name}」？`)) return
    try {
      await playlistsApi.deletePlaylist(pl.id)
      await store.refreshPlaylists()
      toast.show('已刪除', 'success')
    } catch (err) {
      toast.show(err.message, 'error')
    }
  }

  _closeEditor() {
    this._editorOpen = false
    this._editingPlaylist = null
  }

  async _onSaved() {
    this._editorOpen = false
    this._editingPlaylist = null
    await store.refreshPlaylists()
  }

  _formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  render() {
    return html`
      <div class="playlist-header">
        <h2>播放清單</h2>
        <button class="btn-create" @click=${this._create}>＋ 新增播放清單</button>
      </div>

      <div class="playlist-grid">
        ${this._playlists.length === 0 ? html`<div class="empty">尚無播放清單</div>` : ''}
        ${this._playlists.map(pl => html`
          <div class="playlist-card">
            <div class="playlist-name">${pl.name}</div>
            ${pl.description ? html`<div class="playlist-desc">${pl.description}</div>` : ''}
            <div class="playlist-meta">
              ${pl.document_ids?.length || 0} 份簡報 · ${this._formatDate(pl.updated_at)}
            </div>
            <div class="playlist-actions">
              <button class="btn-play" @click=${() => this._play(pl)}>播放</button>
              <button class="btn-edit" @click=${() => this._edit(pl)}>編輯</button>
              <button class="${pl.is_public ? 'btn-public' : 'btn-private'}"
                      @click=${() => this._togglePublic(pl)}>
                ${pl.is_public ? '公開' : '私人'}
              </button>
              <button class="btn-delete" @click=${() => this._delete(pl)}>刪除</button>
            </div>
          </div>
        `)}
      </div>

      <master-playlist-editor
        .open=${this._editorOpen}
        .playlist=${this._editingPlaylist}
        @editor-close=${this._closeEditor}
        @playlist-saved=${this._onSaved}>
      </master-playlist-editor>
    `
  }
}

customElements.define('master-playlist-list', MasterPlaylistList)
