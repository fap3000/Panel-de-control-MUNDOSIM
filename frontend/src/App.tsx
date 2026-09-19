import { useState } from 'react'
import { DateSelector } from './components/DateSelector'
import { todayIso } from './lib/dateFilter'
import { Compras } from './pages/Compras'
import { Contabilidad } from './pages/Contabilidad'
import { Panel } from './pages/Panel'
import { Ventas } from './pages/Ventas'
import './App.css'

const TABS = [
  { key: 'compras', label: 'Compras' },
  { key: 'ventas', label: 'Ventas' },
  { key: 'contabilidad', label: 'Contabilidad' },
  { key: 'panel', label: 'Mi panel' },
] as const

function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('compras')
  const [hasta, setHasta] = useState(todayIso())

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

      {tab !== 'panel' && (
        <div className="periodo-bar">
          <DateSelector value={hasta} onChange={setHasta} />
        </div>
      )}

      {tab === 'compras' && <Compras hasta={hasta} />}
      {tab === 'ventas' && <Ventas hasta={hasta} />}
      {tab === 'contabilidad' && <Contabilidad hasta={hasta} />}
      {tab === 'panel' && <Panel />}
    </>
  )
}

export default App
