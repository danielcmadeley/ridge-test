import { Line, Text, Group } from 'react-konva'

interface ElementLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  points?: number[]
  name: string
  role: 'beam' | 'column' | 'truss_member'
  selected: boolean
  onSelect: () => void
  showName?: boolean
  strokeColor?: string
}

const ROLE_COLORS = {
  beam: '#262626',
  column: '#404040',
  truss_member: '#525252',
}

export function ElementLine({
  x1,
  y1,
  x2,
  y2,
  points,
  name,
  role,
  selected,
  onSelect,
  showName = true,
  strokeColor,
}: ElementLineProps) {
  const color = strokeColor ?? ROLE_COLORS[role]
  const linePoints = points && points.length >= 4 ? points : [x1, y1, x2, y2]
  const midIndex = Math.floor((linePoints.length / 2) / 2) * 2
  const midX =
    linePoints.length >= 4
      ? linePoints[Math.min(midIndex, linePoints.length - 2)]
      : (x1 + x2) / 2
  const midY =
    linePoints.length >= 4
      ? linePoints[Math.min(midIndex + 1, linePoints.length - 1)]
      : (y1 + y2) / 2

  return (
    <Group onClick={onSelect} onTap={onSelect}>
      <Line
        points={linePoints}
        stroke={selected ? '#15803d' : color}
        strokeWidth={selected ? 4 : 3}
        hitStrokeWidth={12}
      />
      {showName && (
        <Text
          x={midX + 5}
          y={midY - 14}
          text={name}
          fontSize={10}
          fill="#262626"
          opacity={0.85}
        />
      )}
    </Group>
  )
}
