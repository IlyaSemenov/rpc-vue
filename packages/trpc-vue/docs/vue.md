# Vue without Nuxt

Create a typed context for accessing the client from components:

```ts
// trpc-context.ts
import { createTRPCVueContext } from "trpc-vue"

import type { AppRouter } from "./server/router"

export const trpcContext = createTRPCVueContext<AppRouter>()
```

Install Vue Query and provide the tRPC client:

```ts
// main.ts
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { createTRPCVueQuery } from "trpc-vue"
import { createApp } from "vue"

import App from "./App.vue"
import type { AppRouter } from "./server/router"
import { trpcContext } from "./trpc-context"

const app = createApp(App)
const queryClient = new QueryClient()

app.use(VueQueryPlugin, { queryClient })

const client = createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: "/trpc" })] })
const trpc = createTRPCVueQuery(client, { queryClient })
app.provide(trpcContext.key, trpc)

app.mount("#app")
```

Use the client in a component:

```ts
import { trpcContext } from "./trpc-context"

const trpc = trpcContext.useTrpc()
const query = trpc.blog.posts.get.useQuery({ id: 1 })
```

For Vue SSR, create a QueryClient and tRPC client for each request.
If your router uses a transformer, pass it to `httpBatchLink` too.
