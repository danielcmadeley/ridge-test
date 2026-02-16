import { useMemo, useRef, type RefObject } from 'react'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import {
  GizmoHelper,
  GizmoViewport,
  Grid,
  Html,
  OrbitControls,
  TransformControls,
} from '@react-three/drei'
import { MOUSE } from 'three'
import type { Mesh } from 'three'
import type { LoadTakedownColumnResult, LoadTakedownElement } from '@/lib/types'
import { useLoadTakedown3DStore } from './store'

function snap(value: number, grid: number) {
  if (grid <= 0) return value
  return Math.round(value / grid) * grid
}

function elementCenter(element: LoadTakedownElement): [number, number, number] {
  if (element.type === 'slab') {
    return [
      element.origin.x + element.width / 2,
      element.origin.y + element.depth / 2,
      element.elevation - element.thickness / 2,
    ]
  }
  if (element.type === 'column') {
    return [
      element.base.x,
      element.base.y,
      element.base.z + element.height / 2,
    ]
  }

  const c = Math.cos(element.rotationZ)
  const s = Math.sin(element.rotationZ)
  const cx = element.origin.x + (element.length / 2) * c - (element.thickness / 2) * s
  const cy = element.origin.y + (element.length / 2) * s + (element.thickness / 2) * c
  const cz = element.origin.z + element.height / 2
  return [cx, cy, cz]
}

export function Viewport3D() {
  const model = useLoadTakedown3DStore((s) => s.model)
  const tool = useLoadTakedown3DStore((s) => s.activeTool)
  const viewMode = useLoadTakedown3DStore((s) => s.viewMode)
  const selectedId = useLoadTakedown3DStore((s) => s.selectedId)
  const selectedIds = useLoadTakedown3DStore((s) => s.selectedIds)
  const setSelectedId = useLoadTakedown3DStore((s) => s.setSelectedId)
  const selectElement = useLoadTakedown3DStore((s) => s.selectElement)
  const updateElement = useLoadTakedown3DStore((s) => s.updateElement)
  const analysis = useLoadTakedown3DStore((s) => s.analysis)
  const orbitRef = useRef<any>(null)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const selectedElement = useMemo(
    () => model.elements.find((e) => e.id === selectedId) ?? null,
    [model.elements, selectedId],
  )

  const columnResultById = useMemo(() => {
    const map = new Map<string, LoadTakedownColumnResult>()
    for (const c of analysis?.columns ?? []) map.set(c.id, c)
    return map
  }, [analysis])

  const bins = useMemo(() => {
    const cols = analysis?.columns ?? []
    if (!cols.length) return new Map<string, 'low' | 'medium' | 'high'>()
    const magnitudes = cols.map((c) => Math.abs(c.N_base))
    const max = Math.max(...magnitudes)
    const map = new Map<string, 'low' | 'medium' | 'high'>()
    if (max <= 0) {
      for (const c of cols) map.set(c.id, 'low')
      return map
    }
    const low = max * 0.33
    const high = max * 0.66
    for (const c of cols) {
      const m = Math.abs(c.N_base)
      map.set(c.id, m < low ? 'low' : m < high ? 'medium' : 'high')
    }
    return map
  }, [analysis])

  return (
    <div className="h-full w-full bg-neutral-400">
      <Canvas
        camera={{ position: [12, -14, 10], fov: 45 }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor('#a3a3a3')
          camera.up.set(0, 0, 1)
        }}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[12, 10, 18]} intensity={1.1} />

        <Grid
          args={[120, 120]}
          rotation={[Math.PI / 2, 0, 0]}
          cellSize={model.gridSize}
          sectionSize={model.gridSize * 5}
          cellColor="#737373"
          sectionColor="#404040"
          fadeDistance={160}
          fadeStrength={1}
          infiniteGrid
        />

        <axesHelper args={[3]} />

        <Html position={[0, 0, 0]}>
          <div className="pointer-events-none fixed left-3 top-3 rounded border border-neutral-700/30 bg-white/70 px-2 py-1 text-[11px] text-neutral-800">
            3D view · Drag to orbit · Right-drag to pan · Wheel to zoom
          </div>
        </Html>

        <mesh
          position={[0, 0, 0]}
          onPointerDown={(e) => {
            if (tool === 'select') {
              setSelectedId(null)
            }
            e.stopPropagation()
          }}
        >
          <planeGeometry args={[400, 400]} />
          <meshBasicMaterial visible={false} />
        </mesh>

        {selectedElement && tool === 'move' && selectedIds.length === 1 ? (
          <SelectableTransform
            element={selectedElement}
            gridSize={model.gridSize}
            onCommit={(next) => updateElement(selectedElement.id, () => next)}
            onSelect={(additive) => selectElement(selectedElement.id, additive)}
            colorBin={selectedElement.type === 'column' ? bins.get(selectedElement.id) : undefined}
            columnResult={columnResultById.get(selectedElement.id)}
            orbitRef={orbitRef}
          />
        ) : (
          model.elements.map((element) => (
            <ElementMesh
              key={element.id}
              element={element}
              selected={selectedSet.has(element.id)}
              onSelect={(additive) => selectElement(element.id, additive)}
              colorBin={element.type === 'column' ? bins.get(element.id) : undefined}
              columnResult={columnResultById.get(element.id)}
            />
          ))
        )}

        <OrbitControls
          ref={orbitRef}
          makeDefault
          enableDamping
          dampingFactor={0.09}
          rotateSpeed={0.8}
          panSpeed={0.9}
          zoomSpeed={0.85}
          screenSpacePanning
          mouseButtons={{
            LEFT: MOUSE.ROTATE,
            MIDDLE: MOUSE.PAN,
            RIGHT: MOUSE.PAN,
            WHEEL: MOUSE.DOLLY,
          }}
        />

        <GizmoHelper alignment="top-right" margin={[88, 88]}>
          <GizmoViewport
            axisColors={['#dc2626', '#16a34a', '#2563eb']}
            labelColor="#111827"
          />
        </GizmoHelper>

        {viewMode === '3d' && (tool === 'slab' || tool === 'column') && (
          <Html position={[0, 0, 0]} center>
            <div className="text-xs px-2 py-1 rounded bg-black/70 text-white border border-white/20 whitespace-nowrap">
              Add slabs/columns in 2D Levels mode
            </div>
          </Html>
        )}
      </Canvas>
    </div>
  )
}

