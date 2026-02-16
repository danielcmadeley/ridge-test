import type { DesignStepOutput, ElementDesignOutput } from '@/lib/types'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

interface DesignStepDetailProps {
  element: ElementDesignOutput
}

export function DesignStepDetail({ element }: DesignStepDetailProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-medium">
          {element.name} — {element.designation}
        </h4>
        <span className="text-[10px] text-muted-foreground">
          L = {element.length_m.toFixed(2)} m
        </span>
      </div>
      <div className="text-xs text-muted-foreground">
        Governing: <span className="font-medium">{element.governing_check}</span>{' '}
        ({(element.max_utilisation * 100).toFixed(1)}%)
      </div>

      <Accordion type="multiple" className="w-full">
        {element.steps.map((step) => (
          <AccordionItem
            key={step.step_number}
            value={`step-${step.step_number}`}
          >
            <AccordionTrigger className="text-xs py-1.5 hover:no-underline">
              <div className="flex items-center gap-2 text-left">
                <span
                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    step.ok ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span>
                  Step {step.step_number}: {step.title}
                </span>
                {step.utilisation != null && (
                  <span className="text-muted-foreground font-mono ml-auto mr-2">
                    {(step.utilisation * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <StepDetails step={step} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

function StepDetails({ step }: { step: DesignStepOutput }) {
  const entries = Object.entries(step.details).filter(
    ([, v]) => v !== null && v !== undefined,
  )

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic pl-4">
        No additional details
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pl-4 text-xs">
      {entries.map(([key, value]) => (
        <div key={key} className="flex justify-between">
          <span className="text-muted-foreground">{formatKey(key)}:</span>
          <span className="font-mono">{formatValue(value)}</span>
        </div>
      ))}
    </div>
  )
}

function formatKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1')
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(4)
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}
