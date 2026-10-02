const { spawn } = require('node:child_process')
const path = require('node:path')
const { createRequire } = require('node:module')
const webRequire = createRequire(path.resolve(__dirname, '../apps/web/package.json'))
const { loadConfig } = require('./config.cjs')
const { createLibraryServer } = require('./library-server.cjs')
const config = loadConfig()
const server = createLibraryServer({ config, devPort: config.server.devPort })
const child = spawn(
  process.execPath,
  [
    webRequire.resolve('next/dist/bin/next'),
    'dev',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(config.server.devPort),
  ],
  { cwd: path.resolve(__dirname, '../apps/web'), stdio: 'inherit', windowsHide: true },
)
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  child.kill()
  server.close(() => process.exit(code))
}
child.on('error', (error) => {
  console.error(error.message)
  stop(1)
})
child.on('exit', (code) => stop(code ?? 0))
server.on('error', (error) => {
  console.error(error.message)
  stop(1)
})
server.listen(config.server.port, '127.0.0.1', () =>
  console.log(`Pageforge http://localhost:${config.server.port}`),
)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop())
