# Nuxt Client Setup

## Separate API service

If your API runs in a separate service, configure the base URLs in `nuxt.config.ts`, without the `/rpc` path:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ["orpc-vue/nuxt/module"],
  runtimeConfig: {
    orpc: {
      apiOrigin: "", // Optional SSR address; empty means use public.orpc.apiOrigin.
    },
    public: {
      orpc: {
        apiOrigin: "https://api.example.com",
      },
    },
  },
})
```

Set `NUXT_PUBLIC_ORPC_API_ORIGIN` to the browser-facing API origin.
Use `NUXT_ORPC_API_ORIGIN` if SSR should use an internal address such as `http://api:3000`.

Use these settings in `app/plugins/orpc.ts`:

```ts
// app/plugins/orpc.ts
import type { router } from "@my-app/api"
import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"

export default defineNuxtPlugin<RouterClient<typeof router>>(() => {
  const config = useRuntimeConfig()
  const serverOrigin = import.meta.server ? config.orpc.apiOrigin : ""

  return {
    url: `${config.public.orpc.apiOrigin}/rpc`,
    serverUrl: serverOrigin ? `${serverOrigin}/rpc` : undefined,
    credentials: "include",
    forwardHeaders: ["cookie"],
  }
})
```

`serverUrl` overrides `url` during SSR; an empty or omitted value falls back to `url`.
Relative URLs resolve against the current request URL during SSR.
Only headers listed in `forwardHeaders` are forwarded from the incoming SSR request.
`credentials: "include"` allows browser cookies on cross-origin requests.

## Custom link

Return a custom `link` when the server needs a request-scoped transport while the browser should keep a regular HTTP transport:

```ts
// app/plugins/orpc.ts
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { getRequestURL } from "h3"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import type { router } from "~~/server/rpc/router"

export default defineNuxtPlugin<RouterClient<typeof router>>(() => ({
  link: ({ event }) => {
    if (!event) return new RPCLink({ url: "/api/rpc" })

    const requestFetch = event.context.nuxtMultiApp.createFetch("web")
    const endpoint = new URL("/api/rpc", getRequestURL(event))

    return new RPCLink({
      origin: endpoint.origin,
      url: endpoint.pathname as `/${string}`,
      fetch: requestFetch,
    })
  },
}))
```

The link factory receives `{ nuxtApp, event }`, where `event` is the current H3 event during SSR and `undefined` in the browser.
It runs once per Nuxt application, so every SSR request gets its own link.
The plugin setup callback has the same lifecycle: once per SSR request and once when the browser app starts.

## Manual client setup

Use `createORPCVueQuery` when you want SSR to call the router directly or need to own the complete client setup.
Instead of the HTTP plugin from [Nuxt Quickstart](./nuxt#add-the-client-plugin), add a browser plugin and a server plugin.

Keep `orpc-vue/nuxt/module` in `modules` for auto-imports and QueryClient setup.
Both plugins provide the client under the `orpc` key: `useOrpc()` reads it as `useNuxtApp().$orpc` and infers the router type from that injection.

The browser plugin sends requests to `/rpc` over HTTP:

```ts
// app/plugins/orpc.client.ts
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { createORPCVueQuery } from "orpc-vue"
import type { router } from "~~/server/rpc/router"

export default defineNuxtPlugin(() => {
  const client = createORPCClient<RouterClient<typeof router>>(new RPCLink({ url: "/rpc" }))
  const orpc = createORPCVueQuery(client)
  return {
    provide: { orpc },
  }
})
```

The server plugin calls the router directly, without an HTTP request.
This example passes the current Nuxt request event as `context.event`; adjust it to match your router:

```ts
// app/plugins/orpc.server.ts
import { createRouterClient } from "@orpc/server"
import { createORPCVueQuery } from "orpc-vue"
import { router } from "~~/server/rpc/router"

export default defineNuxtPlugin(() => {
  const event = useRequestEvent()!
  const client = createRouterClient(router, {
    context: { event },
  })
  const orpc = createORPCVueQuery(client)
  return {
    provide: { orpc },
  }
})
```

Let both plugins infer the client type instead of annotating it.
Nuxt combines what they provide, so a widened type in either one leaves `useOrpc()` without procedure types.
