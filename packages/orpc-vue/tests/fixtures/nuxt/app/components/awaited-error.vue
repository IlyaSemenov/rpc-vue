<script setup lang="ts">
import { getCurrentInstance } from "vue"

const instance = getCurrentInstance()
const message = ref("")
const restored = ref(false)

try {
  await useOrpc().blog.posts.fail.useQuery()
} catch (error) {
  message.value = error instanceof Error ? error.message : String(error)
  restored.value = getCurrentInstance() === instance
}
</script>

<template>
  <p id="awaited-error">{{ message }}</p>
  <p id="instance-restored">{{ restored }}</p>
</template>
