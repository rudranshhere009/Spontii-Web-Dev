import { useCallback, useEffect, useState } from 'react'
import { adminRequest } from './adminApi'

/*
 * Loads an admin endpoint. It refetches when `path` or `refreshKey` changes,
 * or when `reload()` is called. Previous data stays visible while reloading.
 */
export function useAdminQuery(path, refreshKey = '') {
  const [version, setVersion] = useState(0)
  const [state, setState] = useState({ key: null, data: null, error: null })
  const key = path ? `${path}#${refreshKey}#${version}` : null

  useEffect(() => {
    if (!key) return undefined
    let active = true
    adminRequest(path)
      .then((data) => {
        if (active) setState({ key, data, error: null })
      })
      .catch((error) => {
        if (active) setState((previous) => ({ key, data: previous.data, error }))
      })
    return () => {
      active = false
    }
  }, [key, path])

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  const setData = useCallback((update) => {
    setState((previous) => ({
      ...previous,
      data: typeof update === 'function' ? update(previous.data) : update,
    }))
  }, [])

  return {
    data: state.data,
    error: state.error,
    loading: key !== null && state.key !== key,
    reload,
    setData,
  }
}
