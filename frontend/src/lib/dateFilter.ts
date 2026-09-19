// Fecha de referencia elegida con el calendario (App.tsx), en formato ISO
// yyyy-mm-dd (el que usa <input type="date">). Se usa para "viajar" el
// tablero a un día anterior: filtra series ya traídas del backend y arma los
// desde/hasta que ya aceptan algunos endpoints (transferencias-por-cuenta,
// egresos-por-categoria).

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function inicioDeMes(iso: string): string {
  const [y, m] = iso.split('-')
  return `${y}-${m}-01`
}

export function formatFechaCorta(iso: string): string {
  const d = isoToLocalDate(iso)
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function parseFechaDDMMYYYY(fecha: string): Date | null {
  const partes = fecha.split('/')
  if (partes.length !== 3) return null
  const [d, m, y] = partes.map(Number)
  if (!d || !m || !y) return null
  return new Date(y, m - 1, d)
}

/** Deja pasar filas con fecha "dd/mm/yyyy" <= hasta (ISO). Filas con fecha
 * vacía o no parseable no se descartan, para no perder datos por un formato
 * inesperado. */
export function hastaFilter<T>(data: T[], getFecha: (row: T) => string, hastaIso: string): T[] {
  const limite = isoToLocalDate(hastaIso)
  limite.setHours(23, 59, 59, 999)
  return data.filter((row) => {
    const fecha = parseFechaDDMMYYYY(getFecha(row))
    return fecha === null || fecha <= limite
  })
}
