<script setup lang="ts">
const orpc = useOrpc()
const { data: posts } = await orpc.blog.posts.list.useQuery(undefined, { default: () => [] })
const update = orpc.blog.posts.update.useMutation({
  onSuccess: () => orpc.blog.posts.invalidate(),
})

async function updateFirstPost() {
  const post = posts.value[0]
  if (!post) return
  await update.mutateAsync({ id: post.id, title: "Updated post" })
}
</script>

<template>
  <ul>
    <li v-for="post in posts" :key="post.id">{{ post.title }}</li>
  </ul>
  <button type="button" @click="updateFirstPost">Update first post</button>
</template>
