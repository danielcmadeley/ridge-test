import { Circle, Text, Group } from 'react-konva'
import type { KonvaEventObject } from 'konva/lib/Node'

interface NodeShapeProps {
  x: number // pixel x
  y: number // pixel y
  name: string
  selected: boolean
  onSelect: () => void
  onDragEnd: (x: number, y: number) => void
  draggable: boolean
  gridSize: number
  offsetX: number
  offsetY: number
}

export function NodeShape({
  x,
  y,
  name,
  selected,
  onSelect,
  onDragEnd,
  draggable,
  gridSize,
  offsetX,
  offsetY,
}: NodeShapeProps) {
  const handleDragEnd = (e: KonvaEventObject<DragEvent>) => {
    // Snap to grid in metres
    const rawX = (e.target.x() - offsetX) / gridSize
    const rawY = -(e.target.y() - offsetY) / gridSize
    const snappedX = Math.round(rawX)
    const snappedY = Math.round(rawY)
    // Set position to snapped pixel location
    e.target.x(snappedX * gridSize + offsetX)
    e.target.y(-snappedY * gridSize + offsetY)
    onDragEnd(snappedX, snappedY)
  }

  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Circle
        radius={selected ? 7 : 5}
        fill={selected ? '#15803d' : '#262626'}
        stroke={selected ? '#f5f5f5' : '#e5e5e5'}
        strokeWidth={selected ? 2 : 0}
      />
      <Text
        x={8}
        y={-6}
        text={name}
        fontSize={11}
        fill="#262626"
      />
    </Group>
  )
}
