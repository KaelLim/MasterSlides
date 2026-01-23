import { getSupabase } from './supabase-client.js'

let channel = null
let currentRoomId = null

export async function createRoom(roomId, handlers = {}) {
  const supabase = await getSupabase()
  currentRoomId = roomId
  channel = supabase.channel(`room:${roomId}`)

  channel.on('broadcast', { event: 'command' }, ({ payload }) => {
    if (handlers.onCommand) handlers.onCommand(payload)
  })

  channel.on('broadcast', { event: 'remote-joined' }, () => {
    if (handlers.onRemoteJoined) handlers.onRemoteJoined()
  })

  await channel.subscribe()
  return channel
}

export async function joinRoom(roomId, handlers = {}) {
  const supabase = await getSupabase()
  currentRoomId = roomId
  channel = supabase.channel(`room:${roomId}`)

  channel.on('broadcast', { event: 'sync' }, ({ payload }) => {
    if (handlers.onSync) handlers.onSync(payload)
  })

  await channel.subscribe()

  // Notify host that remote has joined
  await channel.send({
    type: 'broadcast',
    event: 'remote-joined',
    payload: {},
  })

  return channel
}

export function sendCommand(action, data = {}) {
  if (!channel) return
  channel.send({
    type: 'broadcast',
    event: 'command',
    payload: { action, ...data },
  })
}

export function syncState(state) {
  if (!channel) return
  channel.send({
    type: 'broadcast',
    event: 'sync',
    payload: state,
  })
}

export function getRoomId() {
  return currentRoomId
}

export function disconnect() {
  if (channel) {
    channel.unsubscribe()
    channel = null
    currentRoomId = null
  }
}
