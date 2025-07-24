// Type definitions for Supabase Edge Functions runtime

declare global {
  const Deno: {
    env: {
      get(key: string): string | undefined
    }
  }
}

// Request and Response are available globally in Deno
declare global {
  interface Request {
    method: string
    headers: Headers
    json(): Promise<any>
  }

  interface Response {
    new (body?: BodyInit | null, init?: ResponseInit): Response
  }

  interface Headers {
    get(name: string): string | null
  }
}

export {}