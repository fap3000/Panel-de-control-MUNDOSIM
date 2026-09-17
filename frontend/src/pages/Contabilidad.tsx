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
import { ProveedorCard } from '../components/ProveedorCard'
import type { ContabilidadDiaria, EgresoPorCategoria, EstimacionProveedor, ProveedorResumen } from '../lib/api'
import { formatArs, formatUsd, parseMoney } from '../lib/format'
import { PALETTE } from '../lib/palette'
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
  const proveedores = useEndpoint<ProveedorResumen[]>('/compras/resumen-proveedores')
  const estimaciones = useEndpoint<EstimacionProveedor[]>('/compras/estimacion-pago-proveedores')

  const estimacionesPorProveedor =
    estimaciones.status === 'ok'
      ? new Map(estimaciones.data.map((e) => [e.proveedor, e]))
      : new Map<string, EstimacionProveedor>()
  const saldoMaxUsdAbs =
    proveedores.status === 'ok'
      ? Math.max(1, ...proveedores.data.map((p) => Math.abs(parseMoney(p['USD con TC Blue del dia']))))
      : 1

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
              <KpiCard label="Ingresos hoy" value={formatArs(hoy.ingresos)} hint={hoy.fecha} tone="info" />
              <KpiCard label="Egresos hoy" value={formatArs(hoy.egresos)} tone="warning" />
              <KpiCard label="Neto hoy" value={formatArs(hoy.neto)} tone={hoy.neto >= 0 ? 'good' : 'critical'} />
            </section>

            <section className="kpis">
              <KpiCard label="Ingresos del mes" value={formatArs(suma(mesActual, 'ingresos'))} tone="info" />
              <KpiCard label="Egresos del mes" value={formatArs(suma(mesActual, 'egresos'))} tone="warning" />
              <KpiCard
                label="Neto del mes"
                value={formatArs(suma(mesActual, 'neto'))}
                tone={suma(mesActual, 'neto') >= 0 ? 'good' : 'critical'}
              />
            </section>

            <section className="panel">
              <h2>Ingresos vs. egresos (últimos 45 días)</h2>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.slice(-45)}>
                  <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.ink.gridline} />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fontSize: 10, fill: PALETTE.ink.muted }}
                    stroke={PALETTE.ink.baseline}
                    interval="preserveStartEnd"
                    angle={-35}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis tick={{ fontSize: 11, fill: PALETTE.ink.muted }} stroke={PALETTE.ink.baseline} width={50} />
                  <Tooltip formatter={(value: number) => formatArs(value)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="ingresos" name="Ingresos" stroke={PALETTE.categorical.blue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="egresos" name="Egresos" stroke={PALETTE.categorical.orange} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="neto" name="Neto" stroke={PALETTE.ink.primary} strokeWidth={2} dot={false} />
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
          <div className="table-wrap">
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
                    <td data-label="Categoría">{row.categoria}</td>
                    <td data-label="Mendoza">{formatArs(row.mdz)}</td>
                    <td data-label="San Juan">{formatArs(row.sj)}</td>
                    <td data-label="Total">{formatArs(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Cuentas por pagar a proveedores</h2>
        {proveedores.status === 'loading' && <p>Cargando...</p>}
        {proveedores.status === 'error' && <p className="error">Error: {proveedores.message}</p>}
        {proveedores.status === 'ok' && (
          <>
            <p className="hint-row">
              Saldo total adeudado:{' '}
              {formatUsd(proveedores.data.reduce((s, p) => s + parseMoney(p['USD con TC Blue del dia']), 0))} (TC
              blue del día)
            </p>
            <div className="proveedores-grid">
              {proveedores.data
                .filter((p) => p.Proveedor)
                .map((p) => (
                  <ProveedorCard
                    key={p.Proveedor}
                    proveedor={p}
                    estimacion={estimacionesPorProveedor.get(p.Proveedor)}
                    saldoMaxUsdAbs={saldoMaxUsdAbs}
                  />
                ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
