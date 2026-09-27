import {
  type AnyNestedClient,
  type ClientLink,
  createORPCClient,
  type InferClientContext,
} from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import {
  type ClientPluginOptions,
  defineClientPlugin,
  type HttpTransportOptions,
  resolveHttpTransport,
  type TransportContext,
} from "@rpc-vue/core/nuxt/client-plugin"
import type { NuxtApp, Plugin } from "nuxt/app"

import { createORPCVueQuery } from "../client/create"
import type { ORPCVueQueryClient, ORPCVueQueryOptions } from "../types"

export type { TransportContext as OrpcLinkContext } from "@rpc-vue/core/nuxt/client-plugin"

/** Configure the transport and cache used by a Nuxt app's injected oRPC client. */
export type OrpcPluginOptions<TClient extends AnyNestedClient = AnyNestedClient> =
  ClientPluginOptions<{
    /** Use an application-owned link or create one for each Nuxt application. */
    link:
      | ClientLink<InferClientContext<TClient>>
      | ((context: TransportContext) => ClientLink<InferClientContext<TClient>>)
  }> &
    Pick<ORPCVueQueryOptions, "onUnexpectedError">

/**
 * Create an oRPC client per Nuxt app and provide it as $orpc with inferred router types.
 * The setup callback runs once per SSR request and once when the browser app starts.
 * A custom link factory also runs once per app and receives its Nuxt app and H3 event.
 * Install Vue Query before this plugin, or return an explicit queryClient from setup.
 * Its QueryClient is captured immediately, so invalidate works before any composable runs.
 */
export function defineNuxtPlugin<TClient extends AnyNestedClient>(
  setup: (nuxtApp: NuxtApp) => OrpcPluginOptions<TClient>,
): Plugin<{ orpc: ORPCVueQueryClient<TClient> }> {
  return defineClientPlugin("orpc-vue", setup, (options, transport, queryClient) => {
    const link =
      typeof options.link === "function"
        ? options.link(transport)
        : (options.link ?? createHTTPLink(options))
    return {
      orpc: createORPCVueQuery(createORPCClient<TClient>(link), {
        prefix: options.prefix,
        queryClient,
        onUnexpectedError: options.onUnexpectedError,
      }),
    }
  })
}

/** Build the helper's default HTTP link after the custom-link branch has been excluded. */
function createHTTPLink(options: HttpTransportOptions) {
  const { url, headers, fetch } = resolveHttpTransport(options, "orpc-vue")
  return new RPCLink({
    // oRPC v2 accepts the origin separately from the handler path and query string.
    origin: url.origin,
    // HTTP URL.pathname always starts with the slash required by StandardUrl.
    url: `${url.pathname}${url.search}` as `/${string}`,
    headers,
    fetch,
  })
}
