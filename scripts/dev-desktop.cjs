const { spawn } = require('node:child_process');
const path = require('node:path');
const { loadConfig } = require('./config.cjs');
const config = loadConfig();
const child = spawn(process.execPath, [process.env.npm_execpath, 'run', 'dev', '-w', 'apps/desktop'], {
  cwd: path.resolve(__dirname, '..'), stdio: 'inherit', windowsHide: true,
  env: { ...process.env, PAGEFORGE_DESKTOP_URL: `http://localhost:${config.server.port}` },
});
child.on('exit', code => process.exit(code ?? 1));
child.on('error', error => { console.error(error.message); process.exit(1); });
