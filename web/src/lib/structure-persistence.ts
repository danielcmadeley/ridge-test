import type { StructureState } from './types'
import { normalizeStructureState } from './structure-store'

export type StructureModule = 'frame' | 'truss'

interface PersistedStructureV1 {
  version: 1
  module: StructureModule
  savedAt: string
  state: StructureState
}

const STORAGE_KEYS: Record<StructureModule, string> = {
  frame: 'ridge:structure:frame:v1',
  truss: 'ridge:structure:truss:v1',
}

function buildPayload(module: StructureModule, state: StructureState): PersistedStructureV1 {
  return {
    version: 1,
    module,
    savedAt: new Date().toISOString(),
    state: normalizeStructureState(state),
  }
}

function parsePayload(raw: unknown): PersistedStructureV1 {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid file format')
  }

  const obj = raw as Partial<PersistedStructureV1>
  if (obj.version !== 1) {
    throw new Error('Unsupported file version')
  }
  if (obj.module !== 'frame' && obj.module !== 'truss') {
    throw new Error('Invalid module in file')
  }
  if (!obj.state || typeof obj.state !== 'object') {
    throw new Error('Missing structure state')
  }

  return {
    version: 1,
    module: obj.module,
    savedAt: typeof obj.savedAt === 'string' ? obj.savedAt : new Date().toISOString(),
    state: normalizeStructureState(obj.state as Partial<StructureState>),
  }
}

export function saveToAutosave(module: StructureModule, state: StructureState) {
  if (typeof window === 'undefined') return
  const payload = buildPayload(module, state)
  window.localStorage.setItem(STORAGE_KEYS[module], JSON.stringify(payload))
}

export function loadFromAutosave(module: StructureModule): StructureState | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(STORAGE_KEYS[module])
  if (!raw) return null

  try {
    const parsed = parsePayload(JSON.parse(raw))
    if (parsed.module !== module) return null
    return parsed.state
  } catch {
    return null
  }
}

export function clearAutosave(module: StructureModule) {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(STORAGE_KEYS[module])
}

export function downloadStructureFile(module: StructureModule, state: StructureState) {
  const payload = buildPayload(module, state)
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const date = new Date().toISOString().slice(0, 10)
  const fileName = `${module}-${date}.ridge.json`

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export async function readStructureFile(
  file: File,
  module: StructureModule,
): Promise<StructureState> {
  const text = await file.text()
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    throw new Error('Selected file is not valid JSON')
  }

  const parsed = parsePayload(parsedJson)
  if (parsed.module !== module) {
    throw new Error(`This file is for ${parsed.module} mode, not ${module} mode`)
  }
  return parsed.state
}
