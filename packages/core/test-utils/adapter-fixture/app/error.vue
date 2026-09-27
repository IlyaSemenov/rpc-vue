<script setup lang="ts">
defineProps<{ error: { statusCode?: number } }>()
</script>

<template>
  <p id="error-status">{{ error.statusCode }}</p>
</template>
