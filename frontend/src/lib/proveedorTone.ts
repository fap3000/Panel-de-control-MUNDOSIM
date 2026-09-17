export type ProveedorTone = 'good' | 'warning' | 'critical' | 'neutral'

/** Verde hasta 45 días, amarillo 46-70, rojo más de 70 (umbrales definidos por Fer). */
export function toneParaDiasParaSaldar(dias: number): ProveedorTone {
  if (dias <= 45) return 'good'
  if (dias <= 70) return 'warning'
  return 'critical'
}
