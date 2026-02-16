import type { LoadTakedownModel } from '@/lib/types'

export function downloadModelJson(model: LoadTakedownModel, filename = 'load-takedown-model.json') {
  const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

export function validateLoadTakedownModel(input: unknown): LoadTakedownModel {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid JSON: expected object')
  }
  const model = input as Partial<LoadTakedownModel>
  if (model.version !== '0.1') throw new Error("Invalid model version (expected '0.1')")
  if (model.units !== 'SI') throw new Error("Invalid units (expected 'SI')")
  if (!isFiniteNumber(model.gridSize) || model.gridSize <= 0) {
    throw new Error('Invalid gridSize')
  }
  if (!Array.isArray(model.storeys)) throw new Error('Invalid storeys array')
  if (!Array.isArray(model.elements)) throw new Error('Invalid elements array')
  if (!model.loads || !isFiniteNumber(model.loads.slabUDL)) {
    throw new Error('Invalid loads.slabUDL')
  }

  const slabDead_kN_m2 = isFiniteNumber((model.loads as any).slabDead_kN_m2)
    ? (model.loads as any).slabDead_kN_m2
    : model.loads.slabUDL / 1e3
  const slabLive_kN_m2 = isFiniteNumber((model.loads as any).slabLive_kN_m2)
    ? (model.loads as any).slabLive_kN_m2
    : 0
  const slabThickness_m = isFiniteNumber((model.loads as any).slabThickness_m)
    ? (model.loads as any).slabThickness_m
    : 0.2
  const concreteDensity_kN_m3 = isFiniteNumber(
    (model.loads as any).concreteDensity_kN_m3,
  )
    ? (model.loads as any).concreteDensity_kN_m3
    : 25

  ;(model.loads as any).slabDead_kN_m2 = slabDead_kN_m2
  ;(model.loads as any).slabLive_kN_m2 = slabLive_kN_m2
  ;(model.loads as any).slabThickness_m = slabThickness_m
  ;(model.loads as any).concreteDensity_kN_m3 = concreteDensity_kN_m3
  ;(model.loads as any).slabUDL =
    (slabDead_kN_m2 + slabLive_kN_m2 + slabThickness_m * concreteDensity_kN_m3) *
    1e3

  return model as LoadTakedownModel
}

export async function loadModelFromFile(file: File): Promise<LoadTakedownModel> {
  const text = await file.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('Could not parse JSON file')
  }
  return validateLoadTakedownModel(parsed)
}
