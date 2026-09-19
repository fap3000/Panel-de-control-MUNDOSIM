import {
  CartesianGrid,
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
import type { CompraDiaria, EstimacionProveedor, PedidoTrello, ProveedorResumen } from '../lib/api'
import { formatFechaCorta, hastaFilter, todayIso } from '../lib/dateFilter'
import { formatUsd, parseMoney } from '../lib/format'
import { PALETTE } from '../lib/palette'
import { useEndpoint } from '../lib/useEndpoint'

type Props = { hasta: string }

export function Compras({ hasta }: Props) {
  const proveedores = useEndpoint<ProveedorResumen[]>('/compras/resumen-proveedores')
  const estimaciones = useEndpoint<EstimacionProveedor[]>('/compras/estimacion-pago-proveedores')
  const comprasDiariasRaw = useEndpoint<CompraDiaria[]>('/compras/compras-diarias')
  const pedidos = useEndpoint<PedidoTrello[]>('/compras/pedidos-trello')

  const esHoy = hasta === todayIso()

  const pendientesTotal =
    proveedores.status === 'ok'
      ? proveedores.data.reduce(
          (sum, p) =>
            sum +
            (Number(p['RMA pendiente']) || 0) +
            (Number(p['NC pendiente']) || 0) +
            (Number(p['OC Pendientes']) || 0),
          0,
        )
      : 0

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
      <h1>Compras</h1>

      <section className="kpis">
        {proveedores.status === 'ok' && (
          <>
            <KpiCard
              label="Saldo total a proveedores"
              value={formatUsd(
                proveedores.data.reduce(
                  (sum, p) => sum + parseMoney(p['USD con TC Blue del dia']),
                  0,
                ),
              )}
              hint="TC blue del día, todos los proveedores"
              tone="info"
            />
            <KpiCard
              label="RMA / NC / OC pendientes"
              value={String(pendientesTotal)}
              hint="suma de las 3 columnas"
              tone={pendientesTotal > 0 ? 'warning' : 'good'}
            />
          </>
        )}
        {pedidos.status === 'ok' && (
          <KpiCard label="Pedidos en Trello" value={String(pedidos.data.length)} hint="tarjetas activas" tone="info" />
        )}
        {(proveedores.status === 'loading' || pedidos.status === 'loading') && (
          <KpiCard label="Cargando..." value="—" />
        )}
      </section>

      <section className="panel">
        <h2>Saldo por proveedor</h2>
        <FuenteDato texto="Pagos a Proveedores — hoja 'RESUMEN' (saldo actual, no varía con la fecha elegida arriba)" />
        <p className="hint-row">
          Verde: se salda en 45 días o menos al ritmo de pago actual · Amarillo: 46-70 días · Rojo: más de 70 días
          o sin pagos recientes.
        </p>
        {proveedores.status === 'loading' && <p>Cargando...</p>}
        {proveedores.status === 'error' && <p className="error">Error: {proveedores.message}</p>}
        {proveedores.status === 'ok' && (
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
        )}
      </section>

      <section className="panel">
        <h2>Compras diarias (USD) {esHoy ? '' : `— hasta el ${formatFechaCorta(hasta)}`}</h2>
        <FuenteDato texto="Consolidado Mdz y SJ — hoja 'Registro Diario U$'" />
        {comprasDiariasRaw.status === 'loading' && <p>Cargando...</p>}
        {comprasDiariasRaw.status === 'error' && <p className="error">Error: {comprasDiariasRaw.message}</p>}
        {comprasDiariasRaw.status === 'ok' && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={hastaFilter(comprasDiariasRaw.data, (row) => row.FECHA, hasta)
                .slice(-30)
                .map((row) => ({
                  fecha: row.FECHA,
                  compras: parseMoney(row['COMPRAS (U$)']),
                }))}
            >
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
              <Tooltip />
              <Line type="monotone" dataKey="compras" stroke={PALETTE.categorical.blue} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="panel">
        <h2>Pedidos (Trello)</h2>
        <FuenteDato texto="Tablero de Trello configurado en el backend (TRELLO_BOARD_ID)" />
        {pedidos.status === 'loading' && <p>Cargando...</p>}
        {pedidos.status === 'error' && <p className="error">Error: {pedidos.message}</p>}
        {pedidos.status === 'ok' && (
          <ul className="pedidos-list">
            {pedidos.data.map((card) => (
              <li key={card.id}>
                <span className="pedido-lista">{card.lista}</span> {card.nombre}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
