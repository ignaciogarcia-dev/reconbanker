import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const { combine, timestamp, json, printf, colorize, errors } = winston.format

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logsDir = path.resolve(__dirname, '../../../..', 'logs')

mkdirSync(logsDir, { recursive: true })

const fileFormat = combine(errors({ stack: true }), timestamp(), json())

const consoleFormat = combine(
  errors({ stack: true }),
  timestamp({ format: 'HH:mm:ss' }),
  colorize({ all: true }),
  printf(({ level, message, timestamp, context, ...meta }) => {
    const ctx = context ? `${context} ` : ''
    const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : ''
    return `${timestamp} ${level}: ${ctx}${message}${extra}`
  })
)

const rotation = {
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: process.env.LOG_MAX_SIZE ?? '20m',
  maxFiles: process.env.LOG_MAX_FILES ?? '14d',
  format: fileFormat,
}

export function buildTransports(): winston.transport[] {
  const transports: winston.transport[] = [
    new DailyRotateFile({ ...rotation, filename: path.join(logsDir, 'error-%DATE%.log'), level: 'error' }),
    new DailyRotateFile({ ...rotation, filename: path.join(logsDir, 'app-%DATE%.log') }),
  ]
  if (process.env.NODE_ENV !== 'production') {
    transports.push(new winston.transports.Console({ format: consoleFormat }))
  }
  return transports
}
