---
"orpc-vue": minor
---

The Nuxt plugin's HTTP transport rejects a call whose `fetch` fails without a response, unless its signal is aborted, with the new exported `ORPCNetworkError`.
