import { existsSync } from 'node:fs'
import { basename, delimiter, join } from 'node:path'

/**
 * On Windows `npx` is a .cmd script, and Node cannot start those without a shell. A shell would
 * let a folder name like "a & b" run as a command, so instead run npx's own script with node.exe.
 * Everything else is started exactly as written.
 */
export function resolveCommand(
  command: string,
  args: string[],
  platform: NodeJS.Platform = process.platform,
  pathVar: string = process.env.PATH ?? process.env.Path ?? '',
  exists: (p: string) => boolean = existsSync
): { command: string; args: string[] } {
  if (platform !== 'win32' || !/^npx(\.cmd)?$/i.test(basename(command)))
    return { command, args }
  for (const dir of pathVar.split(delimiter).filter(Boolean)) {
    const node = join(dir, 'node.exe')
    const cli = join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js')
    if (exists(node) && exists(cli)) return { command: node, args: [cli, ...args] }
  }
  return { command, args }
}
