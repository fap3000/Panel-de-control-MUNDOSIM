import { formatFechaCorta, todayIso } from '../lib/dateFilter'

type Props = {
  value: string
  onChange: (iso: string) => void
}

export function DateSelector({ value, onChange }: Props) {
  const esHoy = value === todayIso()

  return (
    <div className="date-selector">
      <label htmlFor="fecha-tablero">Ver datos hasta</label>
      <input
        id="fecha-tablero"
        type="date"
        value={value}
        max={todayIso()}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
      {!esHoy && (
        <>
          <span className="date-selector-badge">histórico · {formatFechaCorta(value)}</span>
          <button type="button" className="date-selector-reset" onClick={() => onChange(todayIso())}>
            Volver a hoy
          </button>
        </>
      )}
    </div>
  )
}
