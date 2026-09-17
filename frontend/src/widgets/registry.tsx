import type { ComponentType } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type {
  CompraDiaria,
  ContabilidadDiaria,
  PedidoTrello,
  ProveedorResumen,
  VentaDiaria,
} from '../lib/api'
import { formatArs, formatUsd, parseMoney } from '../lib/format'
import { type LoadState, useEndpoint } from '../lib/useEndpoint'

function parseFechaDDMMYYYY(fecha: string): Date {
  const [d, m, y] = fecha.split('/').map(Number)
  return new Date(y, m - 1, d)
}

function esMismoMes(fecha: string, referencia: Date): boolean {
  const d = parseFechaDDMMYYYY(fecha)
  return d.getFullYear() === referencia.getFullYear() && d.getMonth() === referencia.getMonth()
}

function EstadoCarga({ state }: { state: LoadState<unknown> }) {
  if (state.status === 'loading') return <p className="widget-msg">Cargando...</p>
  if (state.status === 'error') return <p className="widget-msg error">Error: {state.message}</p>
  return null
}

function KpiWidget({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="widget-kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  )
}

function MiniChart({ data, dataKey, color }: { data: { fecha: string; valor: number }[]; dataKey: string; color: string }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="fecha" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 9 }} width={42} />
        <Tooltip />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

// --- Compras ---

function SaldoProveedoresWidget() {
  const proveedores = useEndpoint<ProveedorResumen[]>('/compras/resumen-proveedores')
  if (proveedores.status !== 'ok') return <EstadoCarga state={proveedores} />
  const total = proveedores.data.reduce((s, p) => s + parseMoney(p['USD con TC Blue del dia']), 0)
  return <KpiWidget label="Saldo total a proveedores" value={formatUsd(total)} hint="TC blue del día" />
}

function RmaPendientesWidget() {
  const proveedores = useEndpoint<ProveedorResumen[]>('/compras/resumen-proveedores')
  if (proveedores.status !== 'ok') return <EstadoCarga state={proveedores} />
  const total = proveedores.data.reduce(
    (s, p) => s + (Number(p['RMA pendiente']) || 0) + (Number(p['NC pendiente']) || 0) + (Number(p['OC Pendientes']) || 0),
    0,
  )
  return <KpiWidget label="RMA / NC / OC pendientes" value={String(total)} />
}

function PedidosTrelloWidget() {
  const pedidos = useEndpoint<PedidoTrello[]>('/compras/pedidos-trello')
  if (pedidos.status !== 'ok') return <EstadoCarga state={pedidos} />
  return <KpiWidget label="Pedidos en Trello" value={String(pedidos.data.length)} hint="tarjetas activas" />
}

function ComprasDiariasWidget() {
  const data = useEndpoint<CompraDiaria[]>('/compras/compras-diarias')
  if (data.status !== 'ok') return <EstadoCarga state={data} />
  const rows = data.data.slice(-30).map((r) => ({ fecha: r.FECHA, valor: parseMoney(r['COMPRAS (U$)']) }))
  return (
    <div className="widget-chart">
      <span className="widget-title">Compras diarias (USD)</span>
      <MiniChart data={rows} dataKey="valor" color="#2563eb" />
    </div>
  )
}

// --- Ventas ---

function VentasHoyWidget({ campo, label }: { campo: 'combinado' | 'transferencias' | 'efectivo'; label: string }) {
  const v = useEndpoint<VentaDiaria[]>('/ventas/diarias')
  if (v.status !== 'ok') return <EstadoCarga state={v} />
  const hoy = v.data[v.data.length - 1]
  return <KpiWidget label={label} value={formatArs(hoy[campo])} hint={hoy.fecha} />
}

function VentasAcumuladoMesWidget() {
  const v = useEndpoint<VentaDiaria[]>('/ventas/diarias')
  if (v.status !== 'ok') return <EstadoCarga state={v} />
  const mes = v.data.filter((r) => esMismoMes(r.fecha, new Date()))
  const total = mes.reduce((s, r) => s + r.combinado, 0)
  return <KpiWidget label="Acumulado del mes (ingreso)" value={formatArs(total)} />
}

function VentasDiariasWidget() {
  const v = useEndpoint<VentaDiaria[]>('/ventas/diarias')
  if (v.status !== 'ok') return <EstadoCarga state={v} />
  const rows = v.data.slice(-30).map((r) => ({ fecha: r.fecha, valor: r.combinado }))
  return (
    <div className="widget-chart">
      <span className="widget-title">Ventas diarias combinadas</span>
      <MiniChart data={rows} dataKey="valor" color="#0f172a" />
    </div>
  )
}

// --- Contabilidad ---

