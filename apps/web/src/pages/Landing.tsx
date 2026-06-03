import { Button } from "@/components/ui/button"

export default function Landing() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-4xl font-bold mb-4">Template Application</h1>
      <p className="text-xl text-muted-foreground mb-8 text-center max-w-md">
        A full-stack template with React 19, Vite 8, Tailwind CSS v4, and Cloudflare Workers.
      </p>
      <a href="/auth/login">
        <Button size="lg">Login</Button>
      </a>
    </div>
  )
}
