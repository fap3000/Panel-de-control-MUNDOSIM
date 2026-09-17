import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard } from '../components/KpiCard'
import type { CompraDiaria, PedidoTrello, ProveedorResumen } from '../lib/api'
import { formatUsd, parseMoney } from '../lib/format'
import { useEndpoint } from '../lib/useEndpoint'

export function Compras() {
  const proveedores = useEndpoint<ProveedorResumen[]>('/compras/resumen-proveedores')
  const comprasDiarias = useEndpoint<CompraDiaria[]>('/compras/compras-diarias')
  const pedidos = useEndpoint<PedidoTrello[]>('/compras/pedidos-trello')

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
            />
            <KpiCard
              label="RMA / NC / OC pendientes"
              value={String(
                proveedores.data.reduce(
                  (sum, p) =>
                    sum +
                    (Number(p['RMA pendiente']) || 0) +
                    (Number(p['NC pendiente']) || 0) +
                    (Number(p['OC Pendientes']) || 0),
                  0,
                ),
              )}
              hint="suma de las 3 columnas"
            />
          </>
        )}
        {pedidos.status === 'ok' && (
          <KpiCard label="Pedidos en Trello" value={String(pedidos.data.length)} hint="tarjetas activas" />
        )}
        {(proveedores.status === 'loading' || pedidos.status === 'loading') && (
          <KpiCard label="Cargando..." value="—" />
        )}
      </section>

      <section className="panel">
        <h2>Saldo por proveedor</h2>
        {proveedores.status === 'loading' && <p>Cargando...</p>}
        {proveedores.status === 'error' && <p className="error">Error: {proveedores.message}</p>}
        {proveedores.status === 'ok' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Saldo</th>
                  <th>USD (TC blue)</th>
                  <th>RMA</th>
                  <th>NC</th>
                  <th>OC</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.data
                  .filter((p) => p.Proveedor)
                  .map((p) => (
                    <tr key={p.Proveedor}>
                      <td data-label="Proveedor">{p.Proveedor}</td>
                      <td data-label="Saldo">{p.Saldo}</td>
                      <td data-label="USD (TC blue)">{p['USD con TC Blue del dia']}</td>
                      <td data-label="RMA">{p['RMA pendiente']}</td>
                      <td data-label="NC">{p['NC pendiente']}</td>
                      <td data-label="OC">{p['OC Pendientes']}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Compras diarias (USD)</h2>
        {comprasDiarias.status === 'loading' && <p>Cargando...</p>}
        {comprasDiarias.status === 'error' && <p className="error">Error: {comprasDiarias.message}</p>}
        {comprasDiarias.status === 'ok' && (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={comprasDiarias.data.slice(-30).map((row) => ({
                fecha: row.FECHA,
                compras: parseMoney(row['COMPRAS (U$)']),
              }))}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 10 }}
                interval="preserveStartEnd"
                angle={-35}
                textAnchor="end"
                height={50}
              />
              <YAxis tick={{ fontSize: 11 }} width={50} />
              <Tooltip />
              <Line type="monotone" dataKey="compras" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <section className="panel">
        <h2>Pedidos (Trello)</h2>
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
