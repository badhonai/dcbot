const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: Infinity };
const SECRET_KEY = /token|secret|password|authorization|api.?key|cookie|private.?key|seed|mnemonic|content|question|prompt/i;
function createLogger(scope = 'app', options = {}) {
    const env = options.env || process.env;
    const level = options.level || env.LOG_LEVEL || 'info';
    const format = options.format || env.LOG_FORMAT || 'compact';
    const requestedWidth = Number(options.width ?? env.LOG_WIDTH ?? 48);
    const width = Number.isInteger(requestedWidth) && requestedWidth >= 32 && requestedWidth <= 120 ? requestedWidth : 48;
    const threshold = LEVELS[level] ?? LEVELS.info;
    const secrets = options.secrets || Object.entries(env).filter(([key, value]) => SECRET_KEY.test(key) && value?.length >= 8).map(([, value]) => value);
    const clean = value => {
        let text = String(value).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, ' ');
        for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
        return text.replace(/(?:github_pat_|gh[pousr]_|gsk_)[A-Za-z0-9_]+/g, '[REDACTED]').slice(0, 300);
    };
    const output = options.write || ((line, severity) => (severity === 'warn' || severity === 'error' ? process.stderr : process.stdout).write(line + '\n'));
    const now = options.now || (() => new Date());
    function log(severity, message, fields = {}) {
        if (LEVELS[severity] < threshold) return;
        const data = {};
        for (const [key, value] of Object.entries(fields || {}).slice(0, 20)) {
            if (value === undefined || value === null) continue;
            data[clean(key)] = SECRET_KEY.test(key) ? '[REDACTED]' :
                typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean' ? value :
                    typeof value === 'object' ? '[omitted]' : clean(value);
        }
        const time = now().toISOString();
        if (format === 'json') {
            output(JSON.stringify({ time, level: severity, scope: clean(scope), message: clean(message), fields: data }), severity);
        } else if (format === 'wide') {
            const details = Object.entries(data).map(([key, value]) => `${key}=${typeof value === 'string' && /\s|=/.test(value) ? JSON.stringify(value) : value}`).join('  ');
            output(`${time}  ${severity.toUpperCase().padEnd(5)}  ${clean(scope).slice(0, 14).padEnd(14)}  ${clean(message)}${details ? '  |  ' + details : ''}`, severity);
        } else {
            // Compact (also the legacy 'pretty' alias): no padded columns or long inline metadata.
            const wrap = (text, indent = '') => {
                const lines = [];
                while (text.length > width - indent.length) {
                    const available = width - indent.length;
                    let end = text.lastIndexOf(' ', available);
                    if (end <= 0) end = available;
                    lines.push(indent + text.slice(0, end));
                    text = text.slice(end).trimStart();
                    indent = '    ';
                }
                if (text) lines.push(indent + text);
                return lines;
            };
            const component = scope === 'app' ? '' : `[${clean(scope).slice(0, 14)}] `;
            const lines = wrap(`[${time.slice(11, 19)}] ${severity.toUpperCase().padEnd(5)} ${component}${clean(message)}`);
            for (const [key, value] of Object.entries(data)) {
                const label = ({ aiChat: 'AI chat', node: 'Node.js', slashReplies: 'Slash replies', durationMs: 'Duration (ms)', timeoutMs: 'Timeout (ms)' })[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
                lines.push(...wrap(`${label.charAt(0).toUpperCase() + label.slice(1)}: ${value}`, '  '));
            }
            output(lines.join('\n'), severity);
        }
    }
    return {
        debug: (message, fields) => log('debug', message, fields),
        info: (message, fields) => log('info', message, fields),
        warn: (message, fields) => log('warn', message, fields),
        error: (message, fields) => log('error', message, fields),
        child: name => createLogger(name, { ...options, env, secrets, write: output, now }),
    };
}
// Never print raw provider errors or stacks; they can contain headers, URLs and input.
function errorDetails(error) {
    const status = error?.status ?? error?.statusCode;
    const code = error?.code;
    let hint = 'Check configuration, network access and service availability';
    if (error?.message === 'Missing environment variable: DISCORD_TOKEN') hint = 'Set DISCORD_TOKEN in .env';
    else if (status === 429) hint = 'Rate limit reached; wait before retrying';
    else if (status === 401 || code === 'TokenInvalid') hint = 'Check the configured credential; do not print it';
    else if (status === 403 || code === 50013 || code === 50001) hint = 'Check bot permissions and channel access';
    else if (code === 'ENOENT') hint = 'Check required configuration and knowledge files';
    else if (error?.name === 'SyntaxError') hint = 'Check configuration and knowledge JSON syntax';
    else if (['TimeoutError', 'AbortError'].includes(error?.name)) hint = 'Request timed out; retry when the service recovers';
    return { error: error?.name || 'Error', status: Number.isInteger(status) ? status : undefined,
        code: typeof code === 'number' || typeof code === 'string' ? code : undefined, hint };
}
module.exports = { createLogger, errorDetails };
