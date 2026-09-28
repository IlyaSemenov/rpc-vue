import type { Client, ORPCError, PromiseWithError } from "@orpc/client"
import { createRouterClient, os } from "@orpc/server"
import { QueryClient, skipToken } from "@tanstack/vue-query"
import { catchORPCError, createORPCVueContext, createORPCVueQuery } from "orpc-vue"
import { expectTypeOf } from "vitest"
import { createSSRApp, reactive, ref } from "vue"
import * as z from "zod"

const procedures = {
  get: os
    .input(
      z.object({
        id: z.number(),
      }),
    )
    .handler(({ input }) => {
      return {
        id: input.id,
        author: { name: "Ada" },
      }
    }),
  ping: os.handler(() => "pong"),
  update: os
    .errors({
      CONFLICT: {
        data: z.object({ field: z.string() }),
      },
      NOT_FOUND: {},
    })
    .input(z.object({ id: z.number() }))
    .handler(({ input }) => ({ id: input.id, title: "Updated" })),
  stream: os.handler(async function* () {
    yield "event"
  }),
}

/** Verify direct calls retain declared errors through the Nuxt client decorator. */
async function definedErrorInference() {
  const orpc = createORPCVueQuery(createRouterClient(router))
  const promise = orpc.update.call({ id: 1 })
  type PromiseError = typeof promise extends { __error?: { type: infer Error } } ? Error : never
  type PromiseCode = Extract<PromiseError, ORPCError<string, unknown>>["code"]
  // @ts-expect-error The phantom error union contains only declared literal codes.
  const invalidPromiseCode: PromiseCode = "FORBIDDEN"
  promise satisfies PromiseWithError<
    { id: number; title: string },
    ORPCError<"CONFLICT", { field: string }> | ORPCError<"NOT_FOUND", unknown> | Error
  >

  const handled = await catchORPCError(promise, {
    CONFLICT: (error) => {
      error.code satisfies "CONFLICT"
      error.data.field satisfies string
      // @ts-expect-error The handler receives only the matching error branch.
      error.code satisfies "NOT_FOUND"
      // @ts-expect-error Error data retains its schema-derived shape.
      void error.data.missing
      return 409 as const
    },
    NOT_FOUND: async (error) => {
      error.code satisfies "NOT_FOUND"
      return "redirect" as const
    },
  })
  handled satisfies { id: number; title: string } | 409 | "redirect"

  const absent = await catchORPCError(orpc.update.call({ id: 1 }), {
    NOT_FOUND: undefined,
  })
  absent satisfies { id: number; title: string } | undefined

  const nullable = await catchORPCError(orpc.update.call({ id: 1 }), {
    CONFLICT: false,
    NOT_FOUND: null,
  })
  nullable satisfies { id: number; title: string } | false | null

  const fallback = await catchORPCError(orpc.update.call({ id: 1 }), {
    NOT_FOUND: { missing: true as const },
  })
  fallback satisfies { id: number; title: string } | { missing: true }

  // @ts-expect-error Handler keys are limited to the procedure's declared error codes.
  catchORPCError(orpc.update.call({ id: 1 }), { FORBIDDEN: () => undefined })
  // @ts-expect-error A plain Promise has no phantom procedure error type.
  catchORPCError(Promise.resolve({ id: 1 }), { NOT_FOUND: undefined })
  void invalidPromiseCode
}

