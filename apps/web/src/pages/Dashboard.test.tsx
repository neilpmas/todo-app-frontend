import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Dashboard from './Dashboard'
import { useUser } from '@/hooks/useUser'
import { useServerInfo } from '@/hooks/useServerInfo'

vi.mock('@/hooks/useUser')
vi.mock('@/hooks/useServerInfo')
vi.mock('@/components/TodoList', () => ({
  TodoList: () => null,
}))

describe('Dashboard', () => {
  it('logs out via a POST form, not a GET link', () => {
    vi.mocked(useUser).mockReturnValue({
      user: { id: 'user-1', name: 'Test User', email: 'test@example.com' },
      loading: false,
    })
    vi.mocked(useServerInfo).mockReturnValue({ info: null, loading: true })

    render(<Dashboard />)

    const logoutButton = screen.getByRole('button', { name: 'Logout' })
    const form = logoutButton.closest('form')

    // bezzie only registers /auth/logout as a POST route -- a GET (e.g. a plain
    // <a href>) 404s. This guards against that regressing back to a link.
    expect(form).not.toBeNull()
    expect(form).toHaveAttribute('action', '/auth/logout')
    expect(form).toHaveAttribute('method', 'post')
  })
})
