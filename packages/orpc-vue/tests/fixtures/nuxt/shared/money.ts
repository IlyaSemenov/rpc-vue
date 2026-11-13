import { RPCSerializer } from "@orpc/client"

/** An application type that RPC transport, cache keys and the SSR payload must preserve. */
export class Money {
  constructor(readonly amount: string) {}
}

/** The RPC serializer shared by the server handler and the client plugin. */
export const serializer = new RPCSerializer({
  handlers: {
    money: {
      condition: value => value instanceof Money,
      serialize: (value: Money) => value.amount,
      deserialize: serialized => {
        if (typeof serialized !== "string") throw new TypeError("Money expects a string")
        return new Money(serialized)
      },
      isTerminal: true,
    },
  },
})
