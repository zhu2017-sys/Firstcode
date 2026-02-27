<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <div class="container mx-auto px-4 py-8">
    <header class="mb-8 text-center">
      <h1 class="text-3xl font-bold text-gray-800">汽车销售朋友圈分析助手</h1>
      <p class="text-gray-600 mt-2">上传朋友圈截图，获取个性化销售策略</p>
    </header>
    <main>
      <RouterView />
    </main>
  </div>
</template>