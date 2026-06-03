import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useUser } from './useUser'

describe('useUser', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('should return user data when fetch is successful', async () => {
    const mockUser = { id: '1', name: 'John Doe', email: 'john@example.com' }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockUser,
    } as Response)

    const { result } = renderHook(() => useUser())

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toEqual(mockUser)
  })

  it('should redirect to /auth/login on 401', async () => {
    const originalLocation = window.location
    // @ts-expect-error - mocking window.location
    delete window.location
    window.location = { ...originalLocation, href: '' }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response)

    renderHook(() => useUser())

    await waitFor(() => expect(window.location.href).toBe('/auth/login'))

    window.location = originalLocation
  })

  it('should handle fetch errors', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useUser())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.user).toBe(null)
  })
})
