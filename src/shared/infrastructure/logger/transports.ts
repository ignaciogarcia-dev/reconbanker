import winston from 'winston'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const { combine, timestamp, json, printf, colorize, errors } = winston.format

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const logsDir = path.resolve(__dirname, '../../../../..', 'logs')

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

export function buildTransports(): winston.transport[] {
  const transports: winston.transport[] = [
    new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error', format: fileFormat }),
    new winston.transports.File({ filename: path.join(logsDir, 'app.log'), format: fileFormat }),
  ]
  if (process.env.NODE_ENV !== 'production') {
    transports.push(new winston.transports.Console({ format: consoleFormat }))
  }
  return transports
}
