<script setup lang="ts">
const count = useState<number>("unexpected-error-count")
const query = await useOrpc().blog.posts.fail.useQuery(undefined, { rejectOnError: false })
</script>

<template>
  <!-- Failed SSR queries are not hydrated; the browser reports its retry before mounting. -->
  <p id="unexpected-count" data-allow-mismatch="text">{{ count }}</p>
  <button id="unexpected-refetch" @click="query.refetch()">Refetch</button>
</template>
