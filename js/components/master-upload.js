import { LitElement, html, css } from 'https://esm.sh/lit@3'
import { store } from '/js/store.js'
import { fetchGoogleDoc, extractDocIdFromUrl } from '/js/upload.js'
import { toast } from '/js/components/master-toast.js'

class MasterUpload extends LitElement {
  static properties = {
    _url: { state: true },
    _title: { state: true },
    _docId: { state: true },
    _loading: { state: true },
  }

  static styles = css`
    :host { display: block; }

    h2 {
      color: white;
      margin: 0 0 24px;
      font-size: 20px;
      font-weight: 600;
    }

    .upload-form {
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 24px;
      max-width: 560px;
    }

    label {
      display: block;
      color: rgba(255, 255, 255, 0.6);
      font-size: 13px;
      margin-bottom: 6px;
      margin-top: 16px;
    }

    label:first-of-type { margin-top: 0; }

    input {
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

    input:focus {
      border-color: #5FCFC3;
    }

    input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    .doc-id-preview {
      margin-top: 8px;
      padding: 8px 12px;
      background: rgba(95, 207, 195, 0.15);
      border: 1px solid rgba(95, 207, 195, 0.3);
      border-radius: 8px;
      font-size: 12px;
      color: #5FCFC3;
      word-break: break-all;
    }

    .btn-submit {
      margin-top: 24px;
      padding: 12px 24px;
      background: #5FCFC3;
      color: #1a1a2e;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
    }

    .btn-submit:hover:not(:disabled) {
      background: #7EDDD3;
    }

    .btn-submit:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  `

  constructor() {
    super()
    this._url = ''
    this._title = ''
    this._docId = null
    this._loading = false
  }

  _onUrlInput(e) {
    this._url = e.target.value
    this._docId = extractDocIdFromUrl(this._url)
  }

  async _submit() {
    if (!this._docId || this._loading) return
    this._loading = true
    try {
      const result = await fetchGoogleDoc({
        url: this._url,
        title: this._title || undefined,
      })
      toast.show(`上傳成功：v${result.version}，${result.images} 張圖片`, 'success')
      await store.refreshDocuments()
      this._url = ''
      this._title = ''
      this._docId = null
    } catch (err) {
      toast.show(err.message, 'error')
    }
    this._loading = false
  }

  render() {
    return html`
      <h2>上傳簡報</h2>
      <div class="upload-form">
        <label>Google Docs URL</label>
        <input type="url"
               placeholder="https://docs.google.com/document/d/..."
               .value=${this._url}
               @input=${this._onUrlInput}>
        ${this._docId ? html`
          <div class="doc-id-preview">文件 ID: ${this._docId}</div>
        ` : ''}

        <label>標題（選填）</label>
        <input type="text"
               placeholder="預設使用文件 ID"
               .value=${this._title}
               @input=${e => this._title = e.target.value}>

        <button class="btn-submit"
                ?disabled=${!this._docId || this._loading}
                @click=${this._submit}>
          ${this._loading ? '處理中...' : '上傳轉換'}
        </button>
      </div>
    `
  }
}

customElements.define('master-upload', MasterUpload)