/** Verify callCatching applies catchORPCError's handler typing to the procedure call. */
async function callCatchingInference() {
  const orpc = createORPCVueQuery(createRouterClient(router))

  const handled = await orpc.update.callCatching(
    { id: 1 },
    {
      CONFLICT: (error) => {
        error.code satisfies "CONFLICT"
        error.data.field satisfies string
        return 409 as const
      },
      NOT_FOUND: null,
    },
  )
  handled satisfies { id: number; title: string } | 409 | null
  // @ts-expect-error Handled results remain in the result union.
  handled satisfies { id: number; title: string }

  const withOptions = await orpc.update.callCatching(
    { id: 1 },
    { NOT_FOUND: undefined },
    { signal: new AbortController().signal },
  )
  withOptions satisfies { id: number; title: string } | undefined

  // @ts-expect-error Handler codes are limited to declared errors.
  orpc.update.callCatching({ id: 1 }, { FORBIDDEN: null })
  // @ts-expect-error Input is validated against the procedure schema.
  orpc.update.callCatching({ id: "1" }, {})
  // @ts-expect-error Input must be passed explicitly before handlers.
  orpc.update.callCatching({ NOT_FOUND: null })
  // @ts-expect-error Procedures without declared errors do not expose callCatching.
  orpc.ping.callCatching(undefined, {})

  const query = orpc.update.useQuery(
    { id: 1 },
    {
      catching: {
        CONFLICT: (error) => {
          error.data.field satisfies string
          return 409 as const
        },
        NOT_FOUND: null,
      },
    },
  )
  expectTypeOf(query.data.value).toEqualTypeOf<
    { readonly id: number; readonly title: string } | 409 | null | undefined
  >()
  query.data.value = null
  const selected = orpc.update.useQuery(
    { id: 1 },
    {
      catching: { NOT_FOUND: null },
      select: (data) => (data === null ? "missing" : data.title),
    },
  )
  expectTypeOf(selected.data.value).toEqualTypeOf<string | undefined>()
  const defaulted = orpc.update.useQuery(
    { id: 1 },
    { catching: { NOT_FOUND: null }, default: () => "loading" as const },
  )
  expectTypeOf(defaulted.data.value).toEqualTypeOf<
    { readonly id: number; readonly title: string } | null | "loading"
  >()
  // @ts-expect-error A display default cannot be assigned into the response cache.
  defaulted.data.value = "loading"
  const asyncCaught = orpc.update.useQuery(
    { id: 1 },
    { catching: { NOT_FOUND: async () => ({ missing: true as const }) } },
  )
  expectTypeOf(asyncCaught.data.value).toEqualTypeOf<
    { readonly id: number; readonly title: string } | { readonly missing: true } | undefined
  >()
  orpc.update.useQuery(
    { id: 1 },
    // @ts-expect-error Query catching values cannot be undefined.
    { catching: { NOT_FOUND: undefined } },
  )
  orpc.update.useQuery(
    { id: 1 },
    // @ts-expect-error Query catching handlers cannot return undefined.
    { catching: { NOT_FOUND: () => {} } },
  )
  orpc.update.useQuery(
    { id: 1 },
    // @ts-expect-error Async query catching handlers cannot return undefined.
    { catching: { NOT_FOUND: async () => undefined } },
  )
  orpc.update.useQuery(
    { id: 1 },
    // @ts-expect-error Async query catching handlers cannot return void.
    { catching: { NOT_FOUND: async () => {} } },
  )
  orpc.update.useQuery(
    { id: 1 },
    {
      catching: {
        // @ts-expect-error Query catching handlers cannot possibly resolve to undefined.
        NOT_FOUND: (): Promise<{ missing: true } | undefined> => Promise.resolve(undefined),
      },
    },
  )
  orpc.update.useQuery(
    { id: 1 },
    // @ts-expect-error Query catching handlers cannot return a promise of undefined.
    { catching: { NOT_FOUND: () => Promise.resolve(undefined) } },
  )
  // @ts-expect-error Handler codes are limited to declared errors.
  orpc.update.useQuery({ id: 1 }, { catching: { FORBIDDEN: null } })
  // @ts-expect-error Procedures without declared errors do not accept catching.
  orpc.ping.useQuery(undefined, { catching: {} })
}

// Reuse the same leaves at different depths so recursion cannot silently stop after one level.
const router = {
  ...procedures,
  blog: {
    posts: procedures,
    admin: {
      comments: procedures,
    },
    users: {
      get: os.handler(() => {
        return { name: "Ada" }
      }),
    },
    useQuery: { nested: procedures.ping },
    useMutation: procedures.ping,
    queryOptions: { nested: procedures.ping },
    invalidate: { nested: procedures.ping },
  },
}

