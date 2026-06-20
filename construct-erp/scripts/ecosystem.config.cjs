const path = require('path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'bcim-backend',
      cwd: path.join(root, 'backend'),
      script: path.join(root, 'backend', 'src', 'server.js'),
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '700M',
      min_uptime: '10s',
      restart_delay: 5000,
      exp_backoff_restart_delay: 5000,
      max_restarts: 50,
      kill_timeout: 10000,
      env: {
        NODE_ENV:           'production',
        // Backend API runs on 5000. The frontend/Vite service remains on 3000.
        // Keep PM2 aligned with backend/.env to avoid duplicate stale processes.
        PORT:               5000,
        FRONTEND_URL:       'http://bcim.ddns.net:3000',
        PUBLIC_FRONTEND_URL:'http://bcim.ddns.net:3000',
      },
    },
  ],
};
