import { cp, mkdtemp, rm, writeFile } from "node:fs/promises"
import { createServer } from "node:net"
import { tmpdir } from "node:os"
import { basename, join, relative } from "node:path"

import nuxtPkg from "nuxt/package.json"

/** The parts of a test package's package.json that pin the consumer's tooling. */
interface ToolingPackage {
  devDependencies: Record<string, string>
}

/** The parts of an adapter's package.json that shape its isolated consumer. */
interface AdapterPackage extends ToolingPackage {
  name: string
  peerDependencies: Record<string, string>
  peerDependenciesMeta: Record<string, { optional?: boolean }>
}

/**
 * Pages shared by both adapters' Nuxt fixtures, as a layer that the fixtures extend in the workspace
 * and that isolated consumers receive as a copy beneath the adapter fixture.
 * They reach the adapter through `useRpc()`, `useRpcQueryClient()`, `useManualRpc()` and
 * `usePostKey()`, which each adapter fixture defines.
 */
export const adapterFixture = join(import.meta.dir, "adapter-fixture")

// The consumer installs only the package's own dependencies, so component tests and build output stay behind.
const excludedFromConsumer = new Set([
  "node_modules",
  ".nuxt",
  ".nuxtrc",
  ".output",
  "test",
  "vitest.config.ts",
])

/**
 * Check packed adapters in isolated Nuxt consumers assembled from the package's Nuxt fixture.
 * Each consumer is typechecked, then runs the package's Playwright tests against its development
 * server and, without `--dev`, its production build.
 * Other command-line arguments select the Nuxt versions; by default the exact Nuxt installed in
 * the workspace is checked, so the run stays deterministic and matches the lockfile.
 *
 * @param options.packageRoot - The package with the fixture in `tests/fixtures/nuxt` and the
 *   Playwright tests; its devDependencies pin the fixture's tooling.
 * @param options.adapterRoots - The adapter packages to pack and install.
 * @param options.fixtures - Directories copied before the package's fixture, which extends them.
 * @param options.dependencies - Protocol packages the fixtures import, at the workspace versions.
 * @param options.owners - `RPC_TEST_OWNER` values, each checked in a separate consumer.
 * @param options.afterCheck - Further checks of each consumer.
 */
