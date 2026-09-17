import { useEffect, useState } from 'react'
import { api } from './api'

export type LoadState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: T }

export function useEndpoint<T>(path: string): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    api
      .get<T>(path)
      .then((res) => {
        if (!cancelled) setState({ status: 'ok', data: res.data })
      })
      .catch((err) => {
        if (!cancelled) {
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
