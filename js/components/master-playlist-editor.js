import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { store } from '/js/store.js'
import * as playlistsApi from '/js/playlists.js'
import { toast } from '/js/components/master-toast.js'
import '/js/components/master-doc-list.js'

class MasterPlaylistEditor extends LitElement {
  static properties = {
    open: { type: Boolean },
    playlist: { type: Object },  // null = create, object = edit
    _name: { state: true },
    _desc: { state: true },
    _editList: { state: true },  // array of doc_ids
    _showSelector: { state: true },
    _saving: { state: true },
    _dragIndex: { state: true },
  }

  static styles = css`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: rgba(20, 20, 40, 0.95);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      padding: 24px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
    }

    h3 {
      color: white;
      margin: 0 0 20px;
      font-size: 18px;
      font-weight: 600;
    }

    label {
      display: block;
      color: rgba(255, 255, 255, 0.6);
      font-size: 13px;
      margin-bottom: 6px;
      margin-top: 16px;
    }

    input[type="text"] {
      width: 100%;
      padding: 12px 15px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      font-size: 14px;
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.2s;
    }

    input[type="text"]:focus { border-color: #5FCFC3; }

    input[type="text"]::placeholder { color: rgba(255, 255, 255, 0.3); }

    h4 {
      color: white;
      font-size: 14px;
      margin: 20px 0 8px;
    }

    .edit-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .edit-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      margin-bottom: 4px;
      cursor: grab;
      transition: all 0.2s;
    }

    .edit-list li:active { cursor: grabbing; }
    .edit-list li.drag-over {
      background: rgba(95, 207, 195, 0.15);
      border-color: rgba(95, 207, 195, 0.3);
    }

    .drag-handle {
      color: rgba(255, 255, 255, 0.3);
      font-size: 16px;
      user-select: none;
    }

    .item-title {
      flex: 1;
      color: white;
      font-size: 13px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .btn-remove {
      background: none;
      border: none;
      color: #e74c3c;
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0.6;
    }

    .btn-remove:hover { opacity: 1; }

    .btn-add-docs {
      margin-top: 12px;
      padding: 10px 16px;
      background: rgba(95, 207, 195, 0.1);
      border: 1px dashed rgba(95, 207, 195, 0.4);
      color: #5FCFC3;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      width: 100%;
      transition: background 0.2s;
    }

    .btn-add-docs:hover { background: rgba(95, 207, 195, 0.2); }

    .selector-container {
      margin-top: 12px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      max-height: 240px;
      overflow-y: auto;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .btn-cancel {
      padding: 10px 20px;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      color: white;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-cancel:hover { background: rgba(255, 255, 255, 0.2); }

    .btn-save {
      padding: 10px 20px;
      background: #5FCFC3;
      border: none;
      border-radius: 8px;
      color: #1a1a2e;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-save:hover:not(:disabled) { background: #7EDDD3; }
    .btn-save:disabled { opacity: 0.4; cursor: not-allowed; }

    .empty-list {
      color: rgba(255, 255, 255, 0.4);
      font-size: 13px;
      text-align: center;
      padding: 16px;
    }
  `

  constructor() {
    super()
    this.open = false
    this.playlist = null
    this._name = ''
    this._desc = ''
    this._editList = []
    this._showSelector = false
    this._saving = false
    this._dragIndex = -1
  }

  updated(changedProps) {
    if (changedProps.has('open') && this.open) {
      if (this.playlist) {
        this._name = this.playlist.name || ''
        this._desc = this.playlist.description || ''
        this._editList = [...(this.playlist.document_ids || [])]
      } else {
        this._name = ''
        this._desc = ''
        this._editList = []
      }
      this._showSelector = false
    }
  }

  _getTitle(docId) {
    const doc = store.documents.find(d => d.doc_id === docId)
    return doc ? doc.title : docId
  }

  _remove(index) {
    this._editList = this._editList.filter((_, i) => i !== index)
  }

