import { RPCHandler } from "@orpc/server/fetch"
import { defineEventHandler, getHeader, getQuery, toWebRequest } from "h3"

import { router } from "~~/server/orpc/router"
import { serializer } from "~~/shared/money"

// Share the transport handler, but supply viewer context separately for each request.
const handler = new RPCHandler(router, { serializer })

export default defineEventHandler(async event => {
  const { response } = await handler.handle(toWebRequest(event), {
    prefix: "/orpc",
    context: {
      name: getHeader(event, "x-viewer") ?? "visitor",
      cookie: getHeader(event, "cookie") ?? "",
      authorization: getHeader(event, "authorization") ?? "",
      transport: String(getQuery(event).transport ?? ""),
    },
  })
  return response
})
