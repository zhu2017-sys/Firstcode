import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './assets/main.css'

// Import views
import UploadView from './views/UploadView.vue'

const routes = [
  {
    path: '/',
    name: 'upload',
    component: UploadView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

const app = createApp(App)

app.use(router)
app.mount('#app')
