import type {
  LoadTakedownColumn,
  LoadTakedownModel,
  LoadTakedownSlab,
  MaterialProps,
} from '@/lib/types'

export const DEFAULT_MATERIAL: MaterialProps = {
  name: 'C30/37',
  E: 30e9,
  nu: 0.2,
  rho: 2500,
}

export function createEmptyModel(): LoadTakedownModel {
  const slabDead_kN_m2 = 1.5
  const slabLive_kN_m2 = 3.5
  const slabThickness_m = 0.2
  const concreteDensity_kN_m3 = 25
  const slabUDL =
    (slabDead_kN_m2 + slabLive_kN_m2 + slabThickness_m * concreteDensity_kN_m3) * 1e3

  return {
    version: '0.1',
    units: 'SI',
    gridSize: 0.5,
    storeys: [
      { id: 'ST0', name: 'Ground', elevation: 0 },
      { id: 'ST1', name: 'Level 1', elevation: 3 },
    ],
    elements: [],
    loads: {
      slabDead_kN_m2,
      slabLive_kN_m2,
      slabThickness_m,
      concreteDensity_kN_m3,
      slabUDL,
    },
  }
}

export function createExampleModel(): LoadTakedownModel {
  const slab: LoadTakedownSlab = {
    id: 'S1',
    type: 'slab',
    name: 'Level 1 Slab',
    origin: { x: 0, y: 0, z: 0 },
    width: 8,
    depth: 6,
    thickness: 0.2,
    elevation: 3,
    material: DEFAULT_MATERIAL,
  }

  const columns: LoadTakedownColumn[] = [
    { id: 'C1', type: 'column', name: 'C1', base: { x: 0, y: 0, z: 0 }, height: 3, sizeX: 0.4, sizeY: 0.4, material: DEFAULT_MATERIAL },
    { id: 'C2', type: 'column', name: 'C2', base: { x: 8, y: 0, z: 0 }, height: 3, sizeX: 0.4, sizeY: 0.4, material: DEFAULT_MATERIAL },
    { id: 'C3', type: 'column', name: 'C3', base: { x: 8, y: 6, z: 0 }, height: 3, sizeX: 0.4, sizeY: 0.4, material: DEFAULT_MATERIAL },
    { id: 'C4', type: 'column', name: 'C4', base: { x: 0, y: 6, z: 0 }, height: 3, sizeX: 0.4, sizeY: 0.4, material: DEFAULT_MATERIAL },
  ]

  return {
    ...createEmptyModel(),
    elements: [slab, ...columns],
  }
}
