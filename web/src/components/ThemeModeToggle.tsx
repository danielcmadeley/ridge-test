import { Moon, Sun } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useThemeMode } from '@/lib/theme'

export function ThemeModeToggle() {
  const { mode, setMode } = useThemeMode()
  const dark = mode === 'dark'

  return (
    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <Sun className="h-3.5 w-3.5" />
      <Switch
        checked={dark}
        onCheckedChange={(checked) => setMode(checked ? 'dark' : 'light')}
        aria-label="Toggle dark mode"
      />
      <Moon className="h-3.5 w-3.5" />
    </div>
  )
}
