<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query"

const rpc = useRpc()
const defaults = useQueryClient().getDefaultOptions().queries
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
const postId = ref(1)
const enabled = ref(false)
const post = rpc.blog.posts.get.useQuery(() => ({ id: postId.value }), { enabled })
const failure = rpc.blog.posts.fail.useQuery(undefined, { enabled: false })
const { data: manualUser } = useManualRpc().blog.users.get.useQuery()
// Both observers share one cache entry; editing the clone must leave the selected name intact.
const query = await rpc.hello.useQuery(undefined, { clone: true })
const selected = rpc.hello.useQuery(undefined, { select: (data) => data.name })
// Awaiting an inactive query must not block SSR or component setup.
const clientOnly = await rpc.hello.useQuery(undefined, {
  server: false,
  enabled: false,
})
// Only the browser fetches this query, so it reports the browser transport.
const browserTransport = rpc.transport.useQuery(undefined, { server: false })

/** Publish a new response to both the editable and selected observers. */
function shareData() {
  if (query.data.value) {
    query.data.value = { ...query.data.value, name: "shared" }
  }
}
</script>

<template>
  <main>
    <p id="viewer">{{ query.data.value?.name }}</p>
    <p id="selected">{{ selected.data.value }}</p>
    <p id="manual-user">{{ manualUser?.name }}</p>
    <p id="date">{{ query.data.value?.date.toISOString() }}</p>
    <p id="cookie">{{ query.data.value?.cookie }}</p>
    <p id="authorization">{{ query.data.value?.authorization }}</p>
    <p id="transport">{{ query.data.value?.transport }}</p>
    <p id="browser-transport">{{ browserTransport.data.value }}</p>
    <p id="disabled">{{ clientOnly.fetchStatus.value }}</p>
    <p id="hydrated">{{ hydrated }}</p>
    <p id="defaults">{{ defaults?.staleTime }} / {{ defaults?.retry }}</p>
    <p id="post">{{ post.data.value?.details.title }}</p>
    <p id="error">{{ failure.error.value?.message }}</p>
    <button id="edit" @click="query.data.value!.name = 'local'">Edit clone</button>
    <button id="share" @click="shareData">Update shared cache</button>
    <button id="enable" @click="enabled = !enabled">Toggle query</button>
    <button id="next" @click="postId++">Next post</button>
    <button id="invalidate" @click="rpc.blog.posts.invalidate()">Refresh posts</button>
    <button id="fail" @click="failure.refetch()">Fail query</button>
    <NuxtLink id="awaited-error" to="/awaited-error">Open failed query</NuxtLink>
  </main>
</template>
