import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard } from '../components/KpiCard'
import type { TransferenciaPorCuenta, VentaDiaria } from '../lib/api'
import { diasHabilesDelMes } from '../lib/feriados'
import { formatArs, formatPercent } from '../lib/format'
import { useEndpoint } from '../lib/useEndpoint'

function parseFechaDDMMYYYY(fecha: string): Date {
  const [d, m, y] = fecha.split('/').map(Number)
  return new Date(y, m - 1, d)
}

function esMismoMes(fecha: string, referencia: Date): boolean {
  const d = parseFechaDDMMYYYY(fecha)
  return d.getFullYear() === referencia.getFullYear() && d.getMonth() === referencia.getMonth()
}

function sumaKey(data: VentaDiaria[], key: keyof VentaDiaria): number {
  return data.reduce((acc, row) => acc + (row[key] as number), 0)
}

function promedioHistorico(data: VentaDiaria[], key: keyof VentaDiaria): number {
  const valores = data.map((row) => row[key] as number).filter((v) => v > 0)
  if (valores.length === 0) return 0
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

export function Ventas() {
  const diarias = useEndpoint<VentaDiaria[]>('/ventas/diarias')
  const porCuenta = useEndpoint<TransferenciaPorCuenta[]>('/ventas/transferencias-por-cuenta')

  const dias = diasHabilesDelMes()

  return (
    <div className="page">
      <h1>Ventas</h1>

      {diarias.status === 'loading' && <p>Cargando...</p>}
      {diarias.status === 'error' && <p className="error">Error: {diarias.message}</p>}

      {diarias.status === 'ok' && (() => {
        const data = diarias.data
        const hoy = data[data.length - 1]
        const mesActual = data.filter((row) => esMismoMes(row.fecha, new Date()))

        const promCombinado = promedioHistorico(data, 'combinado')
        const promMdz = promedioHistorico(data, 'mdz')
        const promSj = promedioHistorico(data, 'sj')

        const deltaHoy = promCombinado > 0 ? ((hoy.combinado - promCombinado) / promCombinado) * 100 : 0

        return (
          <>
            <section className="kpis">
              <KpiCard label="Consolidado hoy" value={formatArs(hoy.combinado)} hint={`${hoy.fecha} · Mdz + SJ`} />
              <KpiCard label="Transferencias hoy" value={formatArs(hoy.transferencias)} />
              <KpiCard label="Efectivo hoy" value={formatArs(hoy.efectivo)} />
              <KpiCard
                label="Hoy vs. promedio histórico"
                value={formatPercent(deltaHoy)}
                hint={`promedio diario: ${formatArs(promCombinado)}`}
              />
            </section>

            <section className="kpis">
              <KpiCard label="Acumulado del mes (ingreso)" value={formatArs(sumaKey(mesActual, 'combinado'))} />
              <KpiCard label="Acumulado transferencias del mes" value={formatArs(sumaKey(mesActual, 'transferencias'))} />
              <KpiCard label="Acumulado efectivo del mes" value={formatArs(sumaKey(mesActual, 'efectivo'))} />
              <KpiCard
                label="Días hábiles del mes"
                value={`${dias.transcurridos} / ${dias.totalMes}`}
                hint={`restan ${dias.restantes} (sin domingos ni feriados)`}
              />
            </section>

            <section className="panel">
              <h2>Ventas diarias por sucursal (últimos 45 días)</h2>
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={data.slice(-45)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => formatArs(value)} />
                  <Legend />
                  <Line type="monotone" dataKey="mdz" name="Mendoza" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sj" name="San Juan" stroke="#16a34a" strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="combinado"
                    name="Combinado"
                    stroke="#0f172a"
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine
                    y={promCombinado}
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    label={{ value: 'promedio histórico', position: 'insideTopRight', fontSize: 10 }}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className="hint-row">
                Promedio histórico diario — Mendoza: {formatArs(promMdz)} · San Juan: {formatArs(promSj)} ·
                Combinado: {formatArs(promCombinado)}
              </p>
            </section>
          </>
        )
      })()}

      <section className="panel">
        <h2>Transferencias por cuenta (mes actual)</h2>
        {porCuenta.status === 'loading' && <p>Cargando...</p>}
        {porCuenta.status === 'error' && <p className="error">Error: {porCuenta.message}</p>}
        {porCuenta.status === 'ok' && (
          <table>
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Total recibido</th>
              </tr>
            </thead>
            <tbody>
              {porCuenta.data.map((row) => (
                <tr key={row.cuenta}>
                  <td>{row.cuenta}</td>
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