function SelectableTransform({
  element,
  gridSize,
  onCommit,
  onSelect,
  colorBin,
  columnResult,
  orbitRef,
}: {
  element: LoadTakedownElement
  gridSize: number
  onCommit: (element: LoadTakedownElement) => void
  onSelect: (additive: boolean) => void
  colorBin?: 'low' | 'medium' | 'high'
  columnResult?: LoadTakedownColumnResult
  orbitRef: RefObject<any>
}) {
  const meshRef = useRef<Mesh>(null)

  return (
    <TransformControls
      mode="translate"
      translationSnap={gridSize}
      onDraggingChanged={(ev) => {
        if (orbitRef.current) orbitRef.current.enabled = !ev.value
      }}
      onMouseUp={() => {
        const mesh = meshRef.current
        if (!mesh) return
        const pos = mesh.position
        const x = snap(pos.x, gridSize)
        const y = snap(pos.y, gridSize)
        const z = snap(pos.z, gridSize)

        if (element.type === 'slab') {
          onCommit({
            ...element,
            origin: { ...element.origin, x: x - element.width / 2, y: y - element.depth / 2 },
            elevation: z + element.thickness / 2,
          })
        } else if (element.type === 'column') {
          onCommit({
            ...element,
            base: { ...element.base, x, y, z: z - element.height / 2 },
          })
        } else {
          const c = Math.cos(element.rotationZ)
          const s = Math.sin(element.rotationZ)
          onCommit({
            ...element,
            origin: {
              ...element.origin,
              x: x - (element.length / 2) * c + (element.thickness / 2) * s,
              y: y - (element.length / 2) * s - (element.thickness / 2) * c,
              z: z - element.height / 2,
            },
          })
        }
      }}
    >
      <ElementMesh
        element={element}
        selected
        meshRef={meshRef}
        onSelect={onSelect}
        colorBin={colorBin}
        columnResult={columnResult}
      />
    </TransformControls>
  )
}

function ElementMesh({
  element,
  selected,
  onSelect,
  meshRef,
  colorBin,
  columnResult,
}: {
  element: LoadTakedownElement
  selected: boolean
  onSelect: (additive: boolean) => void
  meshRef?: RefObject<Mesh>
  colorBin?: 'low' | 'medium' | 'high'
  columnResult?: LoadTakedownColumnResult
}) {
  const color =
    element.type !== 'column'
      ? element.type === 'slab'
        ? '#38bdf8'
        : '#94a3b8'
      : colorBin === 'high'
        ? '#ef4444'
        : colorBin === 'medium'
          ? '#f59e0b'
          : '#22c55e'

  const pos = elementCenter(element)

  const common = {
    ref: meshRef,
    position: pos,
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onSelect(e.nativeEvent.shiftKey)
    },
    castShadow: true,
    receiveShadow: true,
  }

  return (
    <group>
      {element.type === 'slab' && (
        <mesh {...common}>
          <boxGeometry args={[element.width, element.depth, element.thickness]} />
          <meshStandardMaterial color={color} opacity={0.5} transparent emissive={selected ? '#1d4ed8' : '#000000'} emissiveIntensity={selected ? 0.7 : 0} />
        </mesh>
      )}

      {element.type === 'column' && (
        <mesh {...common}>
          <boxGeometry args={[element.sizeX, element.sizeY, element.height]} />
          <meshStandardMaterial color={color} emissive={selected ? '#1d4ed8' : '#000000'} emissiveIntensity={selected ? 0.6 : 0} />
        </mesh>
      )}

      {element.type === 'wall' && (
        <mesh {...common} rotation={[0, 0, element.rotationZ]}>
          <boxGeometry args={[element.length, element.thickness, element.height]} />
          <meshStandardMaterial color={color} opacity={0.7} transparent emissive={selected ? '#1d4ed8' : '#000000'} emissiveIntensity={selected ? 0.6 : 0} />
        </mesh>
      )}

      {element.type === 'column' &&
        columnResult?.level_forces?.map((lf, idx) => {
          const isBase = Math.abs(lf.elevation - element.base.z) < 1e-6
          return (
            <Html
              key={`${element.id}-lf-${idx}`}
              position={[
                pos[0],
                pos[1],
                lf.elevation + (isBase ? 0.18 : 0.08),
              ]}
              center
            >
              <div className="text-[11px] px-2 py-1 rounded bg-black/80 text-white border border-white/15 whitespace-nowrap">
                {isBase ? 'Base ' : ''}N = {(lf.N_down / 1e3).toFixed(2)} kN
              </div>
            </Html>
          )
        })}
    </group>
  )
}
