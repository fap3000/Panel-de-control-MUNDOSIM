export function parseMoney(value?: string): number {
  if (!value) return 0
  const negative = value.trim().startsWith('-')
  const cleaned = value.replace(/[^0-9.,]/g, '')
  if (!cleaned) return 0
  const normalized = cleaned.replace(/\./g, '').replace(',', '.')
  const num = parseFloat(normalized)
  if (Number.isNaN(num)) return 0
  return negative ? -Math.abs(num) : num
}

export function formatUsd(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
}

export function formatArs(value: number): string {
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  })
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

/** Formatea un monto con la misma moneda que un string de referencia (ej. el
 * "Saldo" de un proveedor, que puede venir en ARS o USD según el proveedor). */
export function formatNativo(value: number, referencia: string): string {
  const esUsd = /USD/i.test(referencia)
  return value.toLocaleString('es-AR', {
    style: 'currency',
    currency: esUsd ? 'USD' : 'ARS',
    maximumFractionDigits: 0,
  })
}
