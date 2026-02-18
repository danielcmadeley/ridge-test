import { Line, Text, Group } from 'react-konva'

interface ElementLineProps {
  x1: number
  y1: number
  x2: number
  y2: number
  points?: number[]
  name: string
  designation?: string
  role: 'beam' | 'column' | 'truss_member'
  selected: boolean
  onSelect: () => void
  showName?: boolean
  showDesignation?: boolean
  showReleaseState?: boolean
  startPinned?: boolean
  endPinned?: boolean
  strokeColor?: string
}

const ROLE_COLORS = {
  beam: '#262626',
  column: '#404040',
  truss_member: '#525252',
}

function splitPolylineAtHalf(points: number[]) {
  if (points.length < 4) return { first: points, second: points }

  let total = 0
  for (let i = 0; i < points.length - 2; i += 2) {
    total += Math.hypot(points[i + 2] - points[i], points[i + 3] - points[i + 1])
  }
  const half = total / 2

  const first: number[] = [points[0], points[1]]
  let remaining = half

  for (let i = 0; i < points.length - 2; i += 2) {
    const x1 = points[i]
    const y1 = points[i + 1]
    const x2 = points[i + 2]
    const y2 = points[i + 3]
    const seg = Math.hypot(x2 - x1, y2 - y1)

    if (seg <= 1e-9) continue

    if (remaining >= seg) {
      first.push(x2, y2)
      remaining -= seg
      continue
    }

    const t = remaining / seg
    const mx = x1 + (x2 - x1) * t
    const my = y1 + (y2 - y1) * t
    first.push(mx, my)

    const second = [mx, my, ...points.slice(i + 2)]
    return { first, second }
  }

  return { first: points, second: points }
}

export function ElementLine({
  x1,
  y1,
  x2,
  y2,
  points,
  name,
  designation,
  role,
  selected,
  onSelect,
  showName = true,
  showDesignation = false,
  showReleaseState = false,
  startPinned = false,
  endPinned = false,
  strokeColor,
}: ElementLineProps) {
  const color = strokeColor ?? ROLE_COLORS[role]
  const linePoints = points && points.length >= 4 ? points : [x1, y1, x2, y2]
  const pointCount = linePoints.length / 2
  const midX =
    pointCount <= 2
      ? (x1 + x2) / 2
      : linePoints[Math.floor(pointCount / 2) * 2]
  const midY =
    pointCount <= 2
      ? (y1 + y2) / 2
      : linePoints[Math.floor(pointCount / 2) * 2 + 1]
  const tagX = midX + 6
  const tagY = midY - 14
  const releaseStartColor = startPinned ? '#facc15' : '#16a34a'
  const releaseEndColor = endPinned ? '#facc15' : '#16a34a'
  const split = splitPolylineAtHalf(linePoints)
  const strokeWidth = selected ? 4 : 3

  return (
    <Group onClick={onSelect} onTap={onSelect}>
      {showReleaseState && role !== 'truss_member' ? (
        <>
          <Line
            points={split.first}
            stroke={releaseStartColor}
            strokeWidth={strokeWidth}
            hitStrokeWidth={12}
          />
          <Line
            points={split.second}
            stroke={releaseEndColor}
            strokeWidth={strokeWidth}
            hitStrokeWidth={12}
          />
        </>
      ) : (
        <Line
          points={linePoints}
          stroke={selected ? '#15803d' : color}
          strokeWidth={strokeWidth}
          hitStrokeWidth={12}
        />
      )}
      {showName && (
        <Text
          x={midX - 110}
          y={tagY}
          width={220}
          align="center"
          text={name}
          fontSize={12}
          fontStyle="bold"
          fill="#525252"
          opacity={1}
        />
      )}
      {showDesignation && designation && (
        <Text
          x={midX - 130}
          y={showName ? tagY + 12 : tagY}
          width={260}
          align="center"
          text={designation}
          fontSize={11}
          fill="#525252"
          opacity={1}
        />
      )}
    </Group>
  )
}