function ContabilidadHoyWidget({ campo, label }: { campo: 'ingresos' | 'egresos' | 'neto'; label: string }) {
  const c = useEndpoint<ContabilidadDiaria[]>('/contabilidad/diario')
  if (c.status !== 'ok') return <EstadoCarga state={c} />
  const hoy = c.data[c.data.length - 1]
  return <KpiWidget label={label} value={formatArs(hoy[campo])} hint={hoy.fecha} />
}

function NetoMesWidget() {
  const c = useEndpoint<ContabilidadDiaria[]>('/contabilidad/diario')
  if (c.status !== 'ok') return <EstadoCarga state={c} />
  const mes = c.data.filter((r) => esMismoMes(r.fecha, new Date()))
  const total = mes.reduce((s, r) => s + r.neto, 0)
  return <KpiWidget label="Neto del mes" value={formatArs(total)} />
}

function IngresosEgresosWidget() {
  const c = useEndpoint<ContabilidadDiaria[]>('/contabilidad/diario')
  if (c.status !== 'ok') return <EstadoCarga state={c} />
  const rows = c.data.slice(-30).map((r) => ({ fecha: r.fecha, valor: r.neto }))
  return (
    <div className="widget-chart">
      <span className="widget-title">Neto diario (ingresos − egresos)</span>
      <MiniChart data={rows} dataKey="valor" color="#16a34a" />
    </div>
  )
}

export type WidgetDef = {
  id: string
  label: string
  grupo: 'Compras' | 'Ventas' | 'Contabilidad'
  defaultSize: { w: number; h: number }
  Component: ComponentType
}

export const WIDGET_CATALOG: WidgetDef[] = [
  { id: 'compras.saldoProveedores', label: 'Saldo total a proveedores', grupo: 'Compras', defaultSize: { w: 1, h: 1 }, Component: SaldoProveedoresWidget },
  { id: 'compras.rmaPendientes', label: 'RMA / NC / OC pendientes', grupo: 'Compras', defaultSize: { w: 1, h: 1 }, Component: RmaPendientesWidget },
  { id: 'compras.pedidosTrello', label: 'Pedidos en Trello', grupo: 'Compras', defaultSize: { w: 1, h: 1 }, Component: PedidosTrelloWidget },
  { id: 'compras.comprasDiarias', label: 'Gráfico: Compras diarias', grupo: 'Compras', defaultSize: { w: 2, h: 2 }, Component: ComprasDiariasWidget },

  { id: 'ventas.consolidadoHoy', label: 'Ventas: consolidado hoy', grupo: 'Ventas', defaultSize: { w: 1, h: 1 }, Component: () => <VentasHoyWidget campo="combinado" label="Consolidado hoy" /> },
  { id: 'ventas.transferenciasHoy', label: 'Ventas: transferencias hoy', grupo: 'Ventas', defaultSize: { w: 1, h: 1 }, Component: () => <VentasHoyWidget campo="transferencias" label="Transferencias hoy" /> },
  { id: 'ventas.efectivoHoy', label: 'Ventas: efectivo hoy', grupo: 'Ventas', defaultSize: { w: 1, h: 1 }, Component: () => <VentasHoyWidget campo="efectivo" label="Efectivo hoy" /> },
  { id: 'ventas.acumuladoMes', label: 'Ventas: acumulado del mes', grupo: 'Ventas', defaultSize: { w: 1, h: 1 }, Component: VentasAcumuladoMesWidget },
  { id: 'ventas.diarias', label: 'Gráfico: Ventas diarias', grupo: 'Ventas', defaultSize: { w: 2, h: 2 }, Component: VentasDiariasWidget },

  { id: 'contabilidad.ingresosHoy', label: 'Contabilidad: ingresos hoy', grupo: 'Contabilidad', defaultSize: { w: 1, h: 1 }, Component: () => <ContabilidadHoyWidget campo="ingresos" label="Ingresos hoy" /> },
  { id: 'contabilidad.egresosHoy', label: 'Contabilidad: egresos hoy', grupo: 'Contabilidad', defaultSize: { w: 1, h: 1 }, Component: () => <ContabilidadHoyWidget campo="egresos" label="Egresos hoy" /> },
  { id: 'contabilidad.netoHoy', label: 'Contabilidad: neto hoy', grupo: 'Contabilidad', defaultSize: { w: 1, h: 1 }, Component: () => <ContabilidadHoyWidget campo="neto" label="Neto hoy" /> },
  { id: 'contabilidad.netoMes', label: 'Contabilidad: neto del mes', grupo: 'Contabilidad', defaultSize: { w: 1, h: 1 }, Component: NetoMesWidget },
  { id: 'contabilidad.ingresosEgresos', label: 'Gráfico: Neto diario', grupo: 'Contabilidad', defaultSize: { w: 2, h: 2 }, Component: IngresosEgresosWidget },
]
