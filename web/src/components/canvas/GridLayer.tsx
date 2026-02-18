import { Line, Text } from 'react-konva'

interface GridLayerProps {
  width: number
  height: number
  gridSize: number // pixels per metre
  gridStepM: number
  offsetX: number
  offsetY: number
}

function formatMetres(value: number) {
  if (Math.abs(value) < 1e-9) return '0m'
  const fixed = Math.abs(value) >= 1 ? value.toFixed(2) : value.toFixed(3)
  const trimmed = fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
  return `${trimmed}m`
}

export function GridLayer({
  width,
  height,
  gridSize,
  gridStepM,
  offsetX,
  offsetY,
}: GridLayerProps) {
  const lines: React.ReactNode[] = []
  const labels: React.ReactNode[] = []

  const stepPx = gridSize * gridStepM
  const majorEvery = 5

  // Compute visible grid range
  const startX = Math.floor(-offsetX / stepPx) - 1
  const endX = Math.ceil((width - offsetX) / stepPx) + 1
  const startY = Math.floor(-offsetY / stepPx) - 1
  const endY = Math.ceil((height - offsetY) / stepPx) + 1

  // Vertical lines
  for (let i = startX; i <= endX; i++) {
    const x = i * stepPx + offsetX
    const isMajor = i % majorEvery === 0
    const isOriginAxis = i === 0
    const xMetres = i * gridStepM
    lines.push(
      <Line
        key={`v${i}`}
        points={[x, 0, x, height]}
        stroke={
          isOriginAxis
            ? '#86efac'
            : isMajor
              ? 'rgba(38,38,38,0.24)'
              : 'rgba(64,64,64,0.14)'
        }
        strokeWidth={isOriginAxis ? 1.5 : isMajor ? 1 : 0.5}
        listening={false}
      />,
    )
    if (isMajor) {
      labels.push(
        <Text
          key={`lv${i}`}
          x={x + 3}
          y={height - 16}
          text={formatMetres(xMetres)}
          fontSize={10}
          fill="rgba(38,38,38,0.55)"
          listening={false}
        />,
      )
    }
  }

  // Horizontal lines
  for (let j = startY; j <= endY; j++) {
    const y = j * stepPx + offsetY
    const isMajor = j % majorEvery === 0
    const isOriginAxis = j === 0
    const yMetres = -j * gridStepM
    lines.push(
      <Line
        key={`h${j}`}
        points={[0, y, width, y]}
        stroke={
          isOriginAxis
            ? '#86efac'
            : isMajor
              ? 'rgba(38,38,38,0.24)'
              : 'rgba(64,64,64,0.14)'
        }
        strokeWidth={isOriginAxis ? 1.5 : isMajor ? 1 : 0.5}
        listening={false}
      />,
    )
    if (isMajor) {
      labels.push(
        <Text
          key={`lh${j}`}
          x={3}
          y={y + 3}
          text={formatMetres(yMetres)}
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
