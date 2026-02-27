<template>
  <div class="upload-container max-w-4xl mx-auto">
    <!-- 上传区域 -->
    <div 
      v-if="!analysisResult"
      class="upload-area border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer transition-colors hover:border-blue-500 hover:bg-blue-50/50"
      @click="triggerFileSelect"
      @dragover.prevent="handleDragOver"
      @drop.prevent="handleDrop"
    >
      <input 
        type="file" 
        ref="fileInputRef" 
        multiple 
        accept="image/*" 
        @change="handleFileSelect" 
        class="hidden" 
      />
      
      <div class="flex flex-col items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <h3 class="text-lg font-medium text-gray-700 mb-2">点击上传或拖拽图片到此处</h3>
        <p class="text-sm text-gray-500 mb-4">支持 JPG、PNG 格式，最多20张，每张不超过10MB</p>
        <p class="text-sm text-blue-600 font-medium">请选择至少5张图片</p>
      </div>
    </div>

    <!-- 已选文件列表 -->
    <div v-if="selectedFiles.length > 0 && !analysisResult" class="mt-8">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-medium text-gray-800">已选择 {{ selectedFiles.length }} 张图片</h3>
        <span class="text-sm text-gray-500">{{ formatFileSize(totalSize) }}</span>
      </div>
      
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div 
          v-for="(file, index) in selectedFiles" 
          :key="index" 
          class="relative group"
        >
          <img 
            :src="file.previewUrl" 
            :alt="file.name"
            class="w-full h-32 object-cover rounded-lg border border-gray-200"
          />
          <div class="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <button 
              @click="removeFile(index)"
              class="text-white hover:text-red-400 text-lg"
            >
              <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p class="text-xs text-gray-500 truncate mt-1">{{ file.name }}</p>
        </div>
      </div>
    </div>

    <!-- 分析按钮 -->
    <div v-if="!analysisResult" class="mt-8 flex justify-center">
      <button 
        @click="startAnalysis"
        :disabled="!canAnalyze || isAnalyzing"
        :class="[
          'px-6 py-3 rounded-lg font-medium text-white shadow-md transition-all',
          (!canAnalyze || isAnalyzing) 
            ? 'bg-gray-400 cursor-not-allowed' 
            : 'bg-blue-600 hover:bg-blue-700 hover:shadow-lg transform hover:-translate-y-0.5'
        ]"
      >
        <span v-if="!isAnalyzing">开始分析</span>
        <span v-else class="flex items-center">
          <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          分析中...
        </span>
      </button>
    </div>

    <!-- 进度条 -->
    <div v-if="isAnalyzing" class="mt-6">
      <div class="w-full bg-gray-200 rounded-full h-2.5">
        <div 
          class="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
          :style="{ width: progress + '%' }"
        ></div>
      </div>
      <p class="text-center text-sm text-gray-600 mt-2">{{ progressText }}</p>
    </div>

    <!-- 分析结果展示 -->
    <div v-if="analysisResult" class="mt-8">
      <div class="flex justify-between items-center mb-6">
        <h2 class="text-2xl font-bold text-gray-800">分析结果</h2>
        <button 
          @click="resetAnalysis"
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-gray-700 transition-colors"
        >
          重新分析
        </button>
      </div>

      <!-- 人物画像卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-blue-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          人物画像
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p class="text-gray-600"><span class="font-medium">简要画像:</span> {{ analysisResult.persona?.summary || '暂无数据' }}</p>
            <p class="text-gray-600"><span class="font-medium">性格特征:</span> {{ analysisResult.persona?.traits?.join(', ') || '暂无数据' }}</p>
          </div>
          <div>
            <p class="text-gray-600"><span class="font-medium">沟通偏好:</span> {{ analysisResult.persona?.communication_tone || '暂无数据' }}</p>
          </div>
        </div>
      </div>

      <!-- 兴趣与生活线索卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-green-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          兴趣与生活线索
        </h3>
        <p>{{ analysisResult.interests?.join(', ') || '暂无数据' }}</p>
      </div>

      <!-- 预算与消费信号卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-purple-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          预算与消费信号
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p class="text-gray-600"><span class="font-medium">关注度:</span> {{ analysisResult.budget_signals?.sensitivity || '暂无数据' }}</p>
          </div>
          <div>
            <p class="text-gray-600"><span class="font-medium">预算区间:</span> {{ analysisResult.budget_signals?.range_hint || '暂无数据' }}</p>
          </div>
          <div>
            <p class="text-gray-600"><span class="font-medium">品牌态度:</span> {{ analysisResult.budget_signals?.brand_attitude || '暂无数据' }}</p>
          </div>
        </div>
      </div>

      <!-- 购车阶段判断卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-yellow-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          购车阶段判断
        </h3>
        <p>{{ analysisResult.stage_judgement || '暂无数据' }}</p>
      </div>

      <!-- 雷区与禁忌卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-red-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          雷区与禁忌
        </h3>
        <ul class="list-disc pl-5 space-y-1">
          <li v-for="(taboo, index) in analysisResult.risks_and_taboo" :key="index">{{ taboo }}</li>
          <li v-if="!analysisResult.risks_and_taboo || analysisResult.risks_and_taboo.length === 0">暂无数据</li>
        </ul>
      </div>

      <!-- 推荐车型与卖点组合卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-indigo-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          推荐车型与卖点组合
        </h3>
        <div v-if="analysisResult.recommended_models && analysisResult.recommended_models.length > 0">
          <div v-for="(model, index) in analysisResult.recommended_models" :key="index" class="mb-4 last:mb-0">
            <h4 class="font-medium text-gray-800">{{ model.model_name }}</h4>
            <p class="text-gray-600 text-sm">{{ model.why }}</p>
            <div class="mt-2">
              <span class="inline-block bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded mr-2 mb-1" 
                    v-for="(point, idx) in model.key_selling_points" 
                    :key="idx">
                {{ point }}
              </span>
            </div>
          </div>
        </div>
        <p v-else>暂无数据</p>
      </div>

      <!-- 开场白与跟进节奏卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-teal-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
          开场白与跟进节奏
        </h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p class="text-gray-600"><span class="font-medium">开场白模板:</span> {{ analysisResult.talk_track?.opening_line || '暂无数据' }}</p>
          </div>
          <div>
            <p class="text-gray-600"><span class="font-medium">跟进节奏:</span> {{ analysisResult.talk_track?.follow_up_rhythm || '暂无数据' }}</p>
          </div>
        </div>
        <p class="text-gray-600 mt-2"><span class="font-medium">价值陈述:</span> {{ analysisResult.talk_track?.value_narrative || '暂无数据' }}</p>
      </div>

      <!-- 下一步行动清单卡片 -->
      <div class="bg-white rounded-xl shadow-md p-6 mb-6 border border-gray-200">
        <h3 class="text-lg font-semibold text-orange-700 mb-4 flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          下一步行动清单
        </h3>
        <ul class="list-disc pl-5 space-y-1">
          <li v-for="(action, index) in analysisResult.next_actions" :key="index">{{ action }}</li>
          <li v-if="!analysisResult.next_actions || analysisResult.next_actions.length === 0">暂无数据</li>
        </ul>
      </div>

      <!-- 操作按钮 -->
      <div class="flex flex-wrap gap-3 mt-8">
        <button 
          @click="copyAllResults"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          复制全部结果
        </button>
        
        <button 
          @click="copySection('persona')"
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
        >
          复制人物画像
        </button>
        
        <button 
          @click="copySection('interests')"
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
        >
          复制兴趣线索
        </button>
        
        <button 
          @click="copySection('talk_track')"
          class="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
        >
          复制沟通策略
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { track } from '../utils/analytics'

