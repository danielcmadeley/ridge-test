import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { fetchSections } from '@/lib/api'
import type { SectionInfo } from '@/lib/types'

interface SectionSelectorProps {
  value: string
  onChange: (designation: string) => void
  elementRole: 'beam' | 'column' | 'truss_member'
}

type SectionSeries = 'UB' | 'UC' | 'SHS' | 'RHS'

const SERIES_LABELS: Record<SectionSeries, string> = {
  UB: 'Universal Beam',
  UC: 'Universal Column',
  SHS: 'Square Hollow Section',
  RHS: 'Rectangular Hollow Section',
}

function normalizeSeries(series: string): SectionSeries | null {
  const s = series.toUpperCase()
  if (s === 'UB' || s === 'UC' || s === 'SHS' || s === 'RHS') return s
  return null
}

function defaultSeriesForRole(elementRole: SectionSelectorProps['elementRole']): SectionSeries {
  if (elementRole === 'column') return 'UC'
  if (elementRole === 'truss_member') return 'SHS'
  return 'UB'
}

function formatDimensions(section: SectionInfo): string {
  if (section.t_mm != null) {
    return `${section.h_mm} x ${section.b_mm} x ${section.t_mm} mm`
  }
  return `${section.h_mm} x ${section.b_mm} mm`
}

function getSizeSeed(section: SectionInfo): number {
  const remainder = section.designation
    .replace(/^\s*[A-Za-z]+\s*/, '')
    .trim()
  const m = remainder.match(/\d+(?:\.\d+)?/)
  if (m) return Number(m[0])
  return Number(section.h_mm)
}

function designationNumbers(section: SectionInfo): number[] {
  const remainder = section.designation
    .replace(/^\s*[A-Za-z]+\s*/, '')
    .trim()
  return (remainder.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => Number(n))
}

function depthWidthOf(section: SectionInfo): { depth: number; width: number } {
  const nums = designationNumbers(section)
  if (nums.length >= 2) return { depth: nums[0], width: nums[1] }
  return { depth: Number(section.h_mm), width: Number(section.b_mm) }
}

function formatDim(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

function memberSortKey(section: SectionInfo): number {
  const nums = designationNumbers(section)
  if (nums.length >= 3) return nums[2]
  const seed = getSizeSeed(section)
  return seed
}

function formatWeight(section: SectionInfo): string {
  const nums = designationNumbers(section)
  if (nums.length >= 3) {
    const wt = nums[2]
    return Number.isInteger(wt) ? String(wt) : wt.toFixed(1)
  }
  const wt = section.mass_per_metre
  return Number.isInteger(wt) ? String(wt) : wt.toFixed(1)
}

function SectionSeriesGlyph({ series }: { series: SectionSeries }) {
  const stroke = '#262626'
  const fill = 'rgba(38,38,38,0.08)'

  if (series === 'SHS') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" fill={fill} stroke={stroke} strokeWidth="1.8" />
        <rect x="8" y="8" width="8" height="8" fill="transparent" stroke={stroke} strokeWidth="1.4" />
      </svg>
    )
  }

  if (series === 'RHS') {
    return (
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" fill={fill} stroke={stroke} strokeWidth="1.8" />
        <rect x="7" y="9" width="10" height="6" fill="transparent" stroke={stroke} strokeWidth="1.4" />
      </svg>
    )
  }

  const webThickness = series === 'UC' ? 4.2 : 2.8
  const flangeWidth = series === 'UC' ? 15 : 18
  const flangeX = (24 - flangeWidth) / 2
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <rect x={flangeX} y="3" width={flangeWidth} height="3.4" fill={fill} stroke={stroke} strokeWidth="1.4" />
      <rect x={12 - webThickness / 2} y="6.4" width={webThickness} height="11.2" fill={fill} stroke={stroke} strokeWidth="1.4" />
      <rect x={flangeX} y="17.6" width={flangeWidth} height="3.4" fill={fill} stroke={stroke} strokeWidth="1.4" />
    </svg>
  )
}

