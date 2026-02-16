import { useMutation } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadReport } from '@/lib/api'
import { toStructureInput, useStructure } from '@/lib/structure-store'

export function ReportDownload() {
  const state = useStructure()

  const mutation = useMutation({
    mutationFn: downloadReport,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'report.pdf'
      a.click()
      URL.revokeObjectURL(url)
    },
  })

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={mutation.isPending}
      onClick={() => mutation.mutate(toStructureInput(state))}
      className="w-full"
    >
      <Download className="w-4 h-4 mr-2" />
      {mutation.isPending ? 'Generating...' : 'Download PDF Report'}
    </Button>
  )
}
