// Feriados nacionales de fecha fija (no trasladables) + Viernes Santo (calculado por Pascua).
// Los feriados trasladables (decretados cada año, ej. "fin de semana largo") y Carnaval
// no están incluidos automáticamente — agregalos a FERIADOS_EXTRA si hace falta.
const FERIADOS_FIJOS_MM_DD = ['01-01', '03-24', '04-02', '05-01', '05-25', '07-09', '12-08', '12-25']

const FERIADOS_EXTRA: string[] = [
  // 'YYYY-MM-DD', // ej: '2026-02-16' (Carnaval), o un feriado puente decretado
]

function easterDate(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function esFeriado(date: Date): boolean {
  const iso = toIso(date)
  if (FERIADOS_FIJOS_MM_DD.includes(iso.slice(5))) return true
  if (FERIADOS_EXTRA.includes(iso)) return true

  const easter = easterDate(date.getFullYear())
  const viernesSanto = new Date(easter)
  viernesSanto.setDate(easter.getDate() - 2)
  return toIso(viernesSanto) === iso
}

export function esDiaLaboral(date: Date): boolean {
  return date.getDay() !== 0 && !esFeriado(date)
}

export function diasHabilesDelMes(referencia: Date = new Date()) {
  const year = referencia.getFullYear()
  const month = referencia.getMonth()
  const hoy = new Date(year, month, referencia.getDate())
  const ultimoDia = new Date(year, month + 1, 0).getDate()

  let transcurridos = 0
  let restantes = 0

  for (let d = 1; d <= ultimoDia; d++) {
    const fecha = new Date(year, month, d)
    if (!esDiaLaboral(fecha)) continue
    if (fecha <= hoy) transcurridos++
    else restantes++
  }

  return { transcurridos, restantes, totalMes: transcurridos + restantes }
}
