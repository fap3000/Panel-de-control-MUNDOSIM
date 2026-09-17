// Paleta validada (dataviz skill) — única fuente de verdad para colores en toda
// la app. Los charts (recharts) necesitan hex en JS; los componentes usan las
// variables CSS equivalentes definidas en App.css.
export const PALETTE = {
  categorical: {
    blue: '#2a78d6',
    orange: '#eb6834',
    aqua: '#1baf7a',
    yellow: '#eda100',
    magenta: '#e87ba4',
    green: '#008300',
    violet: '#4a3aa7',
    red: '#e34948',
  },
  status: {
    good: '#0ca30c',
    goodText: '#006300',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
    info: '#2a78d6',
  },
  ink: {
    primary: '#0b0b0b',
    secondary: '#52514e',
    muted: '#898781',
    gridline: '#e1e0d9',
    baseline: '#c3c2b7',
  },
} as const
