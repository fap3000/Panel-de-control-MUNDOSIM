import { useState } from 'react'
import { Compras } from './pages/Compras'
import { Ventas } from './pages/Ventas'
import './App.css'

const TABS = [
  { key: 'compras', label: 'Compras', Component: Compras },
  { key: 'ventas', label: 'Ventas', Component: Ventas },
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
