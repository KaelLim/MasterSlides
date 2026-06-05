    import { connectRoom } from '/slides/js/drust-broadcast.js'

    // ── Drust Broadcast Remote Control ──
    // Module-level state. `room` is the connectRoom() handle. `closeStreak`
    // counts consecutive WS closes without an intervening open, so we don't
    // flag transient network blips as a disconnect.
    let room = null
    let closeStreak = 0
    const MAX_CLOSES_BEFORE_ERROR = 3
    let roomId = null

    // Public API: signature preserved for existing callers (joystick, button
    // onclick handlers). Publishes through the Bun proxy → Drust broadcast.
    // Best-effort; broadcast is fire-and-forget, no retry.
    function sendCommand(action, data = {}) {
      if (!room) return
      room.publish({ type: 'command', action, ...data })
    }

    function applySnapshot(data) {
      document.getElementById('status').textContent = '已連線'
      document.getElementById('status').classList.add('connected')
      document.getElementById('status').classList.remove('error')
      document.getElementById('errorBox').style.display = 'none'
      document.getElementById('currentPage').textContent = data.currentPage
      document.getElementById('totalPages').textContent = data.totalPages
      document.getElementById('remoteGotoInput').max = data.totalPages
      updateImages(data.images || [])
      updateZoomControls(data.lightboxActive, data.lightboxZoom)
      updateSearchState(data)
    }

    const params = new URLSearchParams(window.location.search)
    roomId = params.get('id')

    if (!roomId) {
      document.getElementById('status').textContent = '缺少房間 ID'
      document.getElementById('status').classList.add('error')
      document.getElementById('errorBox').style.display = 'block'
    } else {
      document.getElementById('status').textContent = '連線中...'

      // Drust requires room names to start with a letter; static 'slides-'
      // prefix satisfies that. Must match the viewer's drustRoomFor().
      const channel = `slides-${roomId}`

      room = await connectRoom(channel, {
        onOpen: () => {
          closeStreak = 0
          document.getElementById('status').textContent = '等待簡報同步...'
          document.getElementById('status').classList.remove('error')
          document.getElementById('errorBox').style.display = 'none'
          // Announce ourselves so the viewer publishes its current snapshot.
          // Drust broadcast is fire-and-forget — the only way to catch a
          // late-joining phone up is via a request/response handshake.
          room.publish({ type: 'phone-join' })
        },
        onMessage: (msg) => {
          if (!msg || typeof msg !== 'object') return
          if (msg.type === 'sync') applySnapshot(msg)
          // 'command' / 'phone-join' are our own echoes — ignore.
        },
        onClose: () => {
          closeStreak += 1
          if (closeStreak >= MAX_CLOSES_BEFORE_ERROR) {
            document.getElementById('status').textContent = '連線中斷'
            document.getElementById('status').classList.remove('connected')
            document.getElementById('status').classList.add('error')
            document.getElementById('errorBox').style.display = 'block'
          }
        },
      })

      // Navigation
      document.getElementById('prevBtn').onclick = () => sendCommand('prev')
      document.getElementById('nextBtn').onclick = () => sendCommand('next')

      // Zoom
      document.getElementById('zoomInBtn').onclick = () => sendCommand('zoomIn')
      document.getElementById('zoomOutBtn').onclick = () => sendCommand('zoomOut')
      document.getElementById('zoomResetBtn').onclick = () => sendCommand('zoomReset')

      // Search
      document.getElementById('toolSearch').onclick = toggleSearchPanel
      document.getElementById('remoteSearchBtn').onclick = doSearch
      document.getElementById('remoteSearchInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch()
      })
      document.getElementById('remoteSearchPrev').onclick = () => sendCommand('searchPrev')
      document.getElementById('remoteSearchNext').onclick = () => sendCommand('searchNext')
      document.getElementById('remoteSearchClose').onclick = () => {
        sendCommand('searchClose')
        closeSearchPanel()
      }

      // Goto
      document.getElementById('toolGoto').onclick = toggleGotoPanel
      document.getElementById('remoteGotoBtn').onclick = doGoto
      document.getElementById('remoteGotoInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doGoto()
      })

      // Keyboard hotkeys
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return
        if (e.key === 'ArrowLeft') sendCommand('prev')
        else if (e.key === 'ArrowRight') sendCommand('next')
      })
    }

    function updateImages(images) {
      const grid = document.getElementById('imagesGrid')

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

      grid.querySelectorAll('.image-thumb').forEach(thumb => {
        thumb.onclick = () => {
          sendCommand('toggleLightbox', { src: thumb.dataset.src, alt: thumb.dataset.alt || '' })
        }
      })
    }

    function updateZoomControls(active, zoom) {
      const controls = document.getElementById('zoomControls')
      if (active) {
        controls.classList.add('active')
        document.getElementById('zoomLevel').textContent = Math.round((zoom || 1) * 100) + '%'
      } else {
        controls.classList.remove('active')
      }
    }

    function updateSearchState(data) {
      if (data.searchCount != null && data.searchCount > 0) {
        document.getElementById('searchPanelNav').style.display = 'flex'
        document.getElementById('remoteSearchCount').textContent =
          `${(data.searchIndex || 0) + 1} / ${data.searchCount}`
      } else if (data.searchQuery) {
        document.getElementById('searchPanelNav').style.display = 'flex'
        document.getElementById('remoteSearchCount').textContent = '0 筆結果'
      }
    }

    function toggleSearchPanel() {
      const panel = document.getElementById('searchPanel')
      document.getElementById('gotoPanel').classList.remove('active')
      panel.classList.toggle('active')
      if (panel.classList.contains('active')) {
        document.getElementById('remoteSearchInput').focus()
      }
    }

    function closeSearchPanel() {
      document.getElementById('searchPanel').classList.remove('active')
      document.getElementById('searchPanelNav').style.display = 'none'
      document.getElementById('remoteSearchInput').value = ''
    }

    function doSearch() {
      const keyword = document.getElementById('remoteSearchInput').value.trim()
      if (keyword) {
        sendCommand('search', { keyword })
      }
    }

    function toggleGotoPanel() {
      const panel = document.getElementById('gotoPanel')
      document.getElementById('searchPanel').classList.remove('active')
      panel.classList.toggle('active')
      if (panel.classList.contains('active')) {
        document.getElementById('remoteGotoInput').focus()
      }
    }

    function doGoto() {
      const page = parseInt(document.getElementById('remoteGotoInput').value)
      if (page && page >= 1) {
        sendCommand('goto', { page })
        document.getElementById('gotoPanel').classList.remove('active')
        document.getElementById('remoteGotoInput').value = ''
      }
    }

    // Virtual Joystick with acceleration (no inertia)
    ;(function initJoystick() {
      const base = document.getElementById('joystickBase')
      const thumb = document.getElementById('joystickThumb')
      const baseRadius = 65
      const thumbRadius = 23
      const maxDist = baseRadius - thumbRadius

      const PAN_BASE = 4
      const PAN_ACCEL = 20

      let dragging = false
      let joyX = 0, joyY = 0
      let panInterval = null

      function getJoyPos(e) {
        const rect = base.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const touch = e.touches ? e.touches[0] : e
        return { x: touch.clientX - cx, y: touch.clientY - cy }
      }

      function clampDist(x, y) {
        const dist = Math.sqrt(x * x + y * y)
        if (dist > maxDist) {
          const scale = maxDist / dist
          return { x: x * scale, y: y * scale }
        }
        return { x, y }
      }

      function updateThumb(x, y) {
        thumb.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
      }

      function calcSpeed(normalized) {
        return PAN_BASE + PAN_ACCEL * Math.pow(Math.abs(normalized), 2)
      }

      function startPanning() {
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

      function stopPanning() {
        if (panInterval) {
          clearInterval(panInterval)
          panInterval = null
        }
      }

      function onStart(e) {
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

      function onMove(e) {
        if (!dragging) return
        e.preventDefault()
        const pos = getJoyPos(e)
        const clamped = clampDist(pos.x, pos.y)
        joyX = clamped.x
        joyY = clamped.y
        updateThumb(joyX, joyY)
      }

      function onEnd() {
        if (!dragging) return
        dragging = false
        joyX = 0
        joyY = 0
        stopPanning()
        thumb.classList.add('released')
        updateThumb(0, 0)
      }

      base.addEventListener('mousedown', onStart)
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onEnd)

      base.addEventListener('touchstart', onStart, { passive: false })
      base.addEventListener('touchmove', onMove, { passive: false })
      base.addEventListener('touchend', onEnd)
      base.addEventListener('touchcancel', onEnd)
    })()
