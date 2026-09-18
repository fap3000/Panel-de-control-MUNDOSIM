import { supabase } from './supabaseClient'

export type LayoutItem = { i: string; x: number; y: number; w: number; h: number }

export type StoredPanel = {
  layout: LayoutItem[]
  widgets: Record<string, string>
}

type PanelWidgetRow = {
  id: string
  widget_id: string
  x: number
  y: number
  w: number
  h: number
}

const EMPTY: StoredPanel = { layout: [], widgets: {} }

export async function loadPanel(): Promise<StoredPanel> {
  const { data, error } = await supabase.from('panel_widgets').select('id, widget_id, x, y, w, h')
  if (error || !data) {
    console.error('No se pudo cargar el panel desde Supabase', error)
    return EMPTY
  }
  const rows = data as PanelWidgetRow[]
  return {
    layout: rows.map((r) => ({ i: r.id, x: r.x, y: r.y, w: r.w, h: r.h })),
    widgets: Object.fromEntries(rows.map((r) => [r.id, r.widget_id])),
  }
}

/** Guarda el panel completo: upsert de todas las filas actuales + borra las que
 * ya no están (widgets quitados). El panel es chico (unos pocos widgets), así
 * que un sync completo en cada cambio es más simple y robusto que escrituras
 * parciales incrementales. */
export async function persistPanel(panel: StoredPanel): Promise<void> {
  if (panel.layout.length > 0) {
    const rows = panel.layout.map((item) => ({
      id: item.i,
      widget_id: panel.widgets[item.i],
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
    }))
    const { error } = await supabase.from('panel_widgets').upsert(rows, { onConflict: 'id' })
    if (error) console.error('No se pudo guardar el panel en Supabase', error)
  }

  const { data: existentes } = await supabase.from('panel_widgets').select('id')
  const idsActuales = new Set(panel.layout.map((item) => item.i))
  const idsABorrar = (existentes ?? []).map((r) => r.id as string).filter((id) => !idsActuales.has(id))
  if (idsABorrar.length > 0) {
    const { error } = await supabase.from('panel_widgets').delete().in('id', idsABorrar)
    if (error) console.error('No se pudo limpiar widgets quitados en Supabase', error)
  }
}