export async function checkConsumers(options: {
  packageRoot: string
  adapterRoots: string[]
  fixtures?: string[]
  dependencies: Record<string, string>
  owners?: string[]
  afterCheck?: (app: string, owner: string | undefined) => Promise<void>
}) {
  const { packageRoot, adapterRoots, fixtures = [], dependencies, afterCheck } = options
  const args = process.argv.slice(2)
  const versions = args.filter(arg => !arg.startsWith("--"))
  if (!versions.length) versions.push(nuxtPkg.version)
  const tooling = await readPackage<ToolingPackage>(packageRoot)
  const adapters = await Promise.all(adapterRoots.map(readPackage<AdapterPackage>))
  const workspace = await mkdtemp(join(tmpdir(), `${basename(packageRoot)}-`))
  try {
    const archives: Record<string, string> = {}
    for (const [index, root] of adapterRoots.entries()) {
      archives[adapters[index]!.name] = `file:${await pack(root, workspace)}`
    }
    for (const version of versions) {
      for (const owner of options.owners ?? [undefined]) {
        const app = join(workspace, owner ? `nuxt-${version}-${owner}` : `nuxt-${version}`)
        console.log(`Checking ${basename(packageRoot)} in ${basename(app)}`)
        await createConsumer(app, {
          adapters,
          tooling,
          fixtures: [...fixtures, join(packageRoot, "tests/fixtures/nuxt")],
          nuxtVersion: version,
          dependencies: { ...archives, ...dependencies },
        })
        const env = { ...process.env, ...(owner && { RPC_TEST_OWNER: owner }) }
        await run(["bun", "run", "nuxt", "typecheck"], app, env)
        if (!args.includes("--dev")) {
          await run(["bun", "run", "nuxt", "build"], app, env)
          await checkBrowser(app, env, "production", packageRoot)
        }
        await checkBrowser(app, env, "development", packageRoot)
        await afterCheck?.(app, owner)
      }
    }
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
}

/** Check that the consumer's development server fails every page with the given setup error. */
export async function checkStartupError(app: string, env: NodeJS.ProcessEnv, message: string) {
  const { server, url } = await startServer(app, env, "development", "ignore")
  try {
    const response = await waitForResponse(server, url, () => true, {
      headers: { accept: "application/json" },
    })
    const body = await response.text()
    if (response.status !== 500 || !body.includes(message)) {
      throw new Error(
        `Expected startup error ${message}, received ${response.status}: ${body.slice(0, 500)}`,
      )
    }
  } finally {
    server.kill()
    await server.exited
  }
}

function readPackage<TPackage>(root: string): Promise<TPackage> {
  return Bun.file(join(root, "package.json")).json()
}

/** Run an isolated consumer's command without relying on the source workspace's dependencies. */
async function run(command: string[], cwd: string, env = process.env) {
  const process = Bun.spawn(command, { cwd, env, stdout: "inherit", stderr: "inherit" })
  if ((await process.exited) !== 0) throw new Error(`Command failed: ${command.join(" ")}`)
}

/**
 * Pack a workspace package into the directory as the archive npm would publish.
 * Consumers install the archive, not file:directory, which can bring along the package's dev deps.
 *
 * @returns The archive path, named after the package directory.
 */
async function pack(packageRoot: string, directory: string) {
  const archive = join(directory, `${basename(packageRoot)}.tgz`)
  await run(
    ["bun", "pm", "pack", "--ignore-scripts", "--quiet", "--filename", archive],
    packageRoot,
  )
  return archive
}

/**
 * Assemble a Nuxt app from fixture directories and install it outside the source workspace.
 * Adds the adapters' required peers and the tooling their fixtures use to the given dependencies.
 *
 * @param app - The consumer directory to create.
 * @param options.adapters - Packages whose required peers the consumer installs.
 * @param options.tooling - The package running the checks, which pins the fixtures' tooling.
 * @param options.fixtures - Directories copied in order, so later fixtures extend earlier ones.
 * @param options.dependencies - Archives and protocol packages the fixtures import.
 */
async function createConsumer(
  app: string,
  options: {
    adapters: AdapterPackage[]
    tooling: ToolingPackage
    fixtures: string[]
    nuxtVersion: string
    dependencies: Record<string, string>
  },
) {
  const { adapters, tooling, fixtures, nuxtVersion, dependencies } = options
  for (const fixture of fixtures) {
    await cp(fixture, app, {
      recursive: true,
      // Match inside the fixture only: the same names can appear in the directories above it.
      filter: path =>
        !relative(fixture, path)
          .split(/[\\/]/)
          .some(part => excludedFromConsumer.has(part)),
    })
  }
  // Leave optional peers to the consumer's chosen Nuxt version; an explicit kit range could install a different major.
  const requiredPeers = Object.fromEntries(
    adapters.flatMap(pkg =>
      Object.entries(pkg.peerDependencies).filter(
        ([name]) => !pkg.peerDependenciesMeta[name]?.optional,
      ),
    ),
  )
  await writeFile(
    join(app, "package.json"),
    JSON.stringify(
      {
        name: "rpc-vue-consumer",
        private: true,
        type: "module",
        dependencies: {
          ...requiredPeers,
          ...dependencies,
          nuxt: nuxtVersion,
          "@types/node": "^22.0.0",
          zod: tooling.devDependencies.zod,
          typescript: tooling.devDependencies.typescript,
          "vue-tsc": tooling.devDependencies["vue-tsc"],
        },
      },
      null,
      2,
    ),
  )
  if (nuxtVersion.startsWith("3.")) {
    await writeFile(
      join(app, "tsconfig.json"),
      JSON.stringify({ extends: "./.nuxt/tsconfig.json" }),
    )
  }
  await run(["bun", "install", "--ignore-scripts"], app)
}

/** Run the same browser assertions against Vite dev and the production server. */
async function checkBrowser(
  app: string,
  env: NodeJS.ProcessEnv,
  mode: "development" | "production",
  packageRoot: string,
) {
  console.log(`Checking ${mode} server`)
  const { server, url } = await startServer(app, env, mode, "inherit")
  try {
    await waitForResponse(server, url, response => response.ok)
    // The shared Playwright configuration reads the server address from RPC_TEST_URL.
    await run(["bun", "run", "playwright", "test"], packageRoot, { ...env, RPC_TEST_URL: url })
  } finally {
    server.kill()
    await server.exited
  }
}

/** Start the consumer's development or production server on an unused local port. */
async function startServer(
  app: string,
  env: NodeJS.ProcessEnv,
  mode: "development" | "production",
  output: "inherit" | "ignore",
) {
  const port = String(await unusedPort())
  const command =
    mode === "development"
      ? ["bun", "run", "nuxt", "dev", "--host", "127.0.0.1", "--port", port]
      : ["node", ".output/server/index.mjs"]
  const server = Bun.spawn(command, {
    cwd: app,
    env: { ...env, HOST: "127.0.0.1", PORT: port },
    stdout: output,
    stderr: output,
  })
  return { server, url: `http://127.0.0.1:${port}` }
}

/** Poll the server until it returns an accepted response, failing if it exits or times out. */
async function waitForResponse(
  server: Bun.Subprocess,
  url: string,
  accept: (response: Response) => boolean,
  init?: RequestInit,
) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("Nuxt server exited before responding")
    const response = await fetch(url, init).catch(() => undefined)
    if (response && accept(response)) return response
    await Bun.sleep(100)
  }
  throw new Error("Nuxt server did not respond in time")
}

/** Ask the OS for an available port so local apps do not need to be stopped for the test. */
async function unusedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("No TCP port assigned")
  await new Promise<void>((resolve, reject) =>
    server.close(error => (error ? reject(error) : resolve())),
  )
  return address.port
}
