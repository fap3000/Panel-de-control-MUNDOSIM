export type LayoutItem = { i: string; x: number; y: number; w: number; h: number }

export type StoredPanel = {
  layout: LayoutItem[]
  widgets: Record<string, string>
}

const KEY = 'panel_widgets_v1'

const EMPTY: StoredPanel = { layout: [], widgets: {} }

export function loadPanel(): StoredPanel {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.layout) || typeof parsed.widgets !== 'object') return EMPTY
    return parsed as StoredPanel
  } catch {
    return EMPTY
  }
}

export function savePanel(panel: StoredPanel): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(panel))
  } catch {
    // localStorage puede fallar (modo privado, cuota llena) — el panel sigue
    // funcionando en memoria durante la sesión, solo no persiste.
  }
}
