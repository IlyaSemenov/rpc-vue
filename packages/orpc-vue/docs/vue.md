# Vue without Nuxt

Create a typed context for accessing the client from components:

```ts
// orpc-context.ts
import type { RouterClient } from "@orpc/server"
import { createORPCVueContext } from "orpc-vue"

import type { router } from "./server/router"

export const orpcContext = createORPCVueContext<RouterClient<typeof router>>()
```

Install Vue Query and provide the oRPC client:

```ts
// main.ts
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import { createORPCVueQuery } from "orpc-vue"
import { createApp } from "vue"

import App from "./App.vue"
import { orpcContext } from "./orpc-context"
import type { router } from "./server/router"

const app = createApp(App)
const queryClient = new QueryClient()

app.use(VueQueryPlugin, { queryClient })

const client = createORPCClient<RouterClient<typeof router>>(new RPCLink({ url: "/rpc" }))
const orpc = createORPCVueQuery(client, { queryClient })
app.provide(orpcContext.key, orpc)

app.mount("#app")
```

Use the client in a component:

```ts
import { orpcContext } from "./orpc-context"

const orpc = orpcContext.useOrpc()
const query = orpc.blog.posts.get.useQuery({ id: 1 })
```

For Vue SSR, create a QueryClient and oRPC client for each request.
