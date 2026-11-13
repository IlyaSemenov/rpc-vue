import { cloneDeepWith } from "es-toolkit"

/**
 * Deep-copy a query input so that later changes to the caller's value never alter a query key or
 * the input of a query function already built from it.
 * Values marked with Vue's `markRaw()` are kept by reference, together with everything inside
 * them, so that class instances with private fields or other state outside their own properties
 * stay usable.
 *
 * @param input - A resolved query input; reading it through a reactive proxy tracks every copied
 *   property.
 * @returns A copy that shares only the `markRaw()` values with the input.
 */
export function cloneQueryInput<TInput>(input: TInput): TInput {
  return cloneDeepWith(input, value => (isMarkedRaw(value) ? value : undefined))
}

/** Check whether `markRaw()` excluded an object from Vue reactivity. */
function isMarkedRaw(value: unknown): boolean {
  // Vue exposes no predicate for markRaw(); it sets this internal flag on the object.
  return typeof value === "object" && value !== null && "__v_skip" in value && !!value.__v_skip
}
