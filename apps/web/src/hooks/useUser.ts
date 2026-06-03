import { useState, useEffect } from 'react'

export interface User {
  id: string
  name?: string
  email?: string
  picture?: string
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchUser() {
      try {
        const res = await fetch('/api/me')
        if (res.ok) {
          const data = await res.json()
          setUser(data)
        } else if (res.status === 401) {
          window.location.href = '/auth/login'
        }
      } catch (err) {
        console.error('Failed to fetch user', err)
      } finally {
        setLoading(false)
      }
    }

    fetchUser()
  }, [])

  return { user, loading }
}
