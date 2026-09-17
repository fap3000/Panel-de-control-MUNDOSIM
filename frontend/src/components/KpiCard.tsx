export type KpiTone = 'neutral' | 'good' | 'warning' | 'critical' | 'info'

type KpiCardProps = {
  label: string
  value: string
  hint?: string
  tone?: KpiTone
  meterPercent?: number
}

export function KpiCard({ label, value, hint, tone = 'neutral', meterPercent }: KpiCardProps) {
  return (
    <div className={`kpi-card tone-${tone}`}>
      <span className="kpi-label">
        {tone !== 'neutral' && <span className={`kpi-tone-dot tone-${tone}`} aria-hidden="true" />}
        {label}
      </span>
      <span className={`kpi-value tone-${tone}`}>{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
      {typeof meterPercent === 'number' && (
        <div className="kpi-meter-track">
          <div
            className={`kpi-meter-fill tone-${tone}`}
            style={{ width: `${Math.min(100, Math.max(0, meterPercent))}%` }}
          />
        </div>
      )}
    </div>
  )
}