/** Compile-only assertions against source types; invalid calls below must never execute. */
async function inference() {
  const client = createRouterClient(router)
  const orpc = createORPCVueQuery(client, {
    queryClient: new QueryClient(),
  })
  const query = orpc.get.useQuery(() => ({ id: 1 }), {
    enabled: ref(true),
    staleTime: ref(1_000),
  })
  type Post = { readonly id: number; readonly author: { readonly name: string } }
  expectTypeOf(query.data.value).toEqualTypeOf<Post | undefined>()
  orpc.get.useQuery({ id: 1 }, { rejectOnError: false })
  // @ts-expect-error Await rejection is controlled by rejectOnError, not TanStack's watcher.
  orpc.get.useQuery({ id: 1 }, { throwOnError: true })
  query.data.value = {
    id: 2,
    author: { name: "new" },
  }
  const id: number | undefined = query.data.value?.id
  const optionalOptions: { default?: () => "optional" } = {}
  const optionalDefault = orpc.get.useQuery({ id: 1 }, optionalOptions)
  expectTypeOf(optionalDefault.data.value).toEqualTypeOf<Post | "optional" | undefined>()
  const condition = true as boolean
  const conditionalDefault = orpc.get.useQuery(
    { id: 1 },
    { default: condition ? () => "conditional" as const : undefined },
  )
  expectTypeOf(conditionalDefault.data.value).toEqualTypeOf<Post | "conditional" | undefined>()
  const literalDefault = orpc.get.useQuery({ id: 1 }, { default: () => "literal" as const })
  expectTypeOf(literalDefault.data.value).toEqualTypeOf<Post | "literal">()
  const defaulted = orpc.get.useQuery(
    { id: 1 },
    { default: () => ({ id: 0, author: { name: "Loading" } }) },
  )
  expectTypeOf(defaulted.data.value.id).toEqualTypeOf<number>()
  // @ts-expect-error Defaulted cached values remain deeply readonly.
  defaulted.data.value.author.name = "wrong"
  const nullable = orpc.get.useQuery({ id: 1 }, { default: () => null })
  expectTypeOf(nullable.data.value).toEqualTypeOf<{
    readonly id: number
    readonly author: { readonly name: string }
  } | null>()
  // @ts-expect-error A display default cannot be assigned into the response cache.
  nullable.data.value = null
  nullable.data.value = { id: 2, author: { name: "cached" } }
  // @ts-expect-error Cached nested values are readonly without a clone.
  query.data.value!.author.name = "wrong"
  const clone = await orpc.get.useQuery({ id: 1 }, { clone: true })
  clone.data.value!.author.name = "local"
  const defaultClone = orpc.get.useQuery(
    { id: 1 },
    {
      clone: true,
      default: () => ({ id: 0, author: { name: "Draft" } }),
    },
  )
  defaultClone.data.value.author.name = "local"
  const selected = await orpc.get.useQuery({ id: 1 }, { select: (value) => value.author })
  const name: string | undefined = selected.data.value?.name
  const selectedDefault = orpc.get.useQuery(
    { id: 1 },
    {
      select: (value) => value.author,
      default: () => ({ name: "Loading" }),
    },
  )
  expectTypeOf(selectedDefault.data.value.name).toEqualTypeOf<string>()
  // @ts-expect-error Selected data cannot be assigned back into the raw cache.
  selected.data.value = { name: "wrong" }
  // @ts-expect-error Selected objects are deeply readonly.
  selected.data.value!.name = "wrong"
  // @ts-expect-error A clone cannot be combined with select.
  orpc.get.useQuery({ id: 1 }, { clone: true, select: (value) => value.id })
  // @ts-expect-error Required input cannot be omitted.
  orpc.get.useQuery()
  // @ts-expect-error Invalid input.
  orpc.get.useQuery({ id: "1" })
  // @ts-expect-error Invalid output cannot enter the cache.
  query.data.value = { id: "1" }
  const ping = await orpc.ping.useQuery()
  const pong: string | undefined = ping.data.value
  const mutation = orpc.get.useMutation({
    onSuccess: (output) => {
      output.id satisfies number
    },
  })
  const output = await mutation.mutateAsync({ id: 1 })
  output.author.name satisfies string
  // @ts-expect-error Mutation input is inferred.
  mutation.mutate({ id: "wrong" })
  // @ts-expect-error Subscriptions are outside phase one.
  orpc.stream.useSubscription()
  // @ts-expect-error Endless streams are not regular SSR queries.
  orpc.stream.useQuery()
  return {
    id,
    name,
    pong,
  }
}

