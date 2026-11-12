<script setup lang="ts">
const trpc = useTrpc()
const orpc = useOrpc()
const sameCache = useTrpcQueryClient() === useOrpcQueryClient()
const t = trpc.blog.posts.get.useQuery({ id: 1 })
const o = orpc.blog.posts.get.useQuery({ id: 1 })
// These entries exist in the payload without browser observers that could repair their options.
if (import.meta.server) {
  trpc.blog.posts.get.useQuery({ id: 2 })
  orpc.blog.posts.get.useQuery({ id: 2 })
}
const cache = useTrpcQueryClient()
const restoredInvalidated = ref(false)
async function invalidateRestored() {
  const keys = [
    trpc.blog.posts.get.queryKey({ id: 2 }),
    orpc.blog.posts.get.queryKey({ input: { id: 2 } }),
  ]
  await Promise.all(
    keys.map(queryKey => cache.invalidateQueries({ queryKey, exact: true, refetchType: "none" })),
  )
  restoredInvalidated.value = keys.every(key => cache.getQueryState(key)?.isInvalidated)
}
const ready = ref(false)
onMounted(() => {
  ready.value = true
})
</script>
<template>
  <main>
    <p id="ready">{{ ready }}</p>
    <p id="restored-invalidated">{{ restoredInvalidated }}</p>
    <button id="invalidate-restored" @click="invalidateRestored">
      Invalidate unobserved payload entries
    </button>
    <p id="same-cache">{{ sameCache }}</p>
    <p id="trpc">{{ t.data.value?.title }} {{ t.data.value?.cookie }}</p>
    <p id="orpc">{{ o.data.value?.title }} {{ o.data.value?.cookie }}</p>
    <button id="trpc-write" @click="t.data.value = { ...t.data.value!, title: 'edited' }">
      Write tRPC
    </button>
    <button id="trpc-invalidate" @click="trpc.invalidate()">Invalidate tRPC</button>
    <button id="orpc-invalidate" @click="orpc.invalidate()">Invalidate oRPC</button>
  </main>
</template>
