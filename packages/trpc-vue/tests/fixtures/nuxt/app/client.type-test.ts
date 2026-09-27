import { type QueryClient, skipToken } from "@tanstack/vue-query"
import { httpBatchLink, type TRPCClientError } from "@trpc/client"
import superjson from "superjson"
import { createTRPCVueContext } from "trpc-vue"
import { defineNuxtPlugin } from "trpc-vue/nuxt"
import { reactive, ref } from "vue"
import type { AppRouter } from "~~/server/trpc/router"

/** Verify helper options at the package boundary without executing a Nuxt plugin. */
export function checkPluginOptions() {
  defineNuxtPlugin<AppRouter>(() => ({
    url: "/trpc",
    serverUrl: "http://api:3000/trpc",
    credentials: "include",
    forwardHeaders: ["cookie"],
    prefix: "blog",
    transformer: superjson,
  }))
  // @ts-expect-error The RPC handler URL is required.
  defineNuxtPlugin<AppRouter>(() => ({ transformer: superjson }))
  // @ts-expect-error The router's transformer is required by the built-in HTTP transport.
  defineNuxtPlugin<AppRouter>(() => ({ url: "/trpc" }))
  defineNuxtPlugin<AppRouter>(() => ({
    url: "/trpc",
    // @ts-expect-error Fetch credentials use the standard RequestCredentials values.
    credentials: "all",
    transformer: superjson,
  }))
  defineNuxtPlugin<AppRouter>(() => ({
    links: [httpBatchLink({ url: "/trpc", transformer: superjson })],
  }))
  defineNuxtPlugin<AppRouter>(() => ({
    links: ({ nuxtApp, event }) => {
      nuxtApp.vueApp.version satisfies string
      event?.context satisfies Record<string, unknown> | undefined
      return [
        httpBatchLink({
          url: event ? "http://ssr.example/trpc" : "/trpc",
          transformer: superjson,
        }),
      ]
    },
  }))
  // @ts-expect-error Custom links replace the built-in URL transport configuration.
  defineNuxtPlugin<AppRouter>(() => ({
    links: [httpBatchLink({ url: "/trpc", transformer: superjson })],
    url: "/trpc",
  }))
}

/**
 * Check the published declarations through Nuxt's generated plugin injections.
 * This function is never called; expected type errors detect accidental loss of router types.
 */
export function checkClientTypes() {
  const trpc = useTrpc()
  const query = trpc.hello.useQuery()
  const name: string | undefined = query.data.value?.name
  query.data.value?.date satisfies Date | undefined
  // @ts-expect-error Date output must not widen to its serialized string.
  query.data.value?.date satisfies string | undefined
  // @ts-expect-error Unknown procedure paths must not become any.
  trpc.doesNotExist.useQuery()
  // @ts-expect-error Raw cache data has a fixed shape.
  query.data.value = "wrong"
  const selected = trpc.hello.useQuery(undefined, {
    select: (data) => data.name,
  })
  // @ts-expect-error Selected results remain readonly across the package boundary.
  selected.data.value = "wrong"
  return name
}