/** Cover reactive inputs, overloads and utilities through several router levels. */
async function nestedInference() {
  const client = createRouterClient(router)
  const orpc = createORPCVueQuery(client)
  const input = ref({ id: 1 })
  const options = ref({ enabled: true })
  const query = orpc.blog.posts.get.useQuery(input, options)
  query.data.value?.id satisfies number | undefined
  // @ts-expect-error Nested output must not degrade to any.
  query.data.value?.id satisfies string
  // @ts-expect-error Cached nested data remains readonly.
  query.data.value!.author.name = "wrong"
  // @ts-expect-error Nested input is still required.
  orpc.blog.posts.get.useQuery()
  // @ts-expect-error Invalid reactive input must be rejected at a nested leaf.
  orpc.blog.posts.get.useQuery(ref({ id: "wrong" }))

  orpc.blog.posts.get.useQuery(reactive({ id: 1 }))
  orpc.blog.posts.get.useQuery(
    () => input.value,
    () => options.value,
  )
  orpc.blog.posts.get.useQuery(() => (options.value.enabled ? input.value : skipToken))
  const clone = await orpc.blog.posts.get.useQuery(input, { clone: true })
  clone.data.value!.author.name = "draft"
  // @ts-expect-error A mutable clone still preserves its response type.
  clone.data.value!.author.name = 123
  const selected = await orpc.blog.posts.get.useQuery(input, {
    select: (post) => {
      post.id satisfies number
      // @ts-expect-error The select callback receives the actual procedure output.
      void post.missing
      return post.author
    },
  })
  selected.data.value?.name satisfies string | undefined
  // @ts-expect-error Selected nested data remains readonly.
  selected.data.value!.name = "wrong"
  // @ts-expect-error Selection cannot be assigned into the underlying response cache.
  selected.data.value = { name: "wrong" }
  // @ts-expect-error clone and select remain mutually exclusive at nested leaves.
  orpc.blog.posts.get.useQuery(input, { clone: true, select: (post) => post.id })

  const mutation = orpc.blog.posts.get.useMutation({
    onSuccess: (output, variables) => {
      output.author.name satisfies string
      variables.id satisfies number
      // @ts-expect-error Mutation callback output must not become any.
      void output.name
    },
  })
  const updated = await mutation.mutateAsync({ id: 1 })
  updated.id satisfies number
  // @ts-expect-error Nested mutation input is checked.
  mutation.mutate({ id: "wrong" })

  const deep = await orpc.blog.admin.comments.get.useQuery({ id: 1 })
  deep.data.value?.author.name satisfies string | undefined
  // @ts-expect-error Output inference must survive more than two router levels.
  deep.data.value?.author.name satisfies number
  const user = await orpc.blog.users.get.useQuery()
  user.data.value?.name satisfies string | undefined
  // @ts-expect-error Sibling procedures have independent response types.
  void user.data.value?.id
  // @ts-expect-error Missing intermediate router branches are rejected.
  orpc.blog.missing.get.useQuery()
  // @ts-expect-error Missing leaves are rejected.
  orpc.blog.posts.missing.useQuery()
  // @ts-expect-error A router branch is not a query procedure.
  orpc.blog.posts.useQuery()
  // @ts-expect-error A router branch is not a mutation procedure.
  orpc.blog.admin.useMutation()

  const direct = await orpc.blog.posts.get.call({ id: 1 })
  orpc.invalidate() satisfies Promise<void>
  orpc.blog.posts.invalidate() satisfies Promise<void>
  orpc.blog.admin.comments.get.invalidate() satisfies Promise<void>
  orpc.blog.posts.stream.invalidate() satisfies Promise<void>
  await orpc.blog.invalidate.nested.useQuery()
  // @ts-expect-error Procedure invalidation takes no input; it covers all cached inputs.
  orpc.blog.posts.get.invalidate({ id: 1 })
  direct.author.name satisfies string
  orpc.blog.key()
  orpc.blog.posts.key()
  orpc.blog.posts.get.queryKey({ input: { id: 1 } })
  orpc.blog.posts.get.queryOptions({ input: { id: 1 } })
  orpc.blog.posts.get.mutationOptions()
  // @ts-expect-error Upstream utilities retain nested input validation.
  orpc.blog.posts.get.queryOptions({ input: { id: "wrong" } })
  await orpc.blog.useQuery.nested.useQuery()
  await orpc.blog.queryOptions.nested.useQuery()
  const collision = await orpc.blog.useMutation.call()
  collision satisfies string
  // @ts-expect-error Streamed outputs do not gain regular query composables at nested paths.
  orpc.blog.posts.stream.useQuery()
  // @ts-expect-error Streamed outputs do not gain regular mutation composables either.
  orpc.blog.posts.stream.useMutation()
}

