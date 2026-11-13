import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'

const bump = process.argv[2] || 'patch'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
execFileSync(npm, ['version', bump, '--no-git-tag-version'], { stdio: 'inherit' })

const version = JSON.parse(readFileSync('package.json', 'utf8')).version
writeFileSync('src/main/version.ts', `export const APP_VERSION = '${version}'\n`)
process.stdout.write(`${version}\n`)
