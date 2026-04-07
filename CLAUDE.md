@AGENTS.md

# Architecture Principles

## Component Strategy

### Server Components (default)
- All `page.tsx` files are Server Components — no `"use client"` directive
- Fetch data directly from the database using Prisma (`@/lib/prisma`) — no server action needed for reads
- Cannot use `useState`, `useEffect`, event handlers, or browser APIs
- Pass fetched data as plain serializable props to Client Components (convert `Date` → string, `BigInt` → number before passing)

### Client Components (`"use client"`)
- Add `"use client"` only when the component requires user events, React state, or browser APIs
- Typical cases: dialogs/modals, forms with inline validation, click navigation, optimistic UI
- Push the `"use client"` boundary as far down the tree as possible — keep Server Components wrapping Client Components, not the other way
- Place co-located client components in a `_components/` subfolder next to the route they serve

## Data Operations

### Read (queries)
- Performed directly in Server Components via Prisma — no indirection through server actions or API routes
- No `useEffect`-based fetching on the client side

### Create / Update / Delete (mutations)
- Implemented as Server Actions in `src/actions/` with `"use server"` at the file top
- Signature for form-driven actions: `async (prevState: State, formData: FormData) => State`
- Client components use `useActionState` to manage pending state, errors, and success feedback
- Every mutation calls `revalidatePath(...)` or `revalidateTag(...)` at the end so the server re-renders with fresh data

### AI model interactions & streaming
- Multi-turn chat, streaming responses, and complex AI pipelines → Route Handlers in `src/app/api/`
- Use the AI SDK (`streamText`, `useChat`) for streaming chat interfaces
- Route Handlers are also the integration point for webhooks and external system APIs

## File Conventions

```
src/
  app/
    <route>/
      page.tsx              # Server Component — queries DB, composes client components
      _components/          # Client components co-located with this route
        <feature>.tsx       # "use client" — handles interaction for this route only
      [id]/
        page.tsx            # Server Component — dynamic segment, await params
    api/
      <resource>/
        route.ts            # Route Handler — streaming AI, external APIs
  actions/
    <domain>.ts             # Server Actions — mutations only ("use server")
  components/
    ui/                     # Shared primitive UI components (shadcn)
    layout/                 # App shell components (sidebar, header)
    ai-elements/            # AI chat UI primitives
  lib/
    prisma.ts               # Prisma singleton
    utils.ts                # Shared utilities
```
