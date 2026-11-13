# Nuxt Client Setup

## Separate API service

If your API runs in a separate service, configure the base URLs in `nuxt.config.ts`, without the `/trpc` path:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["trpc-vue/nuxt/module"],
  runtimeConfig: {
    trpc: {
      apiOrigin: "", // Optional SSR address; empty means use public.trpc.apiOrigin.
    },
    public: {
      trpc: {
        apiOrigin: "https://api.example.com",
      },
    },
  },
})
```

Set `NUXT_PUBLIC_TRPC_API_ORIGIN` to the browser-facing API origin.
Use `NUXT_TRPC_API_ORIGIN` if SSR should use an internal address such as `http://api:3000`.

Use these settings in `app/plugins/trpc.ts`:

```ts
// app/plugins/trpc.ts
import type { AppRouter } from "@my-app/api"
import { defineNuxtPlugin } from "trpc-vue/nuxt"

export default defineNuxtPlugin<AppRouter>(() => {
  const config = useRuntimeConfig()
  const serverOrigin = import.meta.server ? config.trpc.apiOrigin : ""

  return {
    url: `${config.public.trpc.apiOrigin}/trpc`,
    serverUrl: serverOrigin ? `${serverOrigin}/trpc` : undefined,
    credentials: "include",
    forwardHeaders: ["cookie"],
  }
})
```

`serverUrl` overrides `url` during SSR; an empty or omitted value falls back to `url`.
Relative URLs resolve against the current request URL during SSR.
Only headers listed in `forwardHeaders` are forwarded from the incoming SSR request.
`credentials: "include"` allows browser cookies on cross-origin requests.

## Custom links

Return custom `links` when you need other tRPC links or transport settings:

```ts
// app/plugins/trpc.ts
import { httpBatchLink, loggerLink } from "@trpc/client"
import { defineNuxtPlugin } from "trpc-vue/nuxt"
import type { AppRouter } from "~~/server/trpc/router"

export default defineNuxtPlugin<AppRouter>(() => ({
  links: ({ event }) => [
    // Log requests in the browser only.
    loggerLink({ enabled: () => !event }),
    httpBatchLink({
      url: new URL("/trpc", useRequestURL()).href,
      headers: useRequestHeaders(["cookie"]),
    }),
  ],
}))
```

The links factory receives `{ nuxtApp, event }`, where `event` is the current H3 event during SSR and `undefined` in the browser.
It runs once per Nuxt application, so every SSR request gets its own links.
The plugin setup callback has the same lifecycle: once per SSR request and once when the browser app starts.
Configure a transformer on your links; the HTTP options above and `transformer` apply only without custom links.

## Manual client setup

Use `createTRPCVueQuery` when you want SSR to call the router directly or need to own the complete client setup.
Instead of the HTTP plugin from [Nuxt Quickstart](./nuxt#add-the-client-plugin), add a browser plugin and a server plugin.

Keep `trpc-vue/nuxt/module` in `modules` for auto-imports and QueryClient setup.
Both plugins provide the client under the `trpc` key: `useTrpc()` reads it as `useNuxtApp().$trpc` and infers the router type from that injection.

The browser plugin sends requests to `/trpc` over HTTP:

```ts
// app/plugins/trpc.client.ts
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { createTRPCVueQuery } from "trpc-vue"
import type { AppRouter } from "~~/server/trpc/router"

export default defineNuxtPlugin(() => {
  const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/trpc" })] })
  const trpc = createTRPCVueQuery(client)
  return {
    provide: { trpc },
  }
})
```

The server plugin calls the router directly with tRPC's [`unstable_localLink`](https://trpc.io/docs/client/links/localLink), without an HTTP request.
This example passes the current Nuxt request event as the context's `event`; adjust it to match your router:

```ts
// app/plugins/trpc.server.ts
import { createTRPCClient, unstable_localLink } from "@trpc/client"
import { createTRPCVueQuery } from "trpc-vue"
import { router } from "~~/server/trpc/router"

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()!
  const client = createTRPCClient<typeof router>({
    links: [unstable_localLink({ router, createContext: async () => ({ event }) })],
  })
  const trpc = createTRPCVueQuery(client)
  return {
    provide: { trpc },
  }
})
```

If your router uses a transformer, pass it to both links.
`createTRPCVueQuery()` needs a client from `createTRPCClient()`; a server-side caller from `createCaller()` is not supported.

Let both plugins infer the client type instead of annotating it.
Nuxt combines what they provide, so a widened type in either one leaves `useTrpc()` without procedure types.