/** Check recursive inference through the built package and both Nuxt client accessors. */
export async function checkNestedClientTypes() {
  const trpc = useTrpc()
  const injected = useNuxtApp().$trpc
  const provided = createTRPCVueContext<AppRouter>().useTrpc()
  const input = ref({ id: 1 })
  const options = ref({ enabled: true })
  const query = trpc.blog.posts.get.useQuery(input, options)
  query.data.value?.id satisfies number | undefined
  query.error.value satisfies TRPCClientError<AppRouter> | null
  trpc.blog.posts.get.useQuery(input, { rejectOnError: false })
  // @ts-expect-error Built declarations replace TanStack throwOnError with rejectOnError.
  trpc.blog.posts.get.useQuery(input, { throwOnError: true })
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
  trpc.blog.posts.get.useQuery()
  // @ts-expect-error Nested input retains its schema-derived type.
  trpc.blog.posts.get.useQuery({ id: "wrong" })
  trpc.blog.posts.get.useQuery(reactive({ id: 1 }))
  trpc.blog.posts.get.useQuery(
    () => input.value,
    () => options.value,
  )
  trpc.blog.posts.get.useQuery(() => (options.value.enabled ? input.value : skipToken))

  const clone = await trpc.blog.posts.get.useQuery(input, { clone: true })
  clone.data.value!.details.title = "draft"
  // @ts-expect-error Mutable clone fields keep their inferred types.
  clone.data.value!.details.title = 123
  const selected = await trpc.blog.posts.get.useQuery(input, {
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
  trpc.blog.posts.get.useQuery(input, { clone: true, select: (post) => post.id })

  const mutation = injected.blog.posts.update.useMutation({
    onSuccess: (output, variables) => {
      output.details.title satisfies string
      variables.id satisfies number
      // @ts-expect-error Callback output must not become any through $trpc.
      void output.missing
    },
  })
  const updated = await mutation.mutateAsync({ id: 1, title: "updated" })
  updated.details.title satisfies string
  // @ts-expect-error Nested mutation output remains typed.
  updated.details.title satisfies number
  // @ts-expect-error Nested mutations reject missing required fields.
  mutation.mutate({ id: 1 })

  const deep = await trpc.blog.admin.comments.get.useQuery({ id: 1 })
  deep.data.value?.details.title satisfies string | undefined
  // @ts-expect-error The deepest tested leaf must not lose its response type.
  deep.data.value?.details.title satisfies number
  const user = await trpc.blog.users.get.useQuery()
  user.data.value?.name satisfies string | undefined
  // @ts-expect-error Sibling procedures must not inherit another leaf's response.
  void user.data.value?.id
  // @ts-expect-error Missing intermediate paths must fail through useTrpc.
  trpc.blog.missing.get.useQuery()
  // @ts-expect-error Missing leaves must fail through useNuxtApp().$trpc too.
  injected.blog.posts.missing.useQuery()
  // @ts-expect-error Router branches are not query procedures.
  trpc.blog.posts.useQuery()
  // @ts-expect-error Router branches are not mutation procedures.
  injected.blog.admin.useMutation()
  // @ts-expect-error Injected queries must validate input independently of useTrpc.
  injected.blog.posts.get.useQuery({ id: "wrong" })
  // @ts-expect-error Clients from a Vue context retain the router's input types.
  provided.blog.admin.comments.get.useQuery({ id: "wrong" })

  const direct = await injected.blog.posts.get.query({ id: 1 })
  trpc.blog.posts.invalidate() satisfies Promise<void>
  injected.blog.admin.comments.get.invalidate() satisfies Promise<void>
  // @ts-expect-error Namespace invalidation takes no input.
  trpc.blog.posts.invalidate({ id: 1 })
  direct.details.title satisfies string
  // @ts-expect-error Native call output remains typed across the published package boundary.
  direct.details.title satisfies number
  // @ts-expect-error Native methods match the procedure kind.
  injected.blog.posts.get.mutate({ id: 1 })
  trpc.blog.pathKey()
  trpc.blog.posts.pathKey()
  trpc.blog.posts.get.queryKey({ id: 1 })
  trpc.blog.posts.get.queryOptions({ id: 1 })
  trpc.blog.posts.update.mutationOptions()
  // @ts-expect-error Utility options retain the nested input schema.
  trpc.blog.posts.get.queryOptions({ id: "wrong" })
  await trpc.blog.useQuery.nested.useQuery()
  await trpc.blog.queryOptions.nested.useQuery()
  const collision = await trpc.blog.useMutation.query()
  collision satisfies string
  // @ts-expect-error Nested streams do not expose regular query composables.
  trpc.blog.posts.stream.useQuery()
  // @ts-expect-error Nested streams do not expose regular mutation composables.
  trpc.blog.posts.stream.useMutation()
}

/** Check the auto-imported cache accessor against the built declarations. */
export function checkQueryClientTypes() {
  const queryClient = useTrpcQueryClient()
  queryClient satisfies QueryClient
  // @ts-expect-error The accessor reads the app's own cache and takes no arguments.
  useTrpcQueryClient(queryClient)
}
