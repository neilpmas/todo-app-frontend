// Structured JSON logging for the Workers runtime -- plain console.log/error with a
// JSON payload is what Workers Logs and `wrangler tail` actually capture, no logging
// library needed for a Worker this size.
type LogFields = Record<string, unknown>

function emit(level: 'info' | 'error', message: string, fields: LogFields = {}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, ...fields })
  if (level === 'error') {
    console.error(line)
  } else {
    console.log(line)
  }
}

export const log = {
  info: (message: string, fields?: LogFields) => emit('info', message, fields),
  error: (message: string, fields?: LogFields) => emit('error', message, fields),
}
