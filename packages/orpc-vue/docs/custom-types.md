# Custom Types

oRPC transfers types such as `Date`, `bigint`, `Set` and `Map` out of the box.
To support another type, such as `Decimal` from `decimal.js`, create an `RPCSerializer` with a handler for it in a module that both the server and the app import:

```ts
// shared/serializer.ts
import { RPCSerializer } from "@orpc/client"
import Decimal from "decimal.js"

export const serializer = new RPCSerializer({
  handlers: {
    decimal: {
      condition: value => Decimal.isDecimal(value),
      serialize: (value: Decimal) => value.toString(),
      deserialize: serialized => {
        if (typeof serialized !== "string") throw new TypeError("Expected a decimal string")
        return new Decimal(serialized)
      },
      isTerminal: true,
    },
  },
})
```

Pass it to the RPC handler on the server:

```ts
// server/routes/rpc/[...].ts
import { RPCHandler } from "@orpc/server/fetch"
import { router } from "~~/server/rpc/router"
import { serializer } from "~~/shared/serializer"

const handler = new RPCHandler(router, { serializer })
```

## Client setup

Pass the same serializer to the client plugin:

```ts
// app/plugins/orpc.ts
import type { RouterClient } from "@orpc/server"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import type { router } from "~~/server/rpc/router"
import { serializer } from "~~/shared/serializer"

export default defineNuxtPlugin<RouterClient<typeof router>>(() => ({
  url: "/rpc",
  serializer,
}))
```

The plugin uses it for HTTP requests and for cache keys:

- An input with a `Decimal` gets its own cache entry instead of sharing one with its string form.
- Refetched data keeps the previous `Decimal` object when its value has not changed.

Queries copy custom values in their input; wrap a value that keeps its state outside its own properties, such as in private fields, in [`markRaw()`](./queries#input-copies).

A [custom link](./nuxt-client#custom-link) does not receive the plugin's `serializer`; pass the serializer to both the plugin options and the link.

With `createORPCVueQuery()`, in a Vue app or a [manual Nuxt setup](./nuxt-client#manual-client-setup), pass it to the link and in the options:

```ts
const client = createORPCClient<RouterClient<typeof router>>(
  new RPCLink({ url: "/rpc", serializer }),
)
const orpc = createORPCVueQuery(client, { serializer })
```

A client that calls the router directly, such as one created with `createRouterClient()`, does not serialize its calls.
Still pass the serializer to its `createORPCVueQuery()`, so that SSR builds the same cache keys as the browser.

## SSR payload

Cache keys hold the serialized input, so the Nuxt payload transfers them without extra configuration.
For custom types in query results, register a payload reducer and reviver:

```ts
// app/plugins/decimal-payload.ts
import Decimal from "decimal.js"

export default definePayloadPlugin(() => {
  definePayloadReducer("Decimal", value => Decimal.isDecimal(value) && value.toString())
  definePayloadReviver("Decimal", (value: string) => new Decimal(value))
})
```

Alternatively, use TanStack dehydration options to exclude those queries from the payload; the browser then fetches them again.

## Testing

Pass the serializer to [`createTestORPCClient()`](./testing#component-tests), so that the test client builds the same cache keys as your app:

```ts
export const { client, procedures, reset } = createTestORPCClient<RouterClient<typeof router>>({
  serializer,
})
```

Handlers receive inputs and return outputs without serialization.
