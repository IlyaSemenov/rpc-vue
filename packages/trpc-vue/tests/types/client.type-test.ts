import { QueryClient, skipToken, useQuery, useInfiniteQuery } from "@tanstack/vue-query"
import { createTRPCClient, httpBatchLink } from "@trpc/client"
import { initTRPC } from "@trpc/server"
import superjson from "superjson"
import { createTRPCVueContext, createTRPCVueQuery } from "trpc-vue"
import { defineNuxtPlugin } from "trpc-vue/nuxt"
import { expectTypeOf } from "vitest"
import { computed, ref } from "vue"

import { router } from "../runtime/fixture"

const client = createTRPCVueQuery<typeof router>(
  createTRPCClient<typeof router>({ links: [httpBatchLink({ url: "/trpc" })] }),
)
const context = createTRPCVueContext<typeof router>()
const trpc = context.useTrpc()
const input = ref({ id: 1 })
const query = trpc.blog.get.useQuery(input)
type Post = {
  readonly id: number
  readonly title: string
  readonly details: { readonly label: string }
}
expectTypeOf(query.data.value).toEqualTypeOf<Post | undefined>()
const optionalOptions: { default?: () => "optional" } = {}
const optionalDefault = trpc.blog.get.useQuery(input, optionalOptions)
expectTypeOf(optionalDefault.data.value).toEqualTypeOf<Post | "optional" | undefined>()
const condition = true as boolean
const conditionalDefault = trpc.blog.get.useQuery(input, {
  default: condition ? () => "conditional" as const : undefined,
})
expectTypeOf(conditionalDefault.data.value).toEqualTypeOf<Post | "conditional" | undefined>()
const literalDefault = trpc.blog.get.useQuery(input, { default: () => "literal" as const })
expectTypeOf(literalDefault.data.value).toEqualTypeOf<Post | "literal">()
const defaulted = trpc.blog.get.useQuery(input, {
  default: () => ({ id: 0, title: "Loading", details: { label: "Loading" } }),
})
expectTypeOf(defaulted.data.value.id).toEqualTypeOf<number>()
// @ts-expect-error Defaulted cached values remain deeply readonly.
defaulted.data.value.details.label = "wrong"
const nullable = trpc.blog.get.useQuery(input, { default: () => null })
expectTypeOf(nullable.data.value).toEqualTypeOf<{
  readonly id: number
  readonly title: string
  readonly details: { readonly label: string }
} | null>()
// @ts-expect-error A display default cannot be assigned into the response cache.
nullable.data.value = null
nullable.data.value = { id: 1, title: "Cached", details: { label: "Cached" } }
expectTypeOf(query.error.value?.data?.reason).toEqualTypeOf<string | undefined>()
expectTypeOf(trpc.date.query()).toEqualTypeOf<Promise<string>>()
// @ts-expect-error Input is required.
trpc.blog.get.useQuery()
// @ts-expect-error Wrong input is rejected.
trpc.blog.get.useQuery({ id: "bad" })
// @ts-expect-error Queries have no mutation observer.
trpc.blog.get.useMutation()
// @ts-expect-error Mutations have no query observer.
trpc.blog.save.useQuery()
// @ts-expect-error Native method matches procedure kind.
trpc.blog.get.mutate({ id: 1 })
// @ts-expect-error Streaming queries retain only native calls.
trpc.stream.useQuery()
// @ts-expect-error Streaming builders are not implemented.
trpc.stream.queryOptions()
// @ts-expect-error No subscription composable.
trpc.events.useSubscription()
// @ts-expect-error Cursor-free procedures have no infinite builder.
trpc.blog.get.infiniteQueryOptions({ id: 1 })
const selected = trpc.blog.get.useQuery(input, { select: (data) => data.title })
expectTypeOf(selected.data.value).toEqualTypeOf<string | undefined>()
const selectedDefault = trpc.blog.get.useQuery(input, {
  select: (data) => data.title,
  default: () => "Loading",
})
expectTypeOf(selectedDefault.data.value).toEqualTypeOf<string>()
// @ts-expect-error Selected data is readonly.
selected.data.value = "bad"
// @ts-expect-error Clone and select are mutually exclusive.
trpc.blog.get.useQuery(input, { clone: true, select: (data) => data.title })
const clone = trpc.blog.get.useQuery(input, { clone: true })
if (clone.data.value) clone.data.value.details.label = "draft"
const defaultClone = trpc.blog.get.useQuery(input, {
  clone: true,
  default: () => ({ id: 0, title: "Draft", details: { label: "Draft" } }),
})
defaultClone.data.value.details.label = "local"
const cache = new QueryClient()
expectTypeOf(cache.getQueryData(trpc.blog.get.queryKey({ id: 1 }))?.id).toEqualTypeOf<
  number | undefined
>()
// @ts-expect-error Cache writes retain output types.
cache.setQueryData(trpc.blog.get.queryKey({ id: 1 }), "wrong")
const low = useQuery(computed(() => client.blog.get.queryOptions(input.value)))
expectTypeOf(low.data.value?.id).toEqualTypeOf<number | undefined>()
useQuery(client.blog.get.queryOptions(skipToken))
useInfiniteQuery(
  client.blog.pages.infiniteQueryOptions(
    { group: "news" },
    { initialCursor: 0, getNextPageParam: (page) => page.next },
  ),
)
client.blog.pages.infiniteQueryOptions(
  { group: "news" },
  {
    // @ts-expect-error Page parameters must match the procedure cursor.
    initialCursor: "bad",
    getNextPageParam: (page) => page.next,
  },
)
const t = initTRPC.create({ transformer: superjson })
const transformed = t.router({
  deep: t.router({ nested: t.router({ date: t.procedure.query(() => new Date()) }) }),
})
const typed = createTRPCVueContext<typeof transformed>().useTrpc()
expectTypeOf(typed.deep.nested.date.query()).toEqualTypeOf<Promise<Date>>()
expectTypeOf(typed.deep.nested.date.useQuery().data.value?.getTime()).toEqualTypeOf<
  number | undefined
>()
defineNuxtPlugin<typeof transformed>(() => ({ url: "/trpc", transformer: superjson }))
// @ts-expect-error Transformer is required for this router.
defineNuxtPlugin<typeof transformed>(() => ({ url: "/trpc" }))
// @ts-expect-error A custom links branch configures its own transformer.
defineNuxtPlugin<typeof transformed>(() => ({ links: [], transformer: superjson }))
// @ts-expect-error Built-in HTTP fields cannot accompany custom links.
defineNuxtPlugin<typeof router>(() => ({ links: [], url: "/trpc" }))

const inferred = createTRPCVueQuery(createTRPCClient<typeof router>({ links: [] }))
expectTypeOf(inferred.blog.get.query({ id: 1 })).toEqualTypeOf<
  Promise<{ id: number; title: string; details: { label: string } }>
>()
// @ts-expect-error Inferred factories retain input validation without an explicit type argument.
inferred.blog.get.query({ id: "wrong" })

// @ts-expect-error Typed tRPC clients call procedures by property path, not root query(path).
client.query("date")
// @ts-expect-error Root mutation(path) belongs to TRPCUntypedClient, not TRPCClient.
client.mutation("blog.save", { title: "saved" })
