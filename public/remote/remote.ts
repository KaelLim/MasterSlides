    import { connectRoom } from '../slides/js/drust-broadcast.js'

    // ── Drust Broadcast Remote Control ──
    // Module-level state. `room` is the connectRoom() handle. `closeStreak`
    // counts consecutive WS closes without an intervening open, so we don't
    // flag transient network blips as a disconnect.
    interface RoomHandle {
      publish: (msg: unknown) => void
    }

    interface ImageItem {
      src: string
      alt?: string
    }

    interface SyncSnapshot {
      type?: string
      currentPage?: number | string
      totalPages?: number | string
      images?: ImageItem[]
      lightboxActive?: boolean
      lightboxZoom?: number
      searchCount?: number | null
      searchIndex?: number
      searchQuery?: string
    }

    let room: RoomHandle | null = null
    let closeStreak = 0
    const MAX_CLOSES_BEFORE_ERROR = 3
    let roomId: string | null = null

    // Public API: signature preserved for existing callers (joystick, button
    // onclick handlers). Publishes through the Bun proxy → Drust broadcast.
    // Best-effort; broadcast is fire-and-forget, no retry.
    function sendCommand(action: string, data: Record<string, unknown> = {}): void {
      if (!room) return
      room.publish({ type: 'command', action, ...data })
    }

    function applySnapshot(data: SyncSnapshot): void {
      const statusEl = document.getElementById('status')!
      statusEl.textContent = '已連線'
      statusEl.classList.add('connected')
      statusEl.classList.remove('error')
      document.getElementById('errorBox')!.style.display = 'none'
      document.getElementById('currentPage')!.textContent = String(data.currentPage ?? '')
      document.getElementById('totalPages')!.textContent = String(data.totalPages ?? '')
      ;(document.getElementById('remoteGotoInput') as HTMLInputElement).max = String(data.totalPages ?? '')
      updateImages(data.images || [])
      updateZoomControls(!!data.lightboxActive, data.lightboxZoom)
      updateSearchState(data)
    }

    const params = new URLSearchParams(window.location.search)
    roomId = params.get('id')

    // Bind shell elements once; if the remote shell is loaded with a stripped
    // layout (missing #status / #errorBox), fall back to alert() so the user
    // still sees the error rather than a silent null-deref.
    const statusEl = document.getElementById('status')
    const errorBox = document.getElementById('errorBox')

    if (!roomId) {
      if (statusEl) {
        statusEl.textContent = '缺少房間 ID'
        statusEl.classList.add('error')
      }
      if (errorBox) errorBox.style.display = 'block'
      if (!statusEl && !errorBox) alert('缺少房間 ID')
    } else {
      if (statusEl) statusEl.textContent = '連線中...'

      // Drust requires room names to start with a letter; static 'slides-'
      // prefix satisfies that. Must match the viewer's drustRoomFor().
      const channel = `slides-${roomId}`

      room = await connectRoom(channel, {
        onOpen: () => {
          closeStreak = 0
          document.getElementById('status')!.textContent = '等待簡報同步...'
          document.getElementById('status')!.classList.remove('error')
          document.getElementById('errorBox')!.style.display = 'none'
          // Announce ourselves so the viewer publishes its current snapshot.
          // Drust broadcast is fire-and-forget — the only way to catch a
          // late-joining phone up is via a request/response handshake.
          room!.publish({ type: 'phone-join' })
        },
        onMessage: (msg: unknown) => {
          if (!msg || typeof msg !== 'object') return
          const m = msg as SyncSnapshot
          if (m.type === 'sync') applySnapshot(m)
          // 'command' / 'phone-join' are our own echoes — ignore.
        },
        onClose: () => {
          closeStreak += 1
          if (closeStreak >= MAX_CLOSES_BEFORE_ERROR) {
            const statusEl = document.getElementById('status')!
            statusEl.textContent = '連線中斷'
            statusEl.classList.remove('connected')
            statusEl.classList.add('error')
            document.getElementById('errorBox')!.style.display = 'block'
          }
        },
      })

      // Navigation
      document.getElementById('prevBtn')!.onclick = () => sendCommand('prev')
      document.getElementById('nextBtn')!.onclick = () => sendCommand('next')

      // Zoom
      document.getElementById('zoomInBtn')!.onclick = () => sendCommand('zoomIn')
      document.getElementById('zoomOutBtn')!.onclick = () => sendCommand('zoomOut')
      document.getElementById('zoomResetBtn')!.onclick = () => sendCommand('zoomReset')

      // Search
      document.getElementById('toolSearch')!.onclick = toggleSearchPanel
      document.getElementById('remoteSearchBtn')!.onclick = doSearch
      document.getElementById('remoteSearchInput')!.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') doSearch()
      })
      document.getElementById('remoteSearchPrev')!.onclick = () => sendCommand('searchPrev')
      document.getElementById('remoteSearchNext')!.onclick = () => sendCommand('searchNext')
      document.getElementById('remoteSearchClose')!.onclick = () => {
        sendCommand('searchClose')
        closeSearchPanel()
      }

      // Goto
      document.getElementById('toolGoto')!.onclick = toggleGotoPanel
      document.getElementById('remoteGotoBtn')!.onclick = doGoto
      document.getElementById('remoteGotoInput')!.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') doGoto()
      })

      // Keyboard hotkeys
      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
        if (e.key === 'ArrowLeft') sendCommand('prev')
        else if (e.key === 'ArrowRight') sendCommand('next')
      })
    }

    function updateImages(images: ImageItem[]): void {
      const grid = document.getElementById('imagesGrid')!

      if (!images || images.length === 0) {
        grid.innerHTML = ''
        grid.classList.add('empty')
        grid.textContent = '此頁沒有圖片'
        return
      }

      grid.classList.remove('empty')
      grid.innerHTML = images.map((img, i) => `
        <div class="image-thumb" data-index="${i}" data-src="${img.src}" data-alt="${(img.alt || '').replace(/"/g, '&quot;')}">
          <img src="${img.src}" alt="圖片 ${i + 1}">
        </div>
      `).join('')

      grid.querySelectorAll<HTMLDivElement>('.image-thumb').forEach(thumb => {
        thumb.onclick = () => {
          sendCommand('toggleLightbox', { src: thumb.dataset.src, alt: thumb.dataset.alt || '' })
        }
      })
    }

    function updateZoomControls(active: boolean, zoom: number | undefined): void {
      const controls = document.getElementById('zoomControls')!
      if (active) {
        controls.classList.add('active')
        document.getElementById('zoomLevel')!.textContent = Math.round((zoom || 1) * 100) + '%'
      } else {
        controls.classList.remove('active')
      }
    }

    function updateSearchState(data: SyncSnapshot): void {
      if (data.searchCount != null && data.searchCount > 0) {
        document.getElementById('searchPanelNav')!.style.display = 'flex'
        document.getElementById('remoteSearchCount')!.textContent =
          `${(data.searchIndex || 0) + 1} / ${data.searchCount}`
      } else if (data.searchQuery) {
        document.getElementById('searchPanelNav')!.style.display = 'flex'
        document.getElementById('remoteSearchCount')!.textContent = '0 筆結果'
      }
    }

    function toggleSearchPanel(): void {
      const panel = document.getElementById('searchPanel')!
      document.getElementById('gotoPanel')!.classList.remove('active')
      panel.classList.toggle('active')
      if (panel.classList.contains('active')) {
        document.getElementById('remoteSearchInput')!.focus()
      }
    }

    function closeSearchPanel(): void {
      document.getElementById('searchPanel')!.classList.remove('active')
      document.getElementById('searchPanelNav')!.style.display = 'none'
      ;(document.getElementById('remoteSearchInput') as HTMLInputElement).value = ''
    }

    function doSearch(): void {
      const keyword = (document.getElementById('remoteSearchInput') as HTMLInputElement).value.trim()
      if (keyword) {
        sendCommand('search', { keyword })
      }
    }

    function toggleGotoPanel(): void {
      const panel = document.getElementById('gotoPanel')!
      document.getElementById('searchPanel')!.classList.remove('active')
      panel.classList.toggle('active')
      if (panel.classList.contains('active')) {
        document.getElementById('remoteGotoInput')!.focus()
      }
    }

    function doGoto(): void {
      const page = parseInt((document.getElementById('remoteGotoInput') as HTMLInputElement).value)
      if (page && page >= 1) {
        sendCommand('goto', { page })
        document.getElementById('gotoPanel')!.classList.remove('active')
        ;(document.getElementById('remoteGotoInput') as HTMLInputElement).value = ''
      }
    }

    // Virtual Joystick with acceleration (no inertia)
    ;(function initJoystick(): void {
      const base = document.getElementById('joystickBase')!
      const thumb = document.getElementById('joystickThumb')!
      const baseRadius = 65
      const thumbRadius = 23
      const maxDist = baseRadius - thumbRadius

      const PAN_BASE = 4
      const PAN_ACCEL = 20

      let dragging = false
      let joyX = 0, joyY = 0
      let panInterval: ReturnType<typeof setInterval> | null = null

      function getJoyPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
        const rect = base.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const touch = 'touches' in e && e.touches ? e.touches[0] : (e as MouseEvent)
        return { x: touch.clientX - cx, y: touch.clientY - cy }
      }

      function clampDist(x: number, y: number): { x: number; y: number } {
        const dist = Math.sqrt(x * x + y * y)
        if (dist > maxDist) {
          const scale = maxDist / dist
          return { x: x * scale, y: y * scale }
        }
        return { x, y }
      }

      function updateThumb(x: number, y: number): void {
        thumb.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
      }

      function calcSpeed(normalized: number): number {
        return PAN_BASE + PAN_ACCEL * Math.pow(Math.abs(normalized), 2)
      }

      function startPanning(): void {
        if (panInterval) return
        panInterval = setInterval(() => {
          if (joyX === 0 && joyY === 0) return
          const nx = joyX / maxDist
          const ny = joyY / maxDist
          const speed = calcSpeed(Math.sqrt(nx * nx + ny * ny))
          const angle = Math.atan2(ny, nx)
          const dx = Math.cos(angle) * speed
          const dy = Math.sin(angle) * speed
          sendCommand('pan', { dx: -dx, dy: -dy })
        }, 100)
      }

      function stopPanning(): void {
        if (panInterval) {
          clearInterval(panInterval)
          panInterval = null
        }
      }

      function onStart(e: MouseEvent | TouchEvent): void {
        e.preventDefault()
        dragging = true
        thumb.classList.remove('released')
        const pos = getJoyPos(e)
        const clamped = clampDist(pos.x, pos.y)
        joyX = clamped.x
        joyY = clamped.y
        updateThumb(joyX, joyY)
        startPanning()
      }

      function onMove(e: MouseEvent | TouchEvent): void {
        if (!dragging) return
        e.preventDefault()
        const pos = getJoyPos(e)
        const clamped = clampDist(pos.x, pos.y)
        joyX = clamped.x
        joyY = clamped.y
        updateThumb(joyX, joyY)
      }

      function onEnd(): void {
        if (!dragging) return
        dragging = false
        joyX = 0
        joyY = 0
        stopPanning()
        thumb.classList.add('released')
        updateThumb(0, 0)
      }

      base.addEventListener('mousedown', onStart as EventListener)
      document.addEventListener('mousemove', onMove as EventListener)
      document.addEventListener('mouseup', onEnd)

      base.addEventListener('touchstart', onStart as EventListener, { passive: false })
      base.addEventListener('touchmove', onMove as EventListener, { passive: false })
      base.addEventListener('touchend', onEnd)
      base.addEventListener('touchcancel', onEnd)
    })()
