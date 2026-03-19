module.exports = {
  apps: [
    {
      name: "scrapper",
      script: "npm",
      args: "start",
      cwd: "/home/ubuntu/scrapper",
      instances: 1,
      exec_mode: "cluster",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Environment variables from .env
      env_file: "/home/ubuntu/scrapper/.env",

      // Auto restart
      watch: false,
      ignore_watch: ["node_modules", ".next", "logs"],
      max_memory_restart: "1G",

      // Logs
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/home/ubuntu/scrapper/logs/error.log",
      out_file: "/home/ubuntu/scrapper/logs/out.log",

      // Restart on crash
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
    },
  ],
};
