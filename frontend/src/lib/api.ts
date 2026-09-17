import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
})

export type ProveedorResumen = {
  Proveedor: string
  Saldo: string
  'USD con TC Blue del dia': string
  'RMA pendiente': string
  'NC pendiente': string
  'OC Pendientes': string
}

export type CompraDiaria = {
  FECHA: string
  'INGRESOS TOTALES ($)': string
  'TIPO CAMBIO (U$) BLUE': string
  'TOTAL EN DÓLARES (U$)': string
  VENTAS: string
  'COMPRAS (U$)': string
  COMPRAS: string
}

export type PedidoTrello = {
  id: string
  nombre: string
  lista: string
  vencimiento: string | null
  ultima_actividad: string | null
  etiquetas: string[]
}

export type VentaDiaria = {
  fecha: string
  mdz_transferencias: number
  mdz_efectivo: number
  sj_transferencias: number
  sj_efectivo: number
  mdz: number
  sj: number
  transferencias: number
  efectivo: number
  combinado: number
}

export type TransferenciaPorCuenta = {
  cuenta: string
  total: number
}

export type ContabilidadDiaria = {
  fecha: string
  ingresos: number
  egresos: number
  neto: number
}

export type EgresoPorCategoria = {
  categoria: string
  mdz: number
  sj: number
  total: number
}
