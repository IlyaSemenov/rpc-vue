import type { QueryClient } from "@tanstack/vue-query"
import {
  defineNuxtPlugin,
  type NuxtApp,
  type NuxtSSRContext,
  type Plugin,
  useRequestHeaders,
  useRequestURL,
} from "nuxt/app"

import { resolveQueryClient } from "../vue-query/query-client"
import type { ClientOptions } from "../vue-query/types"

/** Nuxt state available while creating one app's custom transport. */
export interface TransportContext {
  /** The Nuxt application that will own the client. */
  nuxtApp: NuxtApp
  /** The current H3 request event during SSR, or undefined in the browser. */
  // NuxtApp's type includes plugin injections, so reading the event through it would make a
  // plugin whose transport factory uses the event depend on its own type.
  event: NuxtSSRContext["event"] | undefined
}

/** Settings of the client plugin's default HTTP transport. */
export interface HttpTransportOptions {
  /** RPC handler URL, including its path; relative URLs resolve against the current page URL. */
  url: string
  /** Optional SSR handler URL; an absent or empty value falls back to url. */
  serverUrl?: string
  /** Fetch credentials policy, for example include for cross-origin browser cookies. */
  credentials?: RequestCredentials
  /** Incoming headers to forward during SSR; only explicitly listed headers are forwarded. */
  forwardHeaders?: readonly string[]
}

type Excluded<TFields> = { [TKey in keyof TFields]?: never }

/**
 * Client plugin options with either a custom transport or the default HTTP transport's settings.
 * Each branch rules out the other's fields, so a custom transport cannot silently ignore them.
 *
 * @typeParam TCustomTransport - The adapter's custom transport fields.
 * @typeParam THttpTransport - Adapter fields that only the default HTTP transport uses.
 */
export type ClientPluginOptions<
  TCustomTransport extends object,
  THttpTransport extends object = object,
> = ClientOptions &
  (
    | (TCustomTransport & Excluded<HttpTransportOptions & THttpTransport>)
    | (Excluded<TCustomTransport> & HttpTransportOptions & THttpTransport)
  )

/**
 * Define a Nuxt plugin that provides one decorated client per Nuxt app.
 * The app's QueryClient is captured before the client is created, so invalidation works before
 * any composable runs.
 *
 * @param packageName - Names the adapter in the error thrown when no QueryClient is available.
 * @param setup - The application's options callback, run once per SSR request and browser app.
 * @param provide - Create the client for these options, transport context and cache, and return
 *   the plugin's injections.
 */
export function defineClientPlugin<
  TOptions extends ClientOptions,
  TInjections extends Record<string, unknown>,
>(
  packageName: string,
  setup: (nuxtApp: NuxtApp) => TOptions,
  provide: (
    options: TOptions,
    transport: TransportContext,
    queryClient: QueryClient,
  ) => TInjections,
): Plugin<TInjections> {
  return defineNuxtPlugin(nuxtApp => {
    const options = setup(nuxtApp)
    const queryClient = options.queryClient ?? resolveQueryClient(nuxtApp.vueApp)
    if (!queryClient) {
      throw new Error(
        `${packageName}: install Vue Query before the client plugin. Enable queryClient in one RPC module, use enforce: "pre" in your Vue Query plugin, or pass queryClient explicitly.`,
      )
    }
    return {
      provide: provide(options, { nuxtApp, event: nuxtApp.ssrContext?.event }, queryClient),
    }
  })
}

/**
 * Resolve the endpoint, forwarded SSR headers and credentialed fetch for this app's HTTP link.
 * Call during plugin setup, while the Nuxt request context is active.
 *
 * @param packageName - Names the adapter in the error thrown for a non-HTTP URL.
 */
export function resolveHttpTransport(options: HttpTransportOptions, packageName: string) {
  const url = new URL(
    import.meta.server ? options.serverUrl || options.url : options.url,
    useRequestURL(),
  )
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${packageName}: the RPC handler URL must use HTTP or HTTPS.`)
  }
  return {
    url,
    // An explicit empty list is essential: undefined would forward every incoming header.
    headers: useRequestHeaders([...(options.forwardHeaders ?? [])]),
    fetch(input: RequestInfo | URL, init?: RequestInit) {
      return globalThis.fetch(input, { ...init, credentials: options.credentials })
    },
  }
}
