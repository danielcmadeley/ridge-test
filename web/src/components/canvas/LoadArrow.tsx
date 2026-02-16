import { Arrow, Group, Line, Text } from 'react-konva'

interface PointLoadArrowProps {
  x: number
  y: number
  fx: number
  fy: number
  color?: string
  onSelect?: () => void
}

export function PointLoadArrow({
  x,
  y,
  fx,
  fy,
  color = '#262626',
  onSelect,
}: PointLoadArrowProps) {
  const arrowLen = 40
  const arrows: React.ReactNode[] = []

  if (Math.abs(fx) > 0) {
    const dir = fx > 0 ? 1 : -1
    arrows.push(
      <Arrow
        key="fx"
        points={[x - dir * arrowLen, y, x, y]}
        stroke={color}
        fill={color}
        strokeWidth={2}
        pointerLength={8}
        pointerWidth={6}
        listening={!!onSelect}
      />,
    )
    arrows.push(
      <Text
        key="fx-label"
        x={x - dir * arrowLen - (dir > 0 ? 0 : -10)}
        y={y - 14}
        text={`${Math.abs(fx / 1e3).toFixed(1)} kN`}
        fontSize={10}
        fill={color}
        listening={!!onSelect}
      />,
    )
  }

  if (Math.abs(fy) > 0) {
    const dir = fy > 0 ? -1 : 1 // positive fy = upward, canvas y is inverted
    arrows.push(
      <Arrow
        key="fy"
        points={[x, y + dir * arrowLen, x, y]}
        stroke={color}
        fill={color}
        strokeWidth={2}
        pointerLength={8}
        pointerWidth={6}
        listening={!!onSelect}
      />,
    )
    arrows.push(
      <Text
        key="fy-label"
        x={x + 6}
        y={y + dir * arrowLen / 2 - 6}
        text={`${Math.abs(fy / 1e3).toFixed(1)} kN`}
        fontSize={10}
        fill={color}
        listening={!!onSelect}
      />,
    )
  }

  return (
    <Group listening={!!onSelect} onClick={onSelect} onTap={onSelect}>
      {arrows}
    </Group>
  )
}

interface UDLArrowsProps {
  x1: number
  y1: number
  x2: number
  y2: number
  wy: number
  color?: string
  onSelect?: () => void
}

export function UDLArrows({
  x1,
  y1,
  x2,
  y2,
  wy,
  color = '#262626',
  onSelect,
}: UDLArrowsProps) {
  if (Math.abs(wy) < 1) return null

  const numArrows = 7
  const arrowLen = 25
  const dir = wy < 0 ? -1 : 1 // negative wy = downward in structural, which is +y on canvas

  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1) return null

  // Normal vector (perpendicular to element, pointing "up" in structural sense)
  const nx = -dy / len
  const ny = dx / len

  const arrows: React.ReactNode[] = []

  for (let i = 0; i <= numArrows; i++) {
    const t = i / numArrows
    const px = x1 + dx * t
    const py = y1 + dy * t

    arrows.push(
      <Arrow
        key={`udl${i}`}
        points={[
          px + nx * arrowLen * dir,
          py + ny * arrowLen * dir,
          px,
          py,
        ]}
        stroke={color}
        fill={color}
        strokeWidth={1.5}
        pointerLength={6}
        pointerWidth={4}
        listening={!!onSelect}
      />,
    )
  }

  // Top line connecting arrow tails
  arrows.push(
    <Line
      key="udl-top"
      points={[
        x1 + nx * arrowLen * dir,
        y1 + ny * arrowLen * dir,
        x2 + nx * arrowLen * dir,
        y2 + ny * arrowLen * dir,
      ]}
      stroke={color}
      strokeWidth={1.5}
      listening={!!onSelect}
    />,
  )

  // Label
  const midX = (x1 + x2) / 2 + nx * arrowLen * dir
  const midY = (y1 + y2) / 2 + ny * arrowLen * dir
  arrows.push(
    <Text
      key="udl-label"
      x={midX + 5}
      y={midY - 14}
      text={`${Math.abs(wy / 1e3).toFixed(1)} kN/m`}
      fontSize={10}
      fill={color}
      listening={!!onSelect}
    />,
  )

  return (
    <Group listening={!!onSelect} onClick={onSelect} onTap={onSelect}>
      {arrows}
    </Group>
  )
}
