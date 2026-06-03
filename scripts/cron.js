import cron from 'node-cron';
import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('[cron] Genazo scheduler running');
console.log('[cron] Scheduled for midnight UTC every day');
console.log('[cron] Waiting... next run at 1:00 AM Nigeria time');

cron.schedule('0 0 * * *', () => {
  console.log('[cron] Midnight — generating daily riddle');
  try {
    execSync('node daily-riddle.js', {
      stdio: 'inherit',
      cwd: __dirname
    });
  } catch(err) {
    console.error('[cron] Failed:', err.message);
  }
}, { timezone: 'UTC' });

console.log('[cron] Scheduled for midnight UTC daily');
console.log('[cron] That is 1:00 AM Nigeria time (WAT)');
console.log('[cron] Waiting for next run...');

setInterval(() => {
  const now = new Date();
  console.log('[cron] Still running...', now.toISOString());
}, 60 * 60 * 1000);
