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
import { FuenteDato } from '../components/FuenteDato'
import { KpiCard } from '../components/KpiCard'
import type { TransferenciaPorCuenta, VentaDiaria } from '../lib/api'
import { formatFechaCorta, hastaFilter, inicioDeMes, isoToLocalDate, todayIso } from '../lib/dateFilter'
import { diasHabilesDelMes } from '../lib/feriados'
import { formatArs, formatPercent } from '../lib/format'
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

function sumaKey(data: VentaDiaria[], key: keyof VentaDiaria): number {
  return data.reduce((acc, row) => acc + (row[key] as number), 0)
}

function promedioHistorico(data: VentaDiaria[], key: keyof VentaDiaria): number {
  const valores = data.map((row) => row[key] as number).filter((v) => v > 0)
  if (valores.length === 0) return 0
  return valores.reduce((a, b) => a + b, 0) / valores.length
}

type Props = { hasta: string }

export function Ventas({ hasta }: Props) {
  const diariasRaw = useEndpoint<VentaDiaria[]>('/ventas/diarias')
  const porCuenta = useEndpoint<TransferenciaPorCuenta[]>(
    `/ventas/transferencias-por-cuenta?desde=${inicioDeMes(hasta)}&hasta=${hasta}`,
  )

  const dias = diasHabilesDelMes()
  const esHoy = hasta === todayIso()
  const etiquetaDia = esHoy ? 'hoy' : formatFechaCorta(hasta)

  return (
    <div className="page">
      <h1>Ventas</h1>

      {diariasRaw.status === 'loading' && <p>Cargando...</p>}
      {diariasRaw.status === 'error' && <p className="error">Error: {diariasRaw.message}</p>}

      {diariasRaw.status === 'ok' && (() => {
        const data = hastaFilter(diariasRaw.data, (row) => row.fecha, hasta)
        if (data.length === 0) {
          return <p className="hint-row">No hay ventas registradas hasta la fecha seleccionada.</p>
        }
        const hoy = data[data.length - 1]
        const mesActual = data.filter((row) => esMismoMes(row.fecha, isoToLocalDate(hasta)))

        const promCombinado = promedioHistorico(data, 'combinado')
        const promMdz = promedioHistorico(data, 'mdz')
        const promSj = promedioHistorico(data, 'sj')

        const deltaHoy = promCombinado > 0 ? ((hoy.combinado - promCombinado) / promCombinado) * 100 : 0

        return (
          <>
            <section className="kpis">
              <KpiCard
                label={esHoy ? 'Consolidado hoy' : `Consolidado el ${etiquetaDia}`}
                value={formatArs(hoy.combinado)}
                hint={`${hoy.fecha} · Mdz + SJ`}
                tone="info"
              />
              <KpiCard label={`Transferencias ${etiquetaDia}`} value={formatArs(hoy.transferencias)} tone="info" />
              <KpiCard label={`Efectivo ${etiquetaDia}`} value={formatArs(hoy.efectivo)} tone="info" />
              <KpiCard
                label={`${esHoy ? 'Hoy' : 'Ese día'} vs. promedio histórico`}
                value={formatPercent(deltaHoy)}
                hint={`promedio diario: ${formatArs(promCombinado)}`}
                tone={deltaHoy >= 0 ? 'good' : deltaHoy > -20 ? 'warning' : 'critical'}
              />
            </section>

            <section className="kpis">
              <KpiCard label="Acumulado del mes (ingreso)" value={formatArs(sumaKey(mesActual, 'combinado'))} tone="info" />
              <KpiCard label="Acumulado transferencias del mes" value={formatArs(sumaKey(mesActual, 'transferencias'))} tone="info" />
              <KpiCard label="Acumulado efectivo del mes" value={formatArs(sumaKey(mesActual, 'efectivo'))} tone="info" />
              {esHoy && (
                <KpiCard
                  label="Días hábiles del mes"
                  value={`${dias.transcurridos} / ${dias.totalMes}`}
                  hint={`restan ${dias.restantes} (sin domingos ni feriados)`}
                  tone="info"
                  meterPercent={(dias.transcurridos / dias.totalMes) * 100}
                />
              )}
            </section>

            <section className="panel">
              <h2>Ventas diarias por sucursal ({esHoy ? 'últimos 45 días' : `hasta el ${etiquetaDia}`})</h2>
              <FuenteDato texto="Consolidado Mdz y SJ — hojas 'Mdz Transferencias', 'SJ Transferencias', 'Mdz $', 'SJ $'" />
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
                  <Tooltip formatter={(value) => formatArs(Number(value))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="mdz" name="Mendoza" stroke={PALETTE.categorical.blue} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="sj" name="San Juan" stroke={PALETTE.categorical.orange} strokeWidth={2} dot={false} />
                  <Line
                    type="monotone"
                    dataKey="combinado"
                    name="Combinado"
                    stroke={PALETTE.ink.primary}
                    strokeWidth={2}
                    dot={false}
                  />
                  <ReferenceLine
                    y={promCombinado}
                    stroke={PALETTE.ink.muted}
                    strokeDasharray="4 4"
                    label={{ value: 'promedio histórico', position: 'insideTopRight', fontSize: 10, fill: PALETTE.ink.muted }}
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
        <h2>Transferencias por cuenta ({esHoy ? 'mes actual' : `mes de ${etiquetaDia}`})</h2>
        <FuenteDato texto="Consolidado Mdz y SJ — hojas 'Mdz Transferencias' y 'SJ Transferencias'" />
        {porCuenta.status === 'loading' && <p>Cargando...</p>}
        {porCuenta.status === 'error' && <p className="error">Error: {porCuenta.message}</p>}
        {porCuenta.status === 'ok' && (
          <div className="table-wrap">
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
                    <td data-label="Cuenta">{row.cuenta}</td>
                    <td data-label="Total recibido">{formatArs(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
