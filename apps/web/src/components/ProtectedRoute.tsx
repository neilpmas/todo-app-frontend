import { ReactNode } from 'react'
import { useUser } from '../hooks/useUser'

interface ProtectedRouteProps {
  children: ReactNode
}

// Note: Dashboard also calls useUser(), resulting in two /api/me fetches.
// If that becomes a concern, lift user state into React Context.
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useUser()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    // useUser hook already handles redirect on 401, but as a fallback:
    return null
  }

  return <>{children}</>
}
