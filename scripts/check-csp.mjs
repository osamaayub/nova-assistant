// Guards the Content Security Policy of the built window (out/renderer/index.html).
//   node scripts/check-csp.mjs desktop   the installer build: must NOT allow localhost
//   node scripts/check-csp.mjs web       the Vercel build (VERCEL=1): must allow localhost for Ollama
import { readFileSync } from 'node:fs'

const mode = process.argv[2]
if (mode !== 'desktop' && mode !== 'web') {
  process.stderr.write('Usage: node scripts/check-csp.mjs desktop|web\n')
  process.exit(2)
}

const html = readFileSync('out/renderer/index.html', 'utf8')
const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]*)"/i.exec(html)?.[1]
const problems = []

if (!csp) problems.push('No Content-Security-Policy meta tag found.')
else {
  const directives = {}
  for (const name of ['default-src', 'script-src', 'connect-src'])
    directives[name] = new RegExp(`(?:^|;)\\s*${name}\\s+([^;]*)`).exec(csp)?.[1] ?? ''
  const connect = directives['connect-src']
  const localhost = /http:\/\/(127\.0\.0\.1|localhost):\*/.test(connect)

  if (!/'self'/.test(directives['default-src'])) problems.push("default-src must be 'self'.")
  if (/'unsafe-eval'|'unsafe-inline'/.test(directives['script-src']))
    problems.push('script-src must not allow unsafe-eval or unsafe-inline.')
  if (/(^|\s)(\*|https?:|data:)(\s|$)/.test(connect.replace(/\bdata:/, '')))
    problems.push('connect-src must not allow every host.')
  if (mode === 'desktop' && localhost)
    problems.push('The desktop build must not allow connections to localhost.')
  if (mode === 'web' && !localhost)
    problems.push('The web build must allow localhost so the page can reach Ollama.')
}

if (problems.length) {
  for (const p of problems) process.stderr.write(`CSP check failed (${mode}): ${p}\n`)
  process.exit(1)
}
process.stdout.write(`CSP check passed (${mode}).\n`)
