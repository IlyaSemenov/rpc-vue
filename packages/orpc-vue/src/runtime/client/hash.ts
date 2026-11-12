import { RPCJsonSerializer } from "@orpc/client"
import { hashKey, type QueryKey } from "@tanstack/vue-query"

const serializer = new RPCJsonSerializer()

/** Preserve oRPC typed key values while normalizing object and serializer metadata order. */
export function hashORPCKey(queryKey: QueryKey): string {
  const { json, meta } = serializer.serialize(queryKey)
  return hashKey([json, meta?.map(entry => JSON.stringify(entry)).sort()])
}
