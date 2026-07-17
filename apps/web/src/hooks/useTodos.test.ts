import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useTodos } from './useTodos'

const mockTodo = {
  id: '1',
  userId: 'user-1',
  title: 'Test',
  completedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
}

describe('useTodos', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('should load todos on mount', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())

    expect(result.current.loading).toBe(true)

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.todos).toEqual([mockTodo])
    expect(result.current.error).toBe(null)
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

    renderHook(() => useTodos())

    await waitFor(() => expect(window.location.href).toBe('/auth/login'))

    window.location = originalLocation
  })

  it('should set error on non-401 error response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const { result } = renderHook(() => useTodos())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('Failed to load todos')
    expect(result.current.todos).toEqual([])
  })

  it('should optimistically add a todo and replace with server response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const serverTodo = { ...mockTodo, title: 'Buy milk' }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => serverTodo,
    } as Response)

    await act(async () => {
      result.current.addTodo('Buy milk')
    })

    // After act, temp row should have been replaced by server row
    await waitFor(() => {
      expect(result.current.todos).toHaveLength(1)
      expect(result.current.todos[0].id).toBe('1')
      expect(result.current.todos[0].title).toBe('Buy milk')
    })
  })

  it('should redirect to /auth/login on 401 from addTodo', async () => {
    const originalLocation = window.location
    // @ts-expect-error - mocking window.location
    delete window.location
    window.location = { ...originalLocation, href: '' }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response)

    await act(async () => {
      await result.current.addTodo('Fail todo')
    })

    expect(window.location.href).toBe('/auth/login')
    expect(result.current.error).toBe(null)

    window.location = originalLocation
  })

  it('should rollback addTodo on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await act(async () => {
      await result.current.addTodo('Fail todo')
    })

    expect(result.current.todos).toEqual([mockTodo])
    expect(result.current.error).toBe('Failed to add todo')
  })

  it('should optimistically complete a todo and replace with server response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    const serverCompleted = { ...mockTodo, completedAt: '2024-06-01T12:00:00.000Z' }
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => serverCompleted,
    } as Response)

    await act(async () => {
      result.current.completeTodo('1')
    })

    // Immediately after optimistic update, completedAt should be set
    await waitFor(() => {
      expect(result.current.todos[0].completedAt).toBe('2024-06-01T12:00:00.000Z')
    })
  })

  it('should redirect to /auth/login on 401 from completeTodo', async () => {
    const originalLocation = window.location
    // @ts-expect-error - mocking window.location
    delete window.location
    window.location = { ...originalLocation, href: '' }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response)

    await act(async () => {
      await result.current.completeTodo('1')
    })

    expect(window.location.href).toBe('/auth/login')
    expect(result.current.error).toBe(null)

    window.location = originalLocation
  })

  it('should rollback completeTodo on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await act(async () => {
      await result.current.completeTodo('1')
    })

    expect(result.current.todos[0].completedAt).toBe(null)
    expect(result.current.error).toBe('Failed to complete todo')
  })

  it('should optimistically delete a todo', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 204,
    } as Response)

    await act(async () => {
      await result.current.deleteTodo('1')
    })

    expect(result.current.todos).toEqual([])
  })

  it('should redirect to /auth/login on 401 from deleteTodo', async () => {
    const originalLocation = window.location
    // @ts-expect-error - mocking window.location
    delete window.location
    window.location = { ...originalLocation, href: '' }

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
    } as Response)

    await act(async () => {
      await result.current.deleteTodo('1')
    })

    expect(window.location.href).toBe('/auth/login')
    expect(result.current.error).toBe(null)

    window.location = originalLocation
  })

  it('should rollback deleteTodo on failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    await act(async () => {
      await result.current.deleteTodo('1')
    })

    expect(result.current.todos).toEqual([mockTodo])
    expect(result.current.error).toBe('Failed to delete todo')
  })

  it('should retry after error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response)

    const { result } = renderHook(() => useTodos())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Failed to load todos')

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockTodo],
    } as Response)

    await act(async () => {
      result.current.retry()
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe(null)
    expect(result.current.todos).toEqual([mockTodo])
  })
})
