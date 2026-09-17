import type { EstimacionProveedor, ProveedorResumen } from '../lib/api'
import { formatNativo, parseMoney } from '../lib/format'
import { type ProveedorTone as Tone, toneParaDiasParaSaldar } from '../lib/proveedorTone'

type Props = {
  proveedor: ProveedorResumen
  estimacion?: EstimacionProveedor
  /** Máximo de 'USD con TC Blue del dia' entre todos los proveedores — la barra
   * compara en USD para que Sileo (pesos) y Jona (dólares) sean comparables. */
  saldoMaxUsdAbs: number
}

export function ProveedorCard({ proveedor, estimacion, saldoMaxUsdAbs }: Props) {
  const saldoNum = estimacion?.saldo ?? 0
  const saldoUsdAbs = Math.abs(parseMoney(proveedor['USD con TC Blue del dia']))
  const barPercent = saldoMaxUsdAbs > 0 ? Math.max(3, (saldoUsdAbs / saldoMaxUsdAbs) * 100) : 0

  let tone: Tone = 'neutral'
  let detalle: string
  let detalleRitmo: string | null = null

  if (!estimacion || estimacion.sin_datos) {
    detalle = 'Sin datos suficientes para estimar el ritmo de pago.'
  } else if (saldoNum <= 0) {
    tone = 'good'
    detalle = 'Sin deuda pendiente.'
  } else if (estimacion.dias_para_saldar == null) {
    detalle = 'Sin pagos recientes registrados para estimar.'
  } else {
    const dias = estimacion.dias_para_saldar
    tone = toneParaDiasParaSaldar(dias)
    const pagoHoy = formatNativo(estimacion.pago_hoy ?? 0, proveedor.Saldo)
    const pagoPorPago = formatNativo(estimacion.pago_promedio_por_pago ?? 0, proveedor.Saldo)
    const intervalo = estimacion.intervalo_promedio_dias
    detalle = `Pago hoy: ${pagoHoy} · Promedio: ${pagoPorPago} cada ~${intervalo ? intervalo.toFixed(1) : '?'} días`
    detalleRitmo =
      estimacion.pagos_para_saldar != null
        ? `Faltarían ~${estimacion.pagos_para_saldar} pagos (~${Math.round(dias)} días) para saldar, al ritmo actual`
        : null
  }

  const pendientes =
    (Number(proveedor['RMA pendiente']) || 0) +
    (Number(proveedor['NC pendiente']) || 0) +
    (Number(proveedor['OC Pendientes']) || 0)

  return (
    <div className="proveedor-card">
      <div className="proveedor-card-header">
        <span className="proveedor-nombre">{proveedor.Proveedor}</span>
        <span className={`proveedor-saldo tone-${tone}`}>{proveedor.Saldo || '—'}</span>
      </div>
      <div className="proveedor-bar-track">
        <div className={`proveedor-bar-fill tone-${tone}`} style={{ width: `${barPercent}%` }} />
      </div>
      <p className="proveedor-detalle">{detalle}</p>
      {detalleRitmo && <p className="proveedor-detalle">{detalleRitmo}</p>}
      {pendientes > 0 && (
        <p className="proveedor-detalle">
          RMA: {proveedor['RMA pendiente'] || 0} · NC: {proveedor['NC pendiente'] || 0} · OC:{' '}
          {proveedor['OC Pendientes'] || 0}
        </p>
      )}
    </div>
  )
}
