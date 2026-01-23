import * as documentsApi from './documents.js'
import * as playlistsApi from './playlists.js'

class AppStore extends EventTarget {
  #state = { documents: [], playlists: [], user: null, profile: null }

  get documents() { return this.#state.documents }
  get playlists() { return this.#state.playlists }
  get user() { return this.#state.user }
  get profile() { return this.#state.profile }

  async refreshDocuments() {
    this.#state.documents = await documentsApi.listDocuments()
    this.dispatchEvent(new CustomEvent('documents-updated'))
  }

  async refreshPlaylists() {
    this.#state.playlists = await playlistsApi.listPlaylists()
    this.dispatchEvent(new CustomEvent('playlists-updated'))
  }

  setUser(user, profile) {
    this.#state.user = user
    this.#state.profile = profile
    this.dispatchEvent(new CustomEvent('user-updated'))
  }
}

export const store = new AppStore()