/** Verify that wrapping flat or nested clients does not make required context optional. */
function contextInference(raw: {
  get: Client<{ token: string }, void, number, ORPCError<"UNAUTHORIZED", unknown> | Error>
  blog: {
    posts: {
      get: Client<{ token: string }, { id: number }, { title: string }, Error>
    }
  }
}) {
  const orpc = createORPCVueQuery(raw)
  // @ts-expect-error Required client context must be provided.
  orpc.get.useQuery()
  orpc.get.useQuery(undefined, {
    context: { token: "token" },
  })
  // @ts-expect-error Required client context also applies to mutations.
  orpc.get.useMutation()
  orpc.get.useMutation({
    context: () => {
      return { token: "token" }
    },
  })
  // @ts-expect-error Required client context also applies to callCatching.
  orpc.get.callCatching(undefined, {})
  orpc.get.callCatching(undefined, {}, { context: { token: "token" } })

  const query = orpc.blog.posts.get.useQuery(
    { id: 1 },
    {
      context: ref({ token: "token" }),
    },
  )
  query.error.value?.message satisfies string | undefined
  // @ts-expect-error Nested query errors retain their error type.
  void query.error.value?.missing
  // @ts-expect-error Required context cannot be omitted at a nested query.
  orpc.blog.posts.get.useQuery({ id: 1 })
  // @ts-expect-error Required context also applies to the clone overload.
  orpc.blog.posts.get.useQuery({ id: 1 }, { clone: true })
  // @ts-expect-error Required context also applies to the select overload.
  orpc.blog.posts.get.useQuery({ id: 1 }, { select: (post) => post.title })
  orpc.blog.posts.get.useQuery(
    { id: 1 },
    {
      context: { token: "token" },
      clone: true,
    },
  )
  orpc.blog.posts.get.useQuery(
    { id: 1 },
    {
      context: { token: "token" },
      select: (post) => post.title,
    },
  )
  // @ts-expect-error Required context cannot be omitted at a nested mutation.
  orpc.blog.posts.get.useMutation()
  orpc.blog.posts.get.useMutation({
    context: { token: "token" },
    onError: (error) => {
      error.message satisfies string
      // @ts-expect-error Nested mutation errors retain their error type.
      void error.missing
    },
  })
}

/** Verify the plain Vue accessor preserves deeply nested procedure types. */
function vueContextInference() {
  const raw = createRouterClient(router)
  const context = createORPCVueContext<typeof raw>()
  const app = createSSRApp({ render: () => null })
  app.provide(context.key, createORPCVueQuery(raw, { queryClient: new QueryClient() }))
  const orpc = context.useOrpc()
  const query = orpc.blog.posts.get.useQuery({ id: 1 })
  query.data.value?.author.name satisfies string | undefined
  // @ts-expect-error The injected client retains nested input validation.
  orpc.blog.posts.get.useQuery({ id: "wrong" })
  // @ts-expect-error The injected client retains its router shape.
  orpc.blog.missing.get.useQuery()
}

void inference
void nestedInference
void contextInference
void vueContextInference
void definedErrorInference
void callCatchingInference
