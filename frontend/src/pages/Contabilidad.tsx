import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard } from '../components/KpiCard'
import type { ContabilidadDiaria, EgresoPorCategoria } from '../lib/api'
import { formatArs } from '../lib/format'
import { useEndpoint } from '../lib/useEndpoint'

function parseFechaDDMMYYYY(fecha: string): Date {
  const [d, m, y] = fecha.split('/').map(Number)
  return new Date(y, m - 1, d)
}

function esMismoMes(fecha: string, referencia: Date): boolean {
  const d = parseFechaDDMMYYYY(fecha)
  return d.getFullYear() === referencia.getFullYear() && d.getMonth() === referencia.getMonth()
}

function suma(data: ContabilidadDiaria[], key: keyof Omit<ContabilidadDiaria, 'fecha'>): number {
  return data.reduce((acc, row) => acc + row[key], 0)
}

export function Contabilidad() {
  const diario = useEndpoint<ContabilidadDiaria[]>('/contabilidad/diario')
  const egresosCategoria = useEndpoint<EgresoPorCategoria[]>('/contabilidad/egresos-por-categoria')

  return (
    <div className="page">
      <h1>Contabilidad</h1>

      {diario.status === 'loading' && <p>Cargando...</p>}
      {diario.status === 'error' && <p className="error">Error: {diario.message}</p>}

      {diario.status === 'ok' && (() => {
        const data = diario.data
        const hoy = data[data.length - 1]
        const mesActual = data.filter((row) => esMismoMes(row.fecha, new Date()))

        return (
          <>
            <section className="kpis">
              <KpiCard label="Ingresos hoy" value={formatArs(hoy.ingresos)} hint={hoy.fecha} />
              <KpiCard label="Egresos hoy" value={formatArs(hoy.egresos)} />
              <KpiCard label="Neto hoy" value={formatArs(hoy.neto)} />
            </section>

            <section className="kpis">
              <KpiCard label="Ingresos del mes" value={formatArs(suma(mesActual, 'ingresos'))} />
              <KpiCard label="Egresos del mes" value={formatArs(suma(mesActual, 'egresos'))} />
              <KpiCard label="Neto del mes" value={formatArs(suma(mesActual, 'neto'))} />
            </section>

            <section className="panel">
              <h2>Ingresos vs. egresos (últimos 45 días)</h2>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.slice(-45)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatArs(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="egresos" name="Egresos" stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="neto" name="Neto" stroke="#0f172a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </section>
          </>
        )
      })()}

      <section className="panel">
        <h2>Detalle de egresos por categoría (mes actual)</h2>
        <p className="hint-row">
          Las categorías se arman agrupando el texto libre de "Motivo" por palabra clave — "Sueldos" queda separado
          por local, el resto puede tener margen de error si hay textos no reconocidos (caen en "Otros").
        </p>
        {egresosCategoria.status === 'loading' && <p>Cargando...</p>}
        {egresosCategoria.status === 'error' && <p className="error">Error: {egresosCategoria.message}</p>}
        {egresosCategoria.status === 'ok' && (
          <table>
            <thead>
              <tr>
                <th>Categoría</th>
                <th>Mendoza</th>
                <th>San Juan</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {egresosCategoria.data.map((row) => (
                <tr key={row.categoria}>
                  <td>{row.categoria}</td>
                  <td>{formatArs(row.mdz)}</td>
                  <td>{formatArs(row.sj)}</td>
                  <td>{formatArs(row.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
