import { useState, useEffect } from 'react'

export interface Todo {
  id: string
  userId: string
  title: string
  completedAt: string | null
  createdAt: string
}

export function useTodos() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchCount, setFetchCount] = useState(0)

  useEffect(() => {
    async function fetchTodos() {
      try {
        const res = await fetch('/api/todos')
        if (res.ok) {
          setTodos(await res.json())
        } else if (res.status === 401) {
          window.location.href = '/auth/login'
        } else {
          setError('Failed to load todos')
        }
      } catch {
        setError('Failed to load todos')
      } finally {
        setLoading(false)
      }
    }

    fetchTodos()
  }, [fetchCount])

  function retry() {
    setLoading(true)
    setError(null)
    setFetchCount(c => c + 1)
  }

  async function addTodo(title: string): Promise<void> {
    const snapshot = todos
    const tempTodo: Todo = {
      id: 'temp-' + Date.now(),
      title,
      userId: '',
      completedAt: null,
      createdAt: new Date().toISOString(),
    }
    setTodos(prev => [...prev, tempTodo])
    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (res.ok) {
        const serverTodo = await res.json()
        setTodos(prev => prev.map(t => t.id === tempTodo.id ? serverTodo : t))
      } else {
        setTodos(snapshot)
        setError('Failed to add todo')
      }
    } catch {
      setTodos(snapshot)
      setError('Failed to add todo')
    }
  }

  async function completeTodo(id: string): Promise<void> {
    const snapshot = todos
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completedAt: new Date().toISOString() } : t))
    try {
      const res = await fetch('/api/todos/' + id, { method: 'PATCH' })
      if (res.ok) {
        const serverTodo = await res.json()
        setTodos(prev => prev.map(t => t.id === id ? serverTodo : t))
      } else {
        setTodos(snapshot)
        setError('Failed to complete todo')
      }
    } catch {
      setTodos(snapshot)
      setError('Failed to complete todo')
    }
  }

  async function deleteTodo(id: string): Promise<void> {
    const snapshot = todos
    setTodos(prev => prev.filter(t => t.id !== id))
    try {
      const res = await fetch('/api/todos/' + id, { method: 'DELETE' })
      if (!res.ok) {
        setTodos(snapshot)
        setError('Failed to delete todo')
      }
    } catch {
      setTodos(snapshot)
      setError('Failed to delete todo')
    }
  }

  return { todos, loading, error, retry, addTodo, completeTodo, deleteTodo }
}
