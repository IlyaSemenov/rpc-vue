import { type DataTag, skipToken, type QueryKey } from "@tanstack/vue-query"
import { cloneDeep } from "es-toolkit"
import { isRef } from "vue"

/** A tRPC key tagged with its cached data and error types for imperative cache operations. */
export type TRPCQueryKey<TOutput = unknown, TError = unknown> = DataTag<QueryKey, TOutput, TError>

/** Build the supported tRPC 11.19 key shapes, including partial paths and cursor-free infinite keys. */
export function createQueryKey(
  path: string[],
  input: unknown,
  type: "any" | "query" | "infinite",
  prefix?: string,
): QueryKey {
  // Pure builders take values; reject accidental composable-style inputs before transport sees them.
  if (isRef(input) || typeof input === "function") {
    throw new TypeError(
      "tRPC key and options builders require resolved input. Use a value inside computed(), or pass reactive input to useQuery().",
    )
  }
  const parts = path.flatMap((part) => part.split("."))
  const namespace = prefix ? [[prefix]] : []
  if (!input && type === "any") return [...namespace, ...(parts.length ? [parts] : [])]
  if (
    type === "infinite" &&
    input &&
    typeof input === "object" &&
    ("cursor" in input || "direction" in input)
  ) {
    const { cursor: _cursor, direction: _direction, ...rest } = input as Record<string, unknown>
    input = rest
  }
  return [
    ...namespace,
    parts,
    {
      ...(input !== undefined && input !== skipToken ? { input: cloneDeep(input) } : {}),
      ...(type === "any" ? {} : { type }),
    },
  ]
}

/** Mutation keys have a path and optional namespace, without query arguments. */
export function createMutationKey(path: string[], prefix?: string): QueryKey {
  return [...(prefix ? [[prefix]] : []), path.flatMap((part) => part.split("."))]
}
