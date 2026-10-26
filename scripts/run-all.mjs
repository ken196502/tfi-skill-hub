/**
 * 单体镜像启动器：在同一容器内拉起两个进程并统一转发信号。
 *
 *   - api ：后端纯 API（scripts/serve-api.mjs，默认 8787）
 *   - web ：Next.js standalone（server.js，默认 3000，对外唯一暴露的端口）
 *
 * 前端 Next 在构建期注入了 API_PROXY_TARGET=http://127.0.0.1:8787，
 * 会把同源前缀 /skillhubservice/* 在服务端反代到本容器的 api 进程，
 * 因此浏览器只与 web(:3000) 通信，Traefik 只需一条 Host 规则。
 *
 * 任一子进程退出或收到 SIGTERM/SIGINT 时，向另一个也发 SIGTERM，
 * 保证容器停止时两个进程都能优雅退出。
 */

import { spawn } from 'node:child_process'

const children = []
let stopping = false

function launch(name, cmd, args, cwd, extraEnv) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
  })
  child.on('error', (err) => {
    console.error(`[run-all] 无法启动 ${name}:`, err)
    process.exit(1)
  })
  child.on('exit', (code, signal) => {
    console.log(`[run-all] ${name} 退出 (code=${code}, signal=${signal})`)
    stopAll()
  })
  children.push(child)
  console.log(`[run-all] 已启动 ${name} (pid=${child.pid}) cwd=${cwd}`)
  return child
}

function stopAll() {
  if (stopping) return
  stopping = true
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
  }
}

process.on('SIGTERM', () => {
  console.log('[run-all] 收到 SIGTERM')
  stopAll()
})
process.on('SIGINT', () => {
  console.log('[run-all] 收到 SIGINT')
  stopAll()
})

// 后端 API：serve-api.mjs 用 tsx 在运行时转译 src/server 下的 .ts
launch('api', 'node', ['--import', 'tsx', '/app/backend/scripts/serve-api.mjs'], '/app/backend', {
  SKILLHUB_API_HOST: process.env.SKILLHUB_API_HOST || '0.0.0.0',
  SKILLHUB_API_PORT: process.env.SKILLHUB_API_PORT || '8787',
  SKILLHUB_DB_PATH: process.env.SKILLHUB_DB_PATH || '/app/data/skillhub.db',
})

// 前端 Next.js standalone
launch('web', 'node', ['/app/frontend/server.js'], '/app/frontend', {
  PORT: process.env.PORT || '3000',
  HOSTNAME: process.env.HOSTNAME || '0.0.0.0',
})
