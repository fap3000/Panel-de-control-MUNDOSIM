import { useState } from 'react'
import { Compras } from './pages/Compras'
import { Contabilidad } from './pages/Contabilidad'
import { Panel } from './pages/Panel'
import { Ventas } from './pages/Ventas'
import './App.css'

const TABS = [
  { key: 'compras', label: 'Compras', Component: Compras },
  { key: 'ventas', label: 'Ventas', Component: Ventas },
  { key: 'contabilidad', label: 'Contabilidad', Component: Contabilidad },
  { key: 'panel', label: 'Mi panel', Component: Panel },
] as const

function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('compras')
  const Active = TABS.find((t) => t.key === tab)!.Component

  return (
    <>
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={t.key === tab ? 'tab active' : 'tab'}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <Active />
    </>
  )
}

export default App
