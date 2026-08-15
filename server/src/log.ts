import { config } from './config.ts';

type LogFields = Record<string, unknown>;

function safeFields(fields?: LogFields): LogFields {
  if (!fields) return {};
  const out: LogFields = {};
  for (const [k, v] of Object.entries(fields)) {
    const key = k.toLowerCase();
    if (
      key.includes('password') ||
      key.includes('cookie') ||
      key.includes('authorization') ||
      key.includes('token') ||
      key.includes('secret')
    ) {
      out[k] = '[REDACTED]';
    } else {
      out[k] = v;
    }
  }
  return out;
}

function write(level: string, event: string, fields?: LogFields) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...safeFields(fields),
  };
  const line = JSON.stringify(payload);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export const log = {
  info(event: string, fields?: LogFields) {
    write('info', event, fields);
  },
  warn(event: string, fields?: LogFields) {
    write('warn', event, fields);
  },
  error(event: string, fields?: LogFields) {
    write('error', event, fields);
  },
  debug(event: string, fields?: LogFields) {
    if (config.logLevel === 'debug') write('debug', event, fields);
  },
};
