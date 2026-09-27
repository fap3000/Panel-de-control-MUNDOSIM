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
import { FuenteDato } from '../components/FuenteDato'
import { KpiCard } from '../components/KpiCard'
import { ProveedorCard } from '../components/ProveedorCard'
import type {
  ComparativaCaja,
  ContabilidadDiaria,
  EgresoPorCategoria,
  EstimacionProveedor,
  ProveedorResumen,
  VentaDiaria,
} from '../lib/api'
import { formatFechaCorta, hastaFilter, inicioDeMes, isoToLocalDate, todayIso } from '../lib/dateFilter'
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

/** '—' si todavía no cargaron el dato nuestro (0 = no es que dio $0, es que esa
 * fecha aún no está en Mdz $/SJ $ — se completa solo apenas lo carguen). */
function celdaDif(nuestro: number, diferencia: number): { texto: string; tone: 'good' | 'warning' | 'critical' | 'neutral' } {
  if (nuestro === 0) return { texto: 'sin datos aún', tone: 'neutral' }
  const abs = Math.abs(diferencia)
  const tone = abs <= 1000 ? 'good' : abs <= 20000 ? 'warning' : 'critical'
  return { texto: formatArs(diferencia), tone }
}

type Props = { hasta: string }

export function Contabilidad({ hasta }: Props) {
  const diarioRaw = useEndpoint<ContabilidadDiaria[]>('/contabilidad/diario')
  const ventasRaw = useEndpoint<VentaDiaria[]>('/ventas/diarias')
  const egresosCategoria = useEndpoint<EgresoPorCategoria[]>(
    `/contabilidad/egresos-por-categoria?desde=${inicioDeMes(hasta)}&hasta=${hasta}`,
  )
  const proveedores = useEndpoint<ProveedorResumen[]>('/compras/resumen-proveedores')
  const estimaciones = useEndpoint<EstimacionProveedor[]>('/compras/estimacion-pago-proveedores')
  const comparativaCaja = useEndpoint<ComparativaCaja[]>('/contabilidad/comparativa-caja')

  const esHoy = hasta === todayIso()
  const etiquetaDia = esHoy ? 'hoy' : formatFechaCorta(hasta)

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

      {diarioRaw.status === 'loading' && <p>Cargando...</p>}
      {diarioRaw.status === 'error' && <p className="error">Error: {diarioRaw.message}</p>}

      {diarioRaw.status === 'ok' && (() => {
        const data = hastaFilter(diarioRaw.data, (row) => row.fecha, hasta)
        if (data.length === 0) {
          return <p className="hint-row">No hay movimientos registrados hasta la fecha seleccionada.</p>
        }
        const hoy = data[data.length - 1]
        const mesActual = data.filter((row) => esMismoMes(row.fecha, isoToLocalDate(hasta)))

        const ventasMes =
          ventasRaw.status === 'ok'
            ? hastaFilter(ventasRaw.data, (row) => row.fecha, hasta).filter((row) =>
                esMismoMes(row.fecha, isoToLocalDate(hasta)),
              )
            : []
        const transferenciasMes = ventasMes.reduce((s, r) => s + r.transferencias, 0)
        const efectivoMes = ventasMes.reduce((s, r) => s + r.efectivo, 0)

        return (
          <>
            <section className="kpis">
              <KpiCard label={esHoy ? 'Ingresos hoy' : `Ingresos el ${etiquetaDia}`} value={formatArs(hoy.ingresos)} hint={hoy.fecha} tone="info" />
              <KpiCard label={esHoy ? 'Egresos hoy' : `Egresos el ${etiquetaDia}`} value={formatArs(hoy.egresos)} tone="warning" />
              <KpiCard
                label={esHoy ? 'Neto hoy' : `Neto el ${etiquetaDia}`}
                value={formatArs(hoy.neto)}
                tone={hoy.neto >= 0 ? 'good' : 'critical'}
              />
            </section>

            <section className="kpis">
              <KpiCard label="Ingresos del mes" value={formatArs(suma(mesActual, 'ingresos'))} tone="info" />
              <KpiCard label="Transferencias del mes" value={formatArs(transferenciasMes)} tone="info" />
              <KpiCard label="Efectivo del mes" value={formatArs(efectivoMes)} tone="info" />
              <KpiCard label="Egresos del mes" value={formatArs(suma(mesActual, 'egresos'))} tone="warning" />
              <KpiCard
                label="Neto del mes"
                value={formatArs(suma(mesActual, 'neto'))}
                tone={suma(mesActual, 'neto') >= 0 ? 'good' : 'critical'}
              />
            </section>

            <section className="panel">
              <h2>Ingresos vs. egresos ({esHoy ? 'últimos 45 días' : `hasta el ${etiquetaDia}`})</h2>
              <FuenteDato texto="Ventas (ver arriba) + Consolidado Mdz y SJ — hojas 'Mdz $' y 'SJ $' (Gasto / Salida de caja)" />
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
        <h2>Cierre de caja: nuestro cálculo vs. real</h2>
        <FuenteDato texto="Hojas 'CAJA' de Mdz y SJ (capturadas ~20:30 antes de que se reseteen) vs. nuestro cálculo de 'Mdz $'/'SJ $' + Transferencias" />
        <p className="hint-row">
          "Real" es el conteo físico de cierre de caja (suma de todas las cajas/cajeros del día). "Sin datos aún"
          significa que esa fecha todavía no se cargó en Mdz $/SJ $ — se completa solo apenas la carguen.
        </p>
        {comparativaCaja.status === 'loading' && <p>Cargando...</p>}
        {comparativaCaja.status === 'error' && <p className="error">Error: {comparativaCaja.message}</p>}
        {comparativaCaja.status === 'ok' && (
          comparativaCaja.data.length === 0 ? (
            <p className="hint-row">Todavía no hay cierres de caja guardados.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th rowSpan={2}>Fecha</th>
                    <th rowSpan={2}>Sucursal</th>
                    <th rowSpan={2}>Cajas</th>
                    <th colSpan={3}>Efectivo</th>
                    <th colSpan={3}>Transferencias</th>
                    <th rowSpan={2}>Gastos (real)</th>
                  </tr>
                  <tr>
                    <th>Nuestro</th>
                    <th>Real</th>
                    <th>Diferencia</th>
                    <th>Nuestro</th>
                    <th>Real</th>
                    <th>Diferencia</th>
                  </tr>
                </thead>
                <tbody>
                  {[...comparativaCaja.data].reverse().map((c) => {
                    const difEfectivo = celdaDif(c.nuestro_efectivo, c.diferencia_efectivo)
                    const difTransf = celdaDif(c.nuestro_transferencias, c.diferencia_transferencias)
                    return (
                      <tr key={`${c.fecha}-${c.sucursal}`}>
                        <td data-label="Fecha">{formatFechaCorta(c.fecha)}</td>
                        <td data-label="Sucursal">{c.sucursal}</td>
                        <td data-label="Cajas">{c.cajas.join(', ')}</td>
                        <td data-label="Efectivo nuestro">{formatArs(c.nuestro_efectivo)}</td>
                        <td data-label="Efectivo real">{formatArs(c.real_efectivo)}</td>
                        <td data-label="Efectivo diferencia">
                          <span className={`dif-tono tone-${difEfectivo.tone}`}>{difEfectivo.texto}</span>
                        </td>
                        <td data-label="Transferencias nuestro">{formatArs(c.nuestro_transferencias)}</td>
                        <td data-label="Transferencias real">{formatArs(c.real_transferencias)}</td>
                        <td data-label="Transferencias diferencia">
                          <span className={`dif-tono tone-${difTransf.tone}`}>{difTransf.texto}</span>
                        </td>
                        <td data-label="Gastos (real)">{formatArs(c.real_gastos)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </section>

      <section className="panel">
        <h2>Detalle de egresos por categoría ({esHoy ? 'mes actual' : `mes de ${etiquetaDia}`})</h2>
        <FuenteDato texto="Consolidado Mdz y SJ — hojas 'Mdz $' y 'SJ $' (columna Motivo, agrupada por palabra clave)" />
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
        <FuenteDato texto="Pagos a Proveedores — hoja 'RESUMEN' (saldo actual, no varía con la fecha elegida arriba)" />
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
                    estimacionesCargando={estimaciones.status === 'loading'}
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
