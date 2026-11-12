/**
 * An error from an RPC call whose `fetch` rejected without a response available to the client,
 * such as when the browser is offline, the server is unreachable or CORS blocks the response.
 * The original `fetch` rejection is available as `cause`.
 */
export class ORPCNetworkError extends Error {
  constructor(options?: ErrorOptions) {
    super("Network request failed", options)
    this.name = "ORPCNetworkError"
  }
}

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/**
 * Wrap `fetch` so that its rejection becomes an `ORPCNetworkError`.
 * Rejections of a request with an aborted signal, including a timeout signal, stay unchanged,
 * so cancellations and timeouts remain recognizable.
 */
export function rejectWithNetworkErrors(fetch: Fetch): Fetch {
  return async (input, init) => {
    try {
      return await fetch(input, init)
    } catch (error) {
      if (init?.signal?.aborted) throw error
      throw new ORPCNetworkError({ cause: error })
    }
  }
}
