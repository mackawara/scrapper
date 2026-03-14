import winston from "winston";

const LEVEL_EMOJI: Record<string, string> = {
  error: "🔴",
  warn: "🌕",
  info: "🟢",
  debug: "🟣",
  silly: "🫧",
};

const emojiFormat = winston.format.printf(({ timestamp, level, message, ...meta }) => {
  const emoji = LEVEL_EMOJI[level] ?? "⚪";
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${emoji} [${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}`;
});

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "silly",
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    silly: 4,
  },
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(winston.format.timestamp(), emojiFormat),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});

export default logger;
