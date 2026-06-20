import { useState, type KeyboardEvent } from 'react'
import { Plus, AlertCircle, ListChecks, RotateCcw } from 'lucide-react'
import { useTodos } from '@/hooks/useTodos'
import { TodoItem } from './TodoItem'

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-2.5 py-2">
      <div className="w-[18px] h-[18px] shrink-0 rounded-[5px] bg-secondary animate-pulse" />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="h-[11px] rounded bg-secondary animate-pulse w-3/4" />
        <div className="h-[9px] rounded bg-secondary animate-pulse w-2/5" />
      </div>
    </div>
  )
}

export function TodoList() {
  const { todos, loading, error, retry, addTodo, completeTodo, deleteTodo } = useTodos()
  const [draft, setDraft] = useState('')

  async function handleAdd() {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await addTodo(title)
  }

  function handleKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAdd()
  }

  const remaining = todos.filter(t => !t.completedAt).length

  return (
    <div className="bg-card border border-border rounded-xl shadow-[0_1px_2px_oklch(0_0_0/0.04)] overflow-hidden">
      <div className="px-[18px] pt-[18px] pb-3.5 flex items-baseline justify-between gap-3">
        <div className="text-base font-semibold tracking-tight">Tasks</div>
        {!loading && !error && (
          <div className="text-xs text-muted-foreground">{remaining} remaining</div>
        )}
      </div>

      <div className="px-[18px] pb-4 flex gap-2">
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Add a task…"
          className="flex-1 min-w-0 h-[38px] px-3 text-sm text-foreground bg-card border border-input rounded-lg outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20 font-[inherit]"
        />
        <button
          onClick={handleAdd}
          className="h-[38px] px-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-primary-foreground bg-primary rounded-lg border-none cursor-pointer hover:bg-primary/90 transition-colors"
        >
          <Plus size={16} strokeWidth={2.2} />
          Add
        </button>
      </div>

      <div className="h-px bg-border" />

      {loading ? (
        <div className="px-2 py-1.5 flex flex-col gap-2 pb-3">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      ) : error ? (
        <div className="px-6 py-10 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-destructive/10 flex items-center justify-center text-destructive mb-3.5">
            <AlertCircle size={24} strokeWidth={1.8} />
          </div>
          <div className="text-[14.5px] font-semibold">Couldn't load your tasks</div>
          <div className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-[230px]">
            Something went wrong. Check your connection and try again.
          </div>
          <button
            onClick={retry}
            className="mt-4 h-9 px-3.5 inline-flex items-center gap-1.5 text-sm font-medium text-foreground bg-card border border-input rounded-lg cursor-pointer hover:bg-secondary transition-colors"
          >
            <RotateCcw size={15} />
            Retry
          </button>
        </div>
      ) : todos.length === 0 ? (
        <div className="px-6 py-10 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground mb-3.5">
            <ListChecks size={24} strokeWidth={1.8} />
          </div>
          <div className="text-[14.5px] font-semibold">No tasks yet</div>
          <div className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-[220px]">
            Add your first task above to start tracking your work.
          </div>
        </div>
      ) : (
        <div className="px-2 py-1.5">
          {todos.map(todo => (
            <TodoItem
              key={todo.id}
              todo={todo}
              onComplete={completeTodo}
              onDelete={deleteTodo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
