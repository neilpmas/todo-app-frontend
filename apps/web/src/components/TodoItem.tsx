import { Check, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Todo } from '@/hooks/useTodos'

function relativeTime(ts: string): string {
  const s = Math.max(1, Math.floor((Date.now() - new Date(ts).getTime()) / 1000))
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

interface Props {
  todo: Todo
  onComplete: (id: string) => void
  onDelete: (id: string) => void
}

export function TodoItem({ todo, onComplete, onDelete }: Props) {
  const done = todo.completedAt !== null

  return (
    <div className="flex items-center gap-3 px-2.5 py-2 rounded-lg hover:bg-secondary">
      <button
        onClick={() => !done && onComplete(todo.id)}
        disabled={done}
        aria-label="Complete task"
        className={cn(
          'w-[18px] h-[18px] shrink-0 flex items-center justify-center rounded-[5px] transition-colors',
          done
            ? 'bg-primary border border-primary text-primary-foreground cursor-default'
            : 'bg-card border-[1.5px] border-input cursor-pointer hover:border-primary'
        )}
      >
        {done && <Check size={10} strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        <div className={cn(
          'text-sm font-medium leading-snug',
          done ? 'line-through text-muted-foreground' : 'text-foreground'
        )}>
          {todo.title}
        </div>
        <div className="text-[11.5px] text-muted-foreground mt-0.5">
          {done
            ? `Completed ${relativeTime(todo.completedAt!)}`
            : `Added ${relativeTime(todo.createdAt)}`}
        </div>
      </div>

      <button
        onClick={() => onDelete(todo.id)}
        aria-label="Delete task"
        className="w-[30px] h-[30px] shrink-0 flex items-center justify-center rounded-[7px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  )
}
