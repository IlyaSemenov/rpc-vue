// VitePress configuration shared by the documentation sites.
// The repository publishes one GitHub Pages site: its root links to the adapters, and each adapter's documentation is a separate VitePress site in a subdirectory, with search limited to that adapter.

import type { DefaultTheme, UserConfig } from "vitepress"

const repository = "https://github.com/IlyaSemenov/rpc-vue"
const pagesOrigin = "https://ilyasemenov.github.io"
const pagesBase = "/rpc-vue/"

const adapters = {
  "orpc-vue": { protocol: "oRPC", path: "orpc/" },
  "trpc-vue": { protocol: "tRPC", path: "trpc/" },
}

/** Options of an adapter's documentation site. */
export interface AdapterSiteOptions {
  description: string
  /** Pages of protocol-specific APIs, appended to the guide pages that both adapters share. */
  protocolPages: DefaultTheme.SidebarItem[]
}

/**
 * Creates the VitePress configuration of an adapter's documentation site.
 *
 * Both adapters share the sidebar apart from their protocol pages, so their sites keep the same structure.
 */
export function defineAdapterSiteConfig(
  name: keyof typeof adapters,
  options: AdapterSiteOptions,
): UserConfig<DefaultTheme.Config> {
  const { protocol, path } = adapters[name]
  return {
    title: name,
    description: options.description,
    base: `${pagesBase}${path}`,
    cleanUrls: true,
    lastUpdated: true,
    themeConfig: {
      nav: [
        { text: "Guide", link: "/getting-started" },
        {
          text: protocol,
          // Absolute URLs with a target: the other adapter's site is outside `base`, and the target makes the router load it as another site.
          items: Object.values(adapters).map(adapter => ({
            text: adapter.protocol,
            link: `${pagesOrigin}${pagesBase}${adapter.path}`,
            target: "_self",
            noIcon: true,
          })),
        },
      ],
      sidebar: [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/getting-started" },
            { text: "Vue without Nuxt", link: "/vue" },
            { text: "Queries", link: "/queries" },
            { text: "Mutations", link: "/mutations" },
            { text: "Query Data", link: "/query-data" },
            ...options.protocolPages,
          ],
        },
        {
          text: "Advanced",
          items: [
            { text: "Nuxt Client Setup", link: "/nuxt-client" },
            { text: "Query Client", link: "/query-client" },
            { text: "Testing", link: "/testing" },
          ],
        },
      ],
      search: { provider: "local" },
      editLink: {
        pattern: `${repository}/edit/main/packages/${name}/docs/:path`,
      },
      socialLinks: [
        { icon: "github", link: repository },
        { icon: "npm", link: `https://www.npmjs.com/package/${name}` },
      ],
    },
  }
}

/** Creates the VitePress configuration of the root page that links to the adapters' sites. */
export function defineRootSiteConfig(): UserConfig<DefaultTheme.Config> {
  return {
    title: "rpc-vue",
    description: "oRPC and tRPC integrations for Vue and Nuxt with TanStack Vue Query",
    base: pagesBase,
    cleanUrls: true,
    themeConfig: {
      socialLinks: [{ icon: "github", link: repository }],
    },
  }
}
