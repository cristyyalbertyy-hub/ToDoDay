import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'app-icon.svg'],
      manifest: {
        name: 'ToDoDay',
        short_name: 'ToDoDay',
        description: 'Agenda diaria com tarefas que passam para o dia seguinte.',
        theme_color: '#0f1220',
        background_color: '#0f1220',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/app-icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
})
