<script setup lang="ts">
const query = await useOrpc().blog.posts.update.useQuery(
  { id: -1, title: "Missing post" },
  { catching: { NOT_FOUND: null } },
)
</script>

<template>
  <main>
    <p id="declared-data">{{ query.data.value === null ? "missing" : "found" }}</p>
    <p id="declared-status">{{ query.status.value }}</p>
    <p id="declared-error">{{ query.error.value?.message }}</p>
  </main>
</template>