interface FileInfo {
  file: File
  name: string
  size: number
  previewUrl: string
}

interface AnalysisResult {
  persona?: {
    summary: string
    traits: string[]
    communication_tone: string
  }
  interests?: string[]
  budget_signals?: {
    sensitivity: string
    range_hint: string
    brand_attitude: string
  }
  stage_judgement?: string
  risks_and_taboo?: string[]
  recommended_models?: Array<{
    model_name: string
    key_selling_points: string[]
    why: string
  }>
  talk_track?: {
    opening_line: string
    value_narrative: string
    follow_up_rhythm: string
  }
  next_actions?: string[]
}

const fileInputRef = ref<HTMLInputElement>()
const selectedFiles = ref<FileInfo[]>([])
const isAnalyzing = ref(false)
const progress = ref(0)
const progressText = ref('准备中...')
const analysisResult = ref<AnalysisResult | null>(null)

// 计算属性：总文件大小
const totalSize = computed(() => {
  return selectedFiles.value.reduce((sum, file) => sum + file.size, 0)
})

// 计算属性：是否可以开始分析
const canAnalyze = computed(() => {
  return selectedFiles.value.length >= 5 && selectedFiles.value.length <= 20
})

// 触发文件选择
const triggerFileSelect = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 处理文件选择
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    track({ type: 'upload_start', files_count: target.files.length, total_size_mb: Array.from(target.files).reduce((s, f) => s + f.size, 0) / (1024*1024) })
    addFiles(Array.from(target.files))
  }
}