  _onSelect(e) {
    const selected = e.detail.selected
    // Add newly selected, keep existing order
    const newItems = selected.filter(id => !this._editList.includes(id))
    const kept = this._editList.filter(id => selected.includes(id))
    this._editList = [...kept, ...newItems]
  }

  // Drag and drop
  _dragStart(e, index) {
    this._dragIndex = index
    e.dataTransfer.effectAllowed = 'move'
  }

  _dragOver(e, index) {
    e.preventDefault()
    if (this._dragIndex === index) return
    const list = [...this._editList]
    const [item] = list.splice(this._dragIndex, 1)
    list.splice(index, 0, item)
    this._editList = list
    this._dragIndex = index
  }

  _dragEnd() {
    this._dragIndex = -1
  }

  _close() {
    this.dispatchEvent(new CustomEvent('editor-close', { bubbles: true, composed: true }))
  }

  async _save() {
    if (!this._name.trim() || this._saving) return
    this._saving = true
    try {
      if (this.playlist) {
        // Edit mode
        await playlistsApi.updatePlaylist(this.playlist.id, {
          name: this._name.trim(),
          description: this._desc.trim(),
        })
        await playlistsApi.reorderDocuments(this.playlist.id, this._editList)
      } else {
        // Create mode
        const created = await playlistsApi.createPlaylist(
          this._name.trim(),
          this._desc.trim()
        )
        for (const docId of this._editList) {
          await playlistsApi.addDocument(created.id, docId)
        }
      }
      toast.show(this.playlist ? '播放清單已更新' : '播放清單已建立', 'success')
      this.dispatchEvent(new CustomEvent('playlist-saved', { bubbles: true, composed: true }))
    } catch (err) {
      toast.show(err.message, 'error')
    }
    this._saving = false
  }

  render() {
    if (!this.open) return html``

    return html`
      <div class="modal-overlay" @click=${this._close}>
        <div class="modal-content" @click=${e => e.stopPropagation()}>
          <h3>${this.playlist ? '編輯播放清單' : '新增播放清單'}</h3>

          <label>名稱</label>
          <input type="text" placeholder="輸入播放清單名稱"
                 .value=${this._name}
                 @input=${e => this._name = e.target.value}>

          <label>描述（選填）</label>
          <input type="text" placeholder="簡短描述"
                 .value=${this._desc}
                 @input=${e => this._desc = e.target.value}>

          <h4>已加入文件 (${this._editList.length})</h4>
          ${this._editList.length === 0
            ? html`<div class="empty-list">尚未加入任何文件</div>`
            : html`
              <ul class="edit-list">
                ${this._editList.map((docId, i) => html`
                  <li draggable="true"
                      @dragstart=${e => this._dragStart(e, i)}
                      @dragover=${e => this._dragOver(e, i)}
                      @dragend=${this._dragEnd}>
                    <span class="drag-handle">⠿</span>
                    <span class="item-title">${this._getTitle(docId)}</span>
                    <button class="btn-remove" @click=${() => this._remove(i)}>✕</button>
                  </li>
                `)}
              </ul>
            `
          }

          <button class="btn-add-docs"
                  @click=${() => this._showSelector = !this._showSelector}>
            ${this._showSelector ? '收起文件列表' : '＋ 加入文件'}
          </button>

          ${this._showSelector ? html`
            <div class="selector-container">
              <master-doc-list mode="select"
                .selected=${this._editList}
                @selection-change=${this._onSelect}>
              </master-doc-list>
            </div>
          ` : ''}

          <div class="modal-footer">
            <button class="btn-cancel" @click=${this._close}>取消</button>
            <button class="btn-save"
                    ?disabled=${!this._name.trim() || this._saving}
                    @click=${this._save}>
              ${this._saving ? '儲存中...' : '儲存'}
            </button>
          </div>
        </div>
      </div>
    `
  }
}

customElements.define('master-playlist-editor', MasterPlaylistEditor)
