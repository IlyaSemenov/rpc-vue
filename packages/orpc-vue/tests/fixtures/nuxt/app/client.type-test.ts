import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"
import { type QueryClient, skipToken } from "@tanstack/vue-query"
import { catchORPCError, createORPCVueContext } from "orpc-vue"
import { defineNuxtPlugin } from "orpc-vue/nuxt"
import { reactive, ref } from "vue"
import type { router } from "~~/server/orpc/router"

/** Verify helper options at the package boundary without executing a Nuxt plugin. */
export function checkPluginOptions() {
  defineNuxtPlugin<RouterClient<typeof router>>(() => ({
    url: "/orpc",
    serverUrl: "http://api:3000/orpc",
    credentials: "include",
    forwardHeaders: ["cookie"],
    prefix: "blog",
  }))
  // @ts-expect-error The RPC handler URL is required.
  defineNuxtPlugin<RouterClient<typeof router>>(() => ({}))
  // @ts-expect-error Fetch credentials use the standard RequestCredentials values.
  defineNuxtPlugin<RouterClient<typeof router>>(() => ({ url: "/orpc", credentials: "all" }))
  defineNuxtPlugin<RouterClient<typeof router>>(() => ({
    link: new RPCLink({ url: "/orpc" }),
  }))
  defineNuxtPlugin<RouterClient<typeof router>>(() => ({
    link: ({ nuxtApp, event }) => {
      nuxtApp.vueApp.version satisfies string
      event?.context satisfies Record<string, unknown> | undefined
      return new RPCLink({
        origin: event ? "http://ssr.example" : undefined,
        url: "/orpc",
      })
    },
  }))
  // @ts-expect-error A custom link replaces the built-in URL transport configuration.
  defineNuxtPlugin<RouterClient<typeof router>>(() => ({
    link: new RPCLink({ url: "/orpc" }),
    url: "/orpc",
  }))
}

/**
 * Check the published declarations through Nuxt's generated plugin injections.
 * This function is never called; expected type errors detect accidental loss of router types.
 */
export function checkClientTypes() {
  const orpc = useOrpc()
  const query = orpc.hello.useQuery()
  const name: string | undefined = query.data.value?.name
  query.data.value?.date satisfies Date | undefined
  // @ts-expect-error Date output must not widen to its serialized string.
  query.data.value?.date satisfies string | undefined
  // @ts-expect-error Unknown procedure paths must not become any.
  orpc.doesNotExist.useQuery()
  // @ts-expect-error Raw cache data has a fixed shape.
  query.data.value = "wrong"
  const selected = orpc.hello.useQuery(undefined, {
    select: (data) => data.name,
  })
  // @ts-expect-error Selected results remain readonly across the package boundary.
  selected.data.value = "wrong"
  return name
}

