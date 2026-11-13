import { Money } from "~~/shared/money"

/** Transfer Money values in query results through the SSR payload. */
export default definePayloadPlugin(() => {
  definePayloadReducer("Money", value => value instanceof Money && value.amount)
  definePayloadReviver("Money", (amount: string) => new Money(amount))
})
