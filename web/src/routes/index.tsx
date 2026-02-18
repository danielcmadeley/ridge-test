import { createFileRoute, Link } from '@tanstack/react-router'
import { Box, Calculator, GitFork, Home, Wrench } from 'lucide-react'
import { UnifiedHeader } from '@/components/AppToolbar'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export const Route = createFileRoute('/')({ component: WelcomePage })

const tools = [
  {
    title: '2D Frame Analysis',
    description: 'Build frame models, apply load cases, and run EC3 checks.',
    to: '/frame',
    Icon: Wrench,
  },
  {
    title: '2D Truss Analysis',
    description: 'Create pin-jointed trusses and review axial force behavior.',
    to: '/truss',
    Icon: GitFork,
  },
  {
    title: 'Section Properties Calculator',
    description: 'Compose section geometry and compute area and inertia values.',
    to: '/section-properties-calculator',
    Icon: Calculator,
  },
  {
    title: '3D Load Takedown',
    description: 'Model slab and column load paths and check vertical reactions.',
    to: '/3d-load-takedown',
    Icon: Box,
  },
] as const

function WelcomePage() {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <UnifiedHeader title="Welcome" badges={['Form & Function']} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-border bg-card/40 p-6 sm:p-8">
          <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            <Home className="h-3.5 w-3.5" />
            Engineering Toolkit
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
            Start a structural workflow
          </h2>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground sm:text-base">
            Choose a module to begin modelling, analysis, and design checks.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link to="/frame">Open 2D Frame Analysis</Link>
            </Button>
          </div>
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2">
          {tools.map(({ title, description, to, Icon }) => (
            <Card key={to} className="border-border/80 bg-card/60 p-5">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md border border-border bg-background p-2">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold sm:text-base">{title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                    {description}
                  </p>
                  <Button asChild size="sm" variant="secondary" className="mt-4">
                    <Link to={to}>Open Tool</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </section>
      </main>
    </div>
  )
}