export function SectionSelector({ value, onChange, elementRole }: SectionSelectorProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedSeries, setSelectedSeries] = useState<SectionSeries>(
    defaultSeriesForRole(elementRole),
  )

  const { data: sections, isLoading } = useQuery({
    queryKey: ['sections', 'all'],
    queryFn: () => fetchSections('all'),
  })

  const currentSection = useMemo(
    () => sections?.find((s) => s.designation === value) ?? null,
    [sections, value],
  )

  const seriesCounts = useMemo(() => {
    const counts: Record<SectionSeries, number> = {
      UB: 0,
      UC: 0,
      SHS: 0,
      RHS: 0,
    }
    for (const s of sections ?? []) {
      const k = normalizeSeries(s.series)
      if (k) counts[k] += 1
    }
    return counts
  }, [sections])

  const visibleSections = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (sections ?? [])
      .filter((s) => normalizeSeries(s.series) === selectedSeries)
      .filter((s) =>
        q.length === 0
          ? true
          : s.designation.toLowerCase().includes(q) ||
            formatDimensions(s).toLowerCase().includes(q),
      )
  }, [sections, search, selectedSeries])

  const tableRows = useMemo(() => {
    const depthMap = new Map<
      number,
      { widthMap: Map<number, SectionInfo[]> }
    >()

    for (const s of visibleSections) {
      const { depth, width } = depthWidthOf(s)
      const byDepth = depthMap.get(depth)
      if (!byDepth) {
        depthMap.set(depth, { widthMap: new Map([[width, [s]]]) })
        continue
      }
      const byWidth = byDepth.widthMap.get(width)
      if (byWidth) {
        byWidth.push(s)
      } else {
        byDepth.widthMap.set(width, [s])
      }
    }

    return [...depthMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .flatMap(([depth, info]) =>
        [...info.widthMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([width, items]) => ({
            depth,
            width,
            items: items.sort(
              (a, b) =>
                memberSortKey(a) - memberSortKey(b) ||
                a.designation.localeCompare(b.designation),
            ),
          })),
      )
  }, [visibleSections])

  const tableRowsWithDepthSpan = useMemo(() => {
    const counts = new Map<number, number>()
    for (const row of tableRows) {
      counts.set(row.depth, (counts.get(row.depth) ?? 0) + 1)
    }

    const seen = new Set<number>()
    return tableRows.map((row) => {
      const firstForDepth = !seen.has(row.depth)
      if (firstForDepth) seen.add(row.depth)
      return {
        ...row,
        showDepth: firstForDepth,
        depthSpan: firstForDepth ? (counts.get(row.depth) ?? 1) : 0,
      }
    })
  }, [tableRows])

  const openSelector = () => {
    const fromCurrent = currentSection ? normalizeSeries(currentSection.series) : null
    setSelectedSeries(fromCurrent ?? defaultSeriesForRole(elementRole))
    setSearch('')
    setOpen(true)
  }

  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">Section</div>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-between px-2.5"
        onClick={openSelector}
      >
        <div className="min-w-0 text-left">
          <div className="truncate text-xs font-medium">{value}</div>
          {currentSection && (
            <div className="truncate text-[10px] text-muted-foreground">
              {currentSection.series} · {currentSection.mass_per_metre} kg/m
            </div>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="!w-[98vw] !max-w-[1600px] h-[92vh] max-h-[1100px] min-h-[760px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle className="text-lg">Select Section</DialogTitle>
            <DialogDescription>
              Choose from UB, UC, SHS and RHS catalogs.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 border-b border-border">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search designation or dimensions"
                className="h-10 pl-9 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)] h-full min-h-0">
            <div className="border-r border-border bg-secondary/30 p-3 space-y-2">
              {(Object.keys(SERIES_LABELS) as SectionSeries[]).map((series) => {
                const active = series === selectedSeries
                return (
                  <button
                    key={series}
                    type="button"
                    onClick={() => setSelectedSeries(series)}
                    className={`w-full rounded-md border px-3 py-3 text-left transition-colors ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-transparent hover:border-border hover:bg-accent/40'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <SectionSeriesGlyph series={series} />
                      <div>
                        <div className="text-sm font-semibold">{series}</div>
                        <div className="text-xs text-muted-foreground">
                          {SERIES_LABELS[series]}
                        </div>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground pl-7">
                      {seriesCounts[series]} sections
                    </div>
                  </button>
                )
              })}
            </div>

            <ScrollArea className="h-full min-h-0">
              <div className="p-3 space-y-2">
                {isLoading && (
                  <div className="px-2 py-2 text-sm text-muted-foreground">Loading sections...</div>
                )}

                {!isLoading && visibleSections.length === 0 && (
                  <div className="px-2 py-2 text-sm text-muted-foreground">
                    No sections match your search.
                  </div>
                )}

                {!isLoading && tableRowsWithDepthSpan.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm border-collapse">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="border-b border-border">
                          <th className="w-20 text-left px-2 py-2 font-semibold text-muted-foreground">D</th>
                          <th className="w-20 text-left px-2 py-2 font-semibold text-muted-foreground">B</th>
                          <th className="text-left px-2 py-2 font-semibold text-muted-foreground">Wt</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tableRowsWithDepthSpan.map((row) => (
                          <tr key={`${row.depth}-${row.width}`} className="border-b border-border/60 align-top">
                            {row.showDepth && (
                              <td rowSpan={row.depthSpan} className="px-2 py-2 text-muted-foreground font-medium">
                                {formatDim(row.depth)}
                              </td>
                            )}
                            <td className="px-2 py-2 text-muted-foreground">{formatDim(row.width)}</td>
                            <td className="px-2 py-2">
                              <div className="flex flex-wrap gap-1">
                                {row.items.map((s) => {
                                  const isCurrent = s.designation === value
                                  return (
                                    <button
                                      key={s.designation}
                                      type="button"
                                      title={`${s.designation} (${s.mass_per_metre} kg/m)`}
                                      onClick={() => {
                                        onChange(s.designation)
                                        setOpen(false)
                                      }}
                                      className={`rounded border px-2 py-1 text-xs transition-colors ${
                                        isCurrent
                                          ? 'border-primary bg-primary/10 text-primary'
                                          : 'border-border bg-secondary/35 hover:bg-accent/45'
                                      }`}
                                    >
                                      {formatWeight(s)}
                                    </button>
                                  )
                                })}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
