<script setup lang="ts">
import { Money } from "~~/shared/money"

const orpc = useOrpc()
const hydrated = ref(false)
onMounted(() => {
  hydrated.value = true
})
// Start both queries before awaiting, so each registers its lifecycle hooks during setup.
const [money, text] = await Promise.all([
  orpc.prices.describe.useQuery({ price: new Money("1.5") }),
  orpc.prices.describe.useQuery({ price: "1.5" }),
])
</script>

<template>
  <main>
    <p id="hydrated">{{ hydrated }}</p>
    <p id="money-input">{{ money.data.value?.input }}</p>
    <p id="string-input">{{ text.data.value?.input }}</p>
    <p id="money-output">
      {{ money.data.value?.price instanceof Money ? "Money" : "plain" }}
      {{ money.data.value?.price.amount }}
    </p>
  </main>
</template>
