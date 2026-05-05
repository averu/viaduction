// BD-ARCH — Vite plugin 順序の決定事項に従う
// 1. @cloudflare/vite-plugin   (Workers ランタイム互換変換は最初)
// 2. @tanstack/react-start/plugin/vite (TanStack Start のコード生成)
// 3. @vitejs/plugin-react      (React の JSX / Fast Refresh)
// 4. vite-tsconfig-paths       (paths 解決)
// tailwindcss と devtools は補助 plugin として末尾に置く
import { defineConfig } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tanstackStart(),
    viteReact(),
    tsconfigPaths(),
    tailwindcss(),
    // injectSource を切らないと SSR と client の data-tsd-source 行番号が
    // ファイル編集のたびに食い違って hydration mismatch を起こす（dev 限定）。
    devtools({ injectSource: { enabled: false } }),
  ],
})