// 添加文件
const addFiles = (files: File[]) => {
  // 过滤掉非图片文件
  const imageFiles = files.filter(file => file.type.startsWith('image/'))
  
  // 限制总数不超过20张
  const remainingSlots = 20 - selectedFiles.value.length
  const filesToAdd = imageFiles.slice(0, remainingSlots)
  
  filesToAdd.forEach(file => {
    // 创建预览URL
    const previewUrl = URL.createObjectURL(file)
    
    selectedFiles.value.push({
      file,
      name: file.name,
      size: file.size,
      previewUrl
    })
  })
  
  // 如果超过20张，给出提示
  if (imageFiles.length > remainingSlots) {
    alert(`最多只能选择20张图片，多余的图片已被忽略`)
  }
  // 视为选择成功
  track({ type: 'upload_success', files_count: filesToAdd.length, total_size_mb: filesToAdd.reduce((s, f) => s + f.size, 0) / (1024*1024) })
}

// 处理拖拽悬停
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
}

// 处理拖拽放置
const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    addFiles(Array.from(event.dataTransfer.files))
  }
}

// 移除文件
const removeFile = (index: number) => {
  // 释放预览URL
  URL.revokeObjectURL(selectedFiles.value[index].previewUrl)
  selectedFiles.value.splice(index, 1)
}

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// 开始分析
const startAnalysis = async () => {
  if (!canAnalyze.value) return
  
  isAnalyzing.value = true
  progress.value = 0
  progressText.value = '正在上传图片...'
  track({ type: 'analyze_start', files_count: selectedFiles.value.length })
  
  try {
    // 更新进度
    progress.value = 10
    progressText.value = '正在上传图片到服务器...'
    
    // 创建 FormData 对象
    const formData = new FormData()
    selectedFiles.value.forEach(fileObj => {
      formData.append('files', fileObj.file, fileObj.name)
    })
    
    // 发送请求到后端
    progress.value = 30
    progressText.value = '正在发送到AI分析引擎...'
    
    const response = await fetch('/api/analyze', {
      method: 'POST',
      body: formData
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || `HTTP错误: ${response.status}`)
    }
    
    progress.value = 60
    progressText.value = 'AI正在分析中...'
    
    const result = await response.json()
    
    // 模拟处理时间
    await new Promise(resolve => setTimeout(resolve, 1000))
    progress.value = 90
    progressText.value = '正在生成报告...'
    
    analysisResult.value = result.result
    track({ type: 'analyze_success', latency_ms: result.latency_ms || 0, status_code: 200 })
    
    // 模拟最后的处理
    await new Promise(resolve => setTimeout(resolve, 500))
    progress.value = 100
    progressText.value = '分析完成！'
  } catch (error) {
    console.error('分析过程中发生错误:', error)
    const errorMessage = (error as Error).message || '分析请求失败'
    track({ type: 'analyze_fail', status_code: 500, model_error: errorMessage })
    
    // 根据错误类型显示不同提示
    if (errorMessage.includes('INSUFFICIENT_IMAGES')) {
      alert('错误：至少需要上传5张图片才能进行分析')
    } else if (errorMessage.includes('TOO_MANY_IMAGES')) {
      alert('错误：最多只能上传20张图片')
    } else if (errorMessage.includes('FILE_TOO_LARGE')) {
      alert('错误：文件大小超出限制（最大10MB）')
    } else if (errorMessage.includes('AUTHENTICATION_ERROR')) {
      alert('错误：API密钥配置有误，请联系管理员')
    } else if (errorMessage.includes('TIMEOUT_ERROR')) {
      alert('错误：请求超时，请稍后重试')
    } else {
      alert(`分析失败: ${errorMessage}`)
    }
  } finally {
    isAnalyzing.value = false
  }
}

// 重置分析
const resetAnalysis = () => {
  analysisResult.value = null
  // 清除所有文件
  selectedFiles.value.forEach(file => {
    URL.revokeObjectURL(file.previewUrl)
  })
  selectedFiles.value = []
}