/** Check recursive inference through the built package and both Nuxt client accessors. */
export async function checkNestedClientTypes() {
  const orpc = useOrpc()
  const injected = useNuxtApp().$orpc
  const provided = createORPCVueContext<RouterClient<typeof router>>().useOrpc()
  const input = ref({ id: 1 })
  const options = ref({ enabled: true })
  const query = orpc.blog.posts.get.useQuery(input, options)
  query.data.value?.id satisfies number | undefined
  query.data.value = {
    id: 2,
    details: { title: "saved" },
  }
  // @ts-expect-error A nested response must not become any at the package boundary.
  query.data.value.id satisfies string
  // @ts-expect-error Cached nested properties remain readonly.
  query.data.value.details.title = "wrong"
  // @ts-expect-error Whole-value assignments still require the procedure's response shape.
  query.data.value = "wrong"
  // @ts-expect-error Nested input is required through Nuxt auto-imports.
  orpc.blog.posts.get.useQuery()
  // @ts-expect-error Nested input retains its schema-derived type.
  orpc.blog.posts.get.useQuery({ id: "wrong" })
  orpc.blog.posts.get.useQuery(reactive({ id: 1 }))
  orpc.blog.posts.get.useQuery(
    () => input.value,
    () => options.value,
  )
  orpc.blog.posts.get.useQuery(() => (options.value.enabled ? input.value : skipToken))

  const clone = await orpc.blog.posts.get.useQuery(input, { clone: true })
  clone.data.value!.details.title = "draft"
  // @ts-expect-error Mutable clone fields keep their inferred types.
  clone.data.value!.details.title = 123
  const selected = await orpc.blog.posts.get.useQuery(input, {
    select: (post) => {
      post.id satisfies number
      // @ts-expect-error Nested select callbacks receive the inferred response.
      void post.missing
      return post.details
    },
  })
  selected.data.value?.title satisfies string | undefined
  // @ts-expect-error Selected nested objects are readonly.
  selected.data.value!.title = "wrong"
  // @ts-expect-error Selected values cannot be replaced.
  selected.data.value = { title: "wrong" }
  // @ts-expect-error clone and select remain mutually exclusive after declaration emission.
  orpc.blog.posts.get.useQuery(input, { clone: true, select: (post) => post.id })

  const mutation = injected.blog.posts.update.useMutation({
    onSuccess: (output, variables) => {
      output.details.title satisfies string
      variables.id satisfies number
      // @ts-expect-error Callback output must not become any through $orpc.
      void output.missing
    },
  })
  const updated = await mutation.mutateAsync({ id: 1, title: "updated" })
  updated.details.title satisfies string
  // @ts-expect-error Nested mutation output remains typed.
  updated.details.title satisfies number
  // @ts-expect-error Nested mutations reject missing required fields.
  mutation.mutate({ id: 1 })

  const handled = await catchORPCError(
    injected.blog.posts.update.call({ id: 1, title: "updated" }),
    {
      CONFLICT: (error) => {
        error.code satisfies "CONFLICT"
        error.data.field satisfies string
        return 409 as const
      },
      NOT_FOUND: null,
    },
  )
  handled satisfies { id: number; details: { title: string } } | 409 | null
  catchORPCError(injected.blog.posts.update.call({ id: 1, title: "updated" }), {
    // @ts-expect-error Direct calls retain their declared error codes after declaration emission.
    FORBIDDEN: undefined,
  })
  const caught = await injected.blog.posts.update.callCatching(
    { id: 1, title: "updated" },
    { NOT_FOUND: null },
  )
  caught satisfies { id: number; details: { title: string } } | null
  // @ts-expect-error callCatching retains declared error codes after declaration emission.
  injected.blog.posts.update.callCatching({ id: 1, title: "updated" }, { FORBIDDEN: null })
  const caughtQuery = injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    { catching: { NOT_FOUND: null } },
  )
  caughtQuery.data.value satisfies
    | { readonly id: number; readonly details: { readonly title: string } }
    | null
    | undefined
  const syncCaughtQuery = injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    { catching: { NOT_FOUND: () => ({ missing: true as const }) } },
  )
  syncCaughtQuery.data.value satisfies
    | { readonly id: number; readonly details: { readonly title: string } }
    | { readonly missing: true }
    | undefined
  const asyncCaughtQuery = injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    { catching: { NOT_FOUND: async () => null } },
  )
  asyncCaughtQuery.data.value satisfies
    | { readonly id: number; readonly details: { readonly title: string } }
    | null
    | undefined
  injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    // @ts-expect-error Query catching values cannot be undefined after declaration emission.
    { catching: { NOT_FOUND: undefined } },
  )
  injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    // @ts-expect-error Query catching handlers cannot return undefined after declaration emission.
    { catching: { NOT_FOUND: () => {} } },
  )
  injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    // @ts-expect-error Async query catching handlers cannot return undefined after declaration emission.
    { catching: { NOT_FOUND: async () => undefined } },
  )
  injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    // @ts-expect-error Async query catching handlers cannot return void after declaration emission.
    { catching: { NOT_FOUND: async () => {} } },
  )
  injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    {
      catching: {
        // @ts-expect-error Query catching handlers cannot possibly resolve to undefined after declaration emission.
        NOT_FOUND: (): Promise<{ missing: true } | undefined> => Promise.resolve(undefined),
      },
    },
  )
  injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    // @ts-expect-error Query catching handlers cannot return a promise of undefined after declaration emission.
    { catching: { NOT_FOUND: () => Promise.resolve(undefined) } },
  )
  injected.blog.posts.update.useQuery(
    { id: 1, title: "updated" },
    // @ts-expect-error Query catching retains declared error codes after declaration emission.
    { catching: { FORBIDDEN: null } },
  )
  // @ts-expect-error Procedures without declared errors do not expose callCatching.
  injected.blog.posts.ping.callCatching(undefined, {})
  // @ts-expect-error Procedures without declared errors do not accept query catching.
  injected.blog.posts.ping.useQuery(undefined, { catching: {} })

  const deep = await orpc.blog.admin.comments.get.useQuery({ id: 1 })
  deep.data.value?.details.title satisfies string | undefined
  // @ts-expect-error The deepest tested leaf must not lose its response type.
  deep.data.value?.details.title satisfies number
  const user = await orpc.blog.users.get.useQuery()
  user.data.value?.name satisfies string | undefined
  // @ts-expect-error Sibling procedures must not inherit another leaf's response.
  void user.data.value?.id
  // @ts-expect-error Missing intermediate paths must fail through useOrpc.
  orpc.blog.missing.get.useQuery()
  // @ts-expect-error Missing leaves must fail through useNuxtApp().$orpc too.
  injected.blog.posts.missing.useQuery()
  // @ts-expect-error Router branches are not query procedures.
  orpc.blog.posts.useQuery()
  // @ts-expect-error Router branches are not mutation procedures.
  injected.blog.admin.useMutation()
  // @ts-expect-error Injected queries must validate input independently of useOrpc.
  injected.blog.posts.get.useQuery({ id: "wrong" })
  // @ts-expect-error Clients from a Vue context retain the router's input types.
  provided.blog.admin.comments.get.useQuery({ id: "wrong" })

  const direct = await injected.blog.posts.get.call({ id: 1 })
  orpc.blog.posts.invalidate() satisfies Promise<void>
  injected.blog.admin.comments.get.invalidate() satisfies Promise<void>
  // @ts-expect-error Namespace invalidation takes no input.
  orpc.blog.posts.invalidate({ id: 1 })
  direct.details.title satisfies string
  // @ts-expect-error Direct call output remains typed across the published package boundary.
  direct.details.title satisfies number
  orpc.blog.key()
  orpc.blog.posts.key()
  orpc.blog.posts.get.queryKey({ input: { id: 1 } })
  orpc.blog.posts.get.queryOptions({ input: { id: 1 } })
  orpc.blog.posts.update.mutationOptions()
  // @ts-expect-error Official utility options retain the nested input schema.
  orpc.blog.posts.get.queryOptions({ input: { id: "wrong" } })
  await orpc.blog.useQuery.nested.useQuery()
  await orpc.blog.queryOptions.nested.useQuery()
  const collision = await orpc.blog.useMutation.call()
  collision satisfies string
  // @ts-expect-error Nested streams do not expose regular query composables.
  orpc.blog.posts.stream.useQuery()
  // @ts-expect-error Nested streams do not expose regular mutation composables.
  orpc.blog.posts.stream.useMutation()
}

/** Check the auto-imported cache accessor against the built declarations. */
export function checkQueryClientTypes() {
  const queryClient = useOrpcQueryClient()
  queryClient satisfies QueryClient
  // @ts-expect-error The accessor reads the app's own cache and takes no arguments.
  useOrpcQueryClient(queryClient)
}
