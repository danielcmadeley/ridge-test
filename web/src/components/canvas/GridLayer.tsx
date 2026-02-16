import { Line, Text } from 'react-konva'

interface GridLayerProps {
  width: number
  height: number
  gridSize: number // pixels per metre
  offsetX: number
  offsetY: number
}

export function GridLayer({
  width,
  height,
  gridSize,
  offsetX,
  offsetY,
}: GridLayerProps) {
  const lines: React.ReactNode[] = []
  const labels: React.ReactNode[] = []

  // Compute visible grid range
  const startX = Math.floor(-offsetX / gridSize) - 1
  const endX = Math.ceil((width - offsetX) / gridSize) + 1
  const startY = Math.floor(-offsetY / gridSize) - 1
  const endY = Math.ceil((height - offsetY) / gridSize) + 1

  // Vertical lines
  for (let i = startX; i <= endX; i++) {
    const x = i * gridSize + offsetX
    const isMajor = i % 5 === 0
    lines.push(
      <Line
        key={`v${i}`}
        points={[x, 0, x, height]}
        stroke={isMajor ? 'rgba(38,38,38,0.24)' : 'rgba(64,64,64,0.14)'}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false}
      />,
    )
    if (isMajor) {
      labels.push(
        <Text
          key={`lv${i}`}
          x={x + 3}
          y={height - 16}
          text={`${i}m`}
          fontSize={10}
          fill="rgba(38,38,38,0.55)"
          listening={false}
        />,
      )
    }
  }

  // Horizontal lines
  for (let j = startY; j <= endY; j++) {
    const y = j * gridSize + offsetY
    const isMajor = j % 5 === 0
    lines.push(
      <Line
        key={`h${j}`}
        points={[0, y, width, y]}
        stroke={isMajor ? 'rgba(38,38,38,0.24)' : 'rgba(64,64,64,0.14)'}
        strokeWidth={isMajor ? 1 : 0.5}
        listening={false}
      />,
    )
    if (isMajor) {
      labels.push(
        <Text
          key={`lh${j}`}
          x={3}
          y={y + 3}
          text={`${-j}m`}
          fontSize={10}
          fill="rgba(38,38,38,0.55)"
          listening={false}
        />,
      )
    }
  }

  return (
    <>
      {lines}
      {labels}
    </>
  )
}
