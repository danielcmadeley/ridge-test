import type {
  AnalysisOutput,
  DiagramOutput,
  DiagramRequest,
  LoadTakedownAnalysisResult,
  LoadTakedownModel,
  SectionInfo,
  SectionPropertiesOutput,
  SectionPropertiesRequest,
  StructureInput,
} from './types'

const configuredApiBase = (
  import.meta.env.VITE_API_BASE_URL as string | undefined
)?.replace(/\/+$/, '')

const API_BASE = configuredApiBase || (import.meta.env.DEV ? 'http://localhost:8000' : '')

function getApiBase(): string {
  if (API_BASE) {
    return API_BASE
  }

  throw new Error(
    'Missing VITE_API_BASE_URL in production build. Set it in Cloudflare build environment variables and redeploy.',
  )
}

async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  return res.json() as Promise<T>
}

export async function fetchSections(
  type: string = 'all',
): Promise<SectionInfo[]> {
  return apiFetch<SectionInfo[]>(`/api/sections?type=${type}`)
}

export async function analyzeStructure(
  data: StructureInput,
): Promise<AnalysisOutput> {
  return apiFetch<AnalysisOutput>('/api/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function fetchDiagrams(
  data: DiagramRequest,
): Promise<DiagramOutput> {
  return apiFetch<DiagramOutput>('/api/diagrams', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function downloadReport(
  data: StructureInput,
): Promise<Blob> {
  const res = await fetch(`${getApiBase()}/api/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`API error ${res.status}: ${body}`)
  }
  return res.blob()
}

export async function computeSectionProperties(
  data: SectionPropertiesRequest,
): Promise<SectionPropertiesOutput> {
  return apiFetch<SectionPropertiesOutput>('/api/section-properties', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function analyzeLoadTakedown3D(
  data: LoadTakedownModel,
): Promise<LoadTakedownAnalysisResult> {
  const payload = {
    ...data,
    loads: {
      slabUDL: data.loads.slabUDL,
    },
  }
  return apiFetch<LoadTakedownAnalysisResult>('/api/load-takedown/analyze', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