// 复制全部结果
const copyAllResults = async () => {
  if (!analysisResult.value) return
  
  let textToCopy = '汽车销售分析结果:\n\n'
  track({ type: 'copy_click', copy_type: 'all' })
  
  if (analysisResult.value.persona) {
    textToCopy += `人物画像:\n`
    textToCopy += `- 简要画像: ${analysisResult.value.persona.summary}\n`
    textToCopy += `- 性格特征: ${analysisResult.value.persona.traits.join(', ')}\n`
    textToCopy += `- 沟通偏好: ${analysisResult.value.persona.communication_tone}\n\n`
  }
  
  if (analysisResult.value.interests) {
    textToCopy += `兴趣与生活线索: ${analysisResult.value.interests.join(', ')}\n\n`
  }
  
  if (analysisResult.value.budget_signals) {
    textToCopy += `预算与消费信号:\n`
    textToCopy += `- 关注度: ${analysisResult.value.budget_signals.sensitivity}\n`
    textToCopy += `- 预算区间: ${analysisResult.value.budget_signals.range_hint}\n`
    textToCopy += `- 品牌态度: ${analysisResult.value.budget_signals.brand_attitude}\n\n`
  }
  
  if (analysisResult.value.stage_judgement) {
    textToCopy += `购车阶段判断: ${analysisResult.value.stage_judgement}\n\n`
  }
  
  if (analysisResult.value.risks_and_taboo) {
    textToCopy += `雷区与禁忌:\n`
    analysisResult.value.risks_and_taboo.forEach(taboo => {
      textToCopy += `- ${taboo}\n`
    })
    textToCopy += '\n'
  }
  
  if (analysisResult.value.recommended_models) {
    textToCopy += `推荐车型与卖点组合:\n`
    analysisResult.value.recommended_models.forEach(model => {
      textToCopy += `- ${model.model_name}: ${model.key_selling_points.join(', ')} (${model.why})\n`
    })
    textToCopy += '\n'
  }
  
  if (analysisResult.value.talk_track) {
    textToCopy += `开场白与跟进节奏:\n`
    textToCopy += `- 开场白模板: ${analysisResult.value.talk_track.opening_line}\n`
    textToCopy += `- 价值陈述: ${analysisResult.value.talk_track.value_narrative}\n`
    textToCopy += `- 跟进节奏: ${analysisResult.value.talk_track.follow_up_rhythm}\n\n`
  }
  
  if (analysisResult.value.next_actions) {
    textToCopy += `下一步行动清单:\n`
    analysisResult.value.next_actions.forEach(action => {
      textToCopy += `- ${action}\n`
    })
  }
  
  try {
    await navigator.clipboard.writeText(textToCopy)
    alert('全部结果已复制到剪贴板！')
  } catch (err) {
    console.error('复制失败:', err)
    alert('复制失败，请手动选择文本进行复制')
  }
}

// 复制特定部分
const copySection = async (section: keyof AnalysisResult) => {
  if (!analysisResult.value) return
  
  let textToCopy = ''
  let sectionName = ''
  
  switch(section) {
    case 'persona':
      sectionName = '人物画像'
      if (analysisResult.value.persona) {
        textToCopy = `${sectionName}:\n`
        textToCopy += `- 简要画像: ${analysisResult.value.persona.summary}\n`
        textToCopy += `- 性格特征: ${analysisResult.value.persona.traits.join(', ')}\n`
        textToCopy += `- 沟通偏好: ${analysisResult.value.persona.communication_tone}`
      }
      break
    case 'interests':
      sectionName = '兴趣线索'
      if (analysisResult.value.interests) {
        textToCopy = `${sectionName}: ${analysisResult.value.interests.join(', ')}`
      }
      break
    case 'talk_track':
      sectionName = '沟通策略'
      if (analysisResult.value.talk_track) {
        textToCopy = `${sectionName}:\n`
        textToCopy += `- 开场白模板: ${analysisResult.value.talk_track.opening_line}\n`
        textToCopy += `- 价值陈述: ${analysisResult.value.talk_track.value_narrative}\n`
        textToCopy += `- 跟进节奏: ${analysisResult.value.talk_track.follow_up_rhythm}`
      }
      break
    default:
      textToCopy = JSON.stringify(analysisResult.value[section], null, 2) || '暂无数据'
  }
  
  if (!textToCopy) {
    textToCopy = '暂无数据'
  }
  
  try {
    await navigator.clipboard.writeText(textToCopy)
    alert(`${sectionName}内容已复制到剪贴板！`)
    track({ type: 'copy_click', copy_type: section })
  } catch (err) {
    console.error('复制失败:', err)
    alert('复制失败，请手动选择文本进行复制')
  }
}

onMounted(() => {
  track({ type: 'page_view', page: 'home', route: '/upload' })
})
</script>
