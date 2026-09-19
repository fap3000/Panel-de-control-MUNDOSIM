import { useEffect, useState } from 'react'
import { Responsive, WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'
import { loadPanel, persistPanel, type LayoutItem, type StoredPanel } from '../lib/panelStorage'
import { WIDGET_CATALOG } from '../widgets/registry'

const ResponsiveGridLayout = WidthProvider(Responsive)

const BREAKPOINTS = { lg: 900, md: 700, sm: 520, xs: 0 }
const COLS = { lg: 4, md: 3, sm: 2, xs: 1 }

const GRUPOS = ['Compras', 'Ventas', 'Contabilidad'] as const

export function Panel() {
  const [stored, setStored] = useState<StoredPanel>({ layout: [], widgets: {} })
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadPanel().then((panel) => {
      if (!cancelled) {
        setStored(panel)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  function persist(next: StoredPanel) {
    setStored(next)
    persistPanel(next)
  }

  function addWidget(widgetId: string) {
    const def = WIDGET_CATALOG.find((w) => w.id === widgetId)
    if (!def) return
    const id = `w-${Date.now()}`
    // y real (no Infinity: eso funciona como convención de "al final" dentro de
    // react-grid-layout, pero serializa a null y Supabase lo rechaza)
    const y = stored.layout.length > 0 ? Math.max(...stored.layout.map((item) => item.y + item.h)) : 0
    const nuevoItem: LayoutItem = { i: id, x: 0, y, w: def.defaultSize.w, h: def.defaultSize.h }
    persist({
      widgets: { ...stored.widgets, [id]: widgetId },
      layout: [...stored.layout, nuevoItem],
    })
    setPickerOpen(false)
  }

  function removeWidget(id: string) {
    const widgets = { ...stored.widgets }
    delete widgets[id]
    persist({ widgets, layout: stored.layout.filter((item) => item.i !== id) })
  }

  function handleLayoutChange(layout: readonly LayoutItem[]) {
    persist({ ...stored, layout: [...layout] })
  }

  if (loading) {
    return (
      <div className="page">
        <h1>Mi panel</h1>
        <p>Cargando...</p>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="panel-header">
        <h1>Mi panel</h1>
        <button type="button" className="btn-primary" onClick={() => setPickerOpen(true)}>
          + Agregar widget
        </button>
      </div>

      {stored.layout.length === 0 && (
        <p className="hint-row">Todavía no agregaste widgets. Usá "+ Agregar widget" para empezar.</p>
      )}

      <ResponsiveGridLayout
        className="panel-grid"
        breakpoints={BREAKPOINTS}
        cols={COLS}
        layouts={{ lg: stored.layout }}
        rowHeight={120}
        margin={[12, 12]}
        onLayoutChange={handleLayoutChange}
        draggableCancel=".widget-remove"
      >
        {stored.layout.map((item) => {
          const widgetId = stored.widgets[item.i]
          const def = WIDGET_CATALOG.find((w) => w.id === widgetId)
          if (!def) return null
          const Comp = def.Component
          return (
            <div key={item.i} className="widget-card">
              <button type="button" className="widget-remove" onClick={() => removeWidget(item.i)} aria-label="Quitar widget">
                ×
              </button>
              <Comp />
            </div>
          )
        })}
      </ResponsiveGridLayout>

      {pickerOpen && (
        <div className="picker-overlay" onClick={() => setPickerOpen(false)}>
          <div className="picker" onClick={(e) => e.stopPropagation()}>
            <h2>Agregar widget</h2>
            {GRUPOS.map((grupo) => (
              <div key={grupo} className="picker-group">
                <h3>{grupo}</h3>
                {WIDGET_CATALOG.filter((w) => w.grupo === grupo).map((w) => (
                  <button key={w.id} type="button" className="picker-item" onClick={() => addWidget(w.id)}>
                    {w.label}
                  </button>
                ))}
              </div>
            ))}
            <button type="button" className="picker-close" onClick={() => setPickerOpen(false)}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
