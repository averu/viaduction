// BD-ARCH — vitest 専用設定。Cloudflare plugin は dev/build 用なので vitest からは外す
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
