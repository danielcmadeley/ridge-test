import { Line, Text, Group } from 'react-konva'

interface ElementLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  name: string
  role: 'beam' | 'column' | 'truss_member'
  selected: boolean
  onSelect: () => void
  showName?: boolean
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
  name,
  role,
  selected,
  onSelect,
  showName = true,
}: ElementLineProps) {
  const color = ROLE_COLORS[role]
  const midX = (x1 + x2) / 2
  const midY = (y1 + y2) / 2

  return (
    <Group onClick={onSelect} onTap={onSelect}>
      <Line
        points={[x1, y1, x2, y2]}
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
