import { useState, useEffect } from 'react'

export interface ServerInfo {
  version: string
  environment: string
}

export function useServerInfo() {
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/info')
      .then(res => res.ok ? res.json() : null)
      .then(data => setInfo(data))
      .catch(() => setInfo(null))
      .finally(() => setLoading(false))
  }, [])

  return { info, loading }
}
