import express from 'express';
import { spawn } from 'child_process';
import path from 'path';

const app = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== 'production';

// In dev mode, run esbuild in watch mode as a child process
if (isDev) {
  const builder = spawn('node', ['build.js', '--dev'], {
    stdio: 'inherit',
    cwd: path.dirname(new URL(import.meta.url).pathname),
  });
  process.on('exit', () => builder.kill());
}

app.use(express.static('public'));

app.listen(PORT, () => {
  console.log(`Windchime running at http://localhost:${PORT}`);
});
