import { readFile } from "node:fs/promises"
import { dirname, extname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const coreSource = fileURLToPath(new URL("../src", import.meta.url))

/**
 * Find a Nuxt runtime import reachable from an adapter's source entrypoint.
 * Scans source so the regular test command does not depend on a preceding package build.
 * Follows relative imports, the adapter's own package specifiers and core imports.
 *
 * @param packageRoot - The adapter's package directory.
 * @param packageName - The adapter's npm name, for self-referencing imports.
 * @param entry - The entrypoint's path under `src/runtime/`, without extension.
 * @returns The first offending import and the file containing it, or undefined.
 */
export async function findNuxtRuntimeImport(
  packageRoot: string,
  packageName: string,
  entry: string,
): Promise<{ file: string; specifier: string } | undefined> {
  const pending = [resolve(packageRoot, `src/runtime/${entry}.ts`)]
  const visited = new Set<string>()

  while (pending.length > 0) {
    const file = pending.pop()!
    if (visited.has(file)) continue
    visited.add(file)

    const source = await readFile(file, "utf8")
    const imports = [...source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)["']([^"']+)["']/g)].map(
      match => match[1]!,
    )
    const specifier = imports.find(
      specifier =>
        specifier === "nuxt/app" ||
        specifier.startsWith("nuxt/app/") ||
        specifier.startsWith("#app") ||
        specifier === "#imports",
    )
    if (specifier) return { file, specifier }

    for (const specifier of imports) {
      const imported = resolveOwnImport(file, specifier)
      if (imported) pending.push(imported)
    }
  }

  /** Resolve imports within the adapter and core while leaving external dependencies outside. */
  function resolveOwnImport(importer: string, specifier: string) {
    let imported: string
    if (specifier.startsWith(".")) {
      imported = resolve(dirname(importer), specifier)
    } else if (specifier.startsWith("@rpc-vue/core/")) {
      imported = resolve(coreSource, specifier.slice("@rpc-vue/core/".length))
    } else if (specifier.startsWith(`${packageName}/`)) {
      imported = resolve(packageRoot, "src/runtime", specifier.slice(packageName.length + 1))
    } else if (specifier === packageName) {
      imported = resolve(packageRoot, "src/runtime/client")
    } else {
      return undefined
    }
    return extname(imported) ? imported : `${imported}.ts`
  }
}
