import { Line, Group, RegularPolygon, Circle } from 'react-konva'
import type { SupportType } from '@/lib/types'

interface SupportShapeProps {
  x: number
  y: number
  type: SupportType
  onSelect?: () => void
}

export function SupportShape({ x, y, type, onSelect }: SupportShapeProps) {
  const size = 14
  const supportColor = '#262626'

  if (type === 'fixed') {
    // Hatched base line
    const hatches: React.ReactNode[] = []
    for (let i = -3; i <= 3; i++) {
      hatches.push(
        <Line
          key={`h${i}`}
          points={[i * 5 - 3, size + 3, i * 5 + 3, size + 9]}
          stroke={supportColor}
          strokeWidth={1}
          listening={false}
        />,
      )
    }
    return (
      <Group
        x={x}
        y={y}
        listening={!!onSelect}
        onClick={onSelect}
        onTap={onSelect}
      >
        <Circle radius={22} fill="#000000" opacity={0.001} />
        <Line
          points={[-18, size, 18, size]}
          stroke={supportColor}
          strokeWidth={2}
        />
        {hatches}
      </Group>
    )
  }

  if (type === 'pinned') {
    // Triangle
    return (
      <Group
        x={x}
        y={y}
        listening={!!onSelect}
        onClick={onSelect}
        onTap={onSelect}
      >
        <Circle radius={22} fill="#000000" opacity={0.001} />
        <RegularPolygon
          sides={3}
          radius={size}
          y={size}
          fill="transparent"
          stroke={supportColor}
          strokeWidth={2}
        />
        <Line
          points={[-18, size + size, 18, size + size]}
          stroke={supportColor}
          strokeWidth={2}
        />
      </Group>
    )
  }

  // Roller
  return (
    <Group
      x={x}
      y={y}
      listening={!!onSelect}
      onClick={onSelect}
      onTap={onSelect}
    >
      <Circle radius={22} fill="#000000" opacity={0.001} />
      <RegularPolygon
        sides={3}
        radius={size}
        y={size}
        fill="transparent"
          stroke={supportColor}
          strokeWidth={2}
      />
      <Circle
        y={size + size + 4}
        radius={4}
        fill="transparent"
        stroke={supportColor}
        strokeWidth={2}
      />
      <Line
        points={[-18, size + size + 10, 18, size + size + 10]}
        stroke={supportColor}
        strokeWidth={2}
      />
    </Group>
  )
}
