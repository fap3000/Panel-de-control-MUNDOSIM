import { useEffect, useState } from 'react'
import { api } from './api'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: T }

// Caché en memoria por ruta (incluye query string, así que cada combinación de
// filtros/fecha tiene su propia entrada). Al volver a una pestaña que ya se
// visitó, el componente se remonta y perdería el estado — sin esto arrancaba
// de "Cargando..." de nuevo cada vez, aunque el dato ya se hubiera pedido hace
// unos segundos. Ahora muestra lo último que se vio al instante y, en
// paralelo, pide la versión fresca (stale-while-revalidate).
const _cache = new Map<string, unknown>()

export function useEndpoint<T>(path: string): LoadState<T> {
  const cached = _cache.get(path) as T | undefined
  const [state, setState] = useState<LoadState<T>>(
    cached !== undefined ? { status: 'ok', data: cached } : { status: 'loading' },
  )

  useEffect(() => {
    let cancelled = false
    const yaHabiaCache = _cache.has(path)
    if (!yaHabiaCache) {
      setState({ status: 'loading' })
    }
    api
      .get<T>(path)
      .then((res) => {
        if (cancelled) return
        _cache.set(path, res.data)
        setState({ status: 'ok', data: res.data })
      })
      .catch((err) => {
        if (cancelled) return
        // Si ya había un dato en caché, lo dejamos visible en vez de taparlo
        // con un error — probablemente sea un timeout pasajero.
        if (!yaHabiaCache) {
          setState({
            status: 'error',
            message: err.response?.data?.detail ?? err.message ?? 'Error desconocido',
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return state
}
