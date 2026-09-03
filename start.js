const { spawn } = require('child_process');
const path = require('path');

const root = __dirname;
const processes = [];
let shuttingDown = false;

function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of processes) if (!child.killed) child.kill('SIGTERM');
    setTimeout(() => process.exit(code), 300);
}

function start(name, directory, script, args = []) {
    const child = spawn(process.execPath, [script, ...args], {
        cwd: path.join(root, directory),
        stdio: 'inherit',
        windowsHide: true
    });
    processes.push(child);
    child.on('error', error => { console.error(`[${name}] Falha ao iniciar:`, error.message); shutdown(1); });
    child.on('exit', code => { if (!shuttingDown && code !== 0) { console.error(`[${name}] Encerrado com codigo ${code}.`); shutdown(code || 1); } });
}

console.log('Backend:  http://localhost:3000');
console.log('Frontend: http://localhost:5173');
start('backend', 'backend', 'server.js');
start('frontend', 'frontend', path.join('node_modules', 'vite', 'bin', 'vite.js'));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
