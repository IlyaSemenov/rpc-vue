import { defineBrowserTests } from "@rpc-vue/core/test-utils/browser-tests"

// Batched requests name every procedure in one comma-separated path segment.
defineBrowserTests("/trpc/", path => decodeURIComponent(path).split(","))
