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
