import { RECURSIVE_CLIENT_UNWRAP_KEYS } from "@orpc/client"

// The decorator forwards functions without calling them; their public signatures live in types.ts.
type Methods = Record<string, (...args: never[]) => unknown>

/**
 * Lazily extend an oRPC utility tree with a factory's methods at each visited node.
 * HTTP clients synthesize paths, so traversal cannot depend on enumerating a router.
 * Property results are cached to keep node and method identities stable.
 * When a method name also identifies a router path, calls invoke the method and
 * property access continues through the corresponding child node.
 *
 * @param target - An upstream utility object or callable utility at the current path.
 * @param createMethods - Called once per decorated node; must bind methods without invoking them.
 * @param path - Procedure path segments accumulated while traversing the utility tree.
 * @returns A proxy preserving upstream utility calls and exposing the additional methods.
 */
export function decorateClient(
  target: object,
  createMethods: (target: object, path: readonly string[]) => Methods,
  path: readonly string[] = [],
): object {
  const methods = createMethods(target, path)
  const children = new Map<string, unknown>()

  // Upstream utility functions must remain callable; other nodes use the methods object.
  return new Proxy(typeof target === "function" ? target : methods, {
    get(_target, property, receiver) {
      // Keep promise detection, symbols and function helpers out of recursive path resolution.
      // A utility node's call is an RPC operation; a function's call remains Function.prototype.call.
      if (
        typeof property !== "string" ||
        (RECURSIVE_CLIENT_UNWRAP_KEYS.has(property) &&
          !(property === "call" && typeof target !== "function"))
      ) {
        return Reflect.get(target, property, receiver)
      }
      if (children.has(property)) return children.get(property)

      const value = Reflect.get(target, property, receiver)
      const method = Object.hasOwn(methods, property) ? methods[property] : undefined
      let result: unknown = method ?? value
      if (isObject(value)) {
        const child = decorateClient(value, createMethods, [...path, property])
        // A method can also be a router path, e.g. client.useQuery.nested.
        result = method
          ? new Proxy(method, { get: (_method, key) => Reflect.get(child, key) })
          : child
      }

      children.set(property, result)
      return result
    },
  })
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function"
}
