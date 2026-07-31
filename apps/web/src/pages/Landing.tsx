import { Button } from "@/components/ui/button"

export default function Landing() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold mb-4">Todo</h1>
      <p className="text-xl text-muted-foreground mb-8 text-center max-w-md">
        A simple place to keep track of what you need to do.
      </p>
      <a href="/auth/login?returnTo=/dashboard">
        <Button size="lg">Login</Button>
      </a>
    </div>
  )
}
