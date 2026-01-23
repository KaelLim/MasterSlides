import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { store } from '/js/store.js'
import * as documentsApi from '/js/documents.js'
import { toast } from '/js/components/master-toast.js'

class MasterDocList extends LitElement {
  static properties = {
    mode: { type: String },       // "full" | "select"
    selected: { type: Array },    // doc_ids selected (for mode="select")
    filter: { type: String },
    _documents: { state: true },
  }

  static styles = css`
    :host { display: block; }

    h2 {
      color: white;
      margin: 0 0 16px;
      font-size: 20px;
      font-weight: 600;
    }

    .filter-bar {
      margin-bottom: 16px;
    }

    .filter-bar input {
      width: 100%;
      max-width: 320px;
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

    .filter-bar input:focus {
      border-color: #5FCFC3;
    }

    .filter-bar input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    .doc-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    .doc-card {
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      transition: all 0.2s;
    }

    .doc-card:hover {
      background: rgba(0, 0, 0, 0.5);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .doc-card-select {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 4px;
    }

    .doc-card-select:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .doc-card-select input[type="checkbox"] {
      accent-color: #5FCFC3;
      width: 16px;
      height: 16px;
    }

    .doc-title {
      color: white;
      font-size: 15px;
      font-weight: 500;
      margin-bottom: 6px;
      word-break: break-word;
    }

    .doc-meta {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      margin-bottom: 12px;
    }

    .doc-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .doc-actions button {
      padding: 8px 14px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .doc-actions button:hover { opacity: 0.85; }

    .btn-view {
      background: #5FCFC3;
      color: #1a1a2e;
      font-weight: 600;
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

    .select-title {
      color: white;
      font-size: 14px;
      flex: 1;
    }
  `

  constructor() {
    super()
    this.mode = 'full'
    this.selected = []
    this.filter = ''
    this._documents = store.documents

    this._onDocumentsUpdated = () => {
      this._documents = store.documents
    }
    store.addEventListener('documents-updated', this._onDocumentsUpdated)
  }

  disconnectedCallback() {
    super.disconnectedCallback()
    store.removeEventListener('documents-updated', this._onDocumentsUpdated)
  }

  get _filtered() {
    if (!this.filter) return this._documents
    const keyword = this.filter.toLowerCase()
    return this._documents.filter(d =>
      (d.title || '').toLowerCase().includes(keyword)
    )
  }

  _view(doc) {
    window.open(`/slides.html?src=${doc.doc_id}`, '_blank')
  }

  async _togglePublic(doc) {
    try {
      await documentsApi.togglePublic(doc.doc_id, !doc.is_public)
      await store.refreshDocuments()
      toast.show(doc.is_public ? '已設為私人' : '已設為公開', 'success')
    } catch (err) {
      toast.show(err.message, 'error')
    }
  }

  async _delete(doc) {
    if (!confirm(`確定刪除「${doc.title}」？`)) return
    try {
      await documentsApi.deleteDocument(doc.doc_id)
      await store.refreshDocuments()
      toast.show('已刪除', 'success')
    } catch (err) {
      toast.show(err.message, 'error')
    }
  }

  _toggleSelect(docId) {
    const newSelected = this.selected.includes(docId)
      ? this.selected.filter(id => id !== docId)
      : [...this.selected, docId]
    this.selected = newSelected
    this.dispatchEvent(new CustomEvent('selection-change', {
      detail: { selected: newSelected },
      bubbles: true, composed: true,
    }))
  }

  _formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return `${d.getMonth() + 1}/${d.getDate()}`
  }

  render() {
    const docs = this._filtered

    if (this.mode === 'select') {
      return html`
        <div class="filter-bar">
          <input type="text" placeholder="搜尋標題..."
                 .value=${this.filter}
                 @input=${e => this.filter = e.target.value}>
        </div>
        <div>
          ${docs.length === 0 ? html`<div class="empty">無符合的文件</div>` : ''}
          ${docs.map(doc => html`
            <div class="doc-card-select" @click=${() => this._toggleSelect(doc.doc_id)}>
              <input type="checkbox"
                     .checked=${this.selected.includes(doc.doc_id)}
                     @click=${e => e.stopPropagation()}>
              <span class="select-title">${doc.title || doc.doc_id}</span>
            </div>
          `)}
        </div>
      `
    }

    return html`
      <h2>簡報列表</h2>
      <div class="filter-bar">
        <input type="text" placeholder="搜尋標題..."
               .value=${this.filter}
               @input=${e => this.filter = e.target.value}>
      </div>
      <div class="doc-grid">
        ${docs.length === 0 ? html`<div class="empty">無符合的文件</div>` : ''}
        ${docs.map(doc => html`
          <div class="doc-card">
            <div class="doc-title">${doc.title || doc.doc_id}</div>
            <div class="doc-meta">v${doc.current_version} · ${this._formatDate(doc.updated_at)}</div>
            <div class="doc-actions">
              <button class="btn-view" @click=${() => this._view(doc)}>檢視</button>
              <button class="${doc.is_public ? 'btn-public' : 'btn-private'}"
                      @click=${() => this._togglePublic(doc)}>
                ${doc.is_public ? '公開' : '私人'}
              </button>
              <button class="btn-delete" @click=${() => this._delete(doc)}>刪除</button>
            </div>
          </div>
        `)}
      </div>
    `
  }
}

customElements.define('master-doc-list', MasterDocList)
