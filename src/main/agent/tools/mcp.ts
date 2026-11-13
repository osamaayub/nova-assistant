import { z } from 'zod'
import type { McpToolDef } from '../../mcp/client'
import { defineTool, type NovaTool, type ToolContext } from './types'

/**
 * Turns one MCP tool into a Nova tool. Anything the server does not mark as read-only
 * asks the user first — that is the "every send needs Allow" rule from the plan.
 */
export function mcpTool(
  server: string,
  def: McpToolDef,
  call: (args: Record<string, unknown>) => Promise<string>
): NovaTool {
  const name = `mcp_${slug(server)}_${slug(def.name)}`.slice(0, 60)
  const readOnly = def.annotations?.readOnlyHint === true
  return defineTool({
    name,
    label: `Using ${server}: ${def.name}`.slice(0, 80),
    description:
      `${def.description ?? def.name} (connector "${server}"). ` +
      (readOnly ? 'Read-only.' : 'Changes data: the user must approve first.'),
    schema: jsonSchemaToZod(def.inputSchema),
    async run(input, ctx: ToolContext) {
      const args = input as Record<string, unknown>
      if (!readOnly) {
        const ok = await ctx.confirm(
          `${server}: ${def.name}`,
          `Allow "${server}" to run "${def.name}"?\n\n${JSON.stringify(args).slice(0, 800)}`
        )
        if (!ok) return { content: 'The user declined.', isError: true, summary: 'Declined' }
      }
      const text = await call(args)
      return {
        content: text.slice(0, 8000),
        summary: `${server}: ${def.name} finished`.slice(0, 80)
      }
    }
  })
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30)
}

/** Best-effort JSON-Schema -> Zod for MCP tool inputs. Unknown shapes become open objects. */
export function jsonSchemaToZod(schema: Record<string, unknown> | undefined): z.ZodType {
  const s = (schema ?? {}) as {
    type?: string
    properties?: Record<string, Record<string, unknown>>
    required?: string[]
    items?: Record<string, unknown>
    enum?: unknown[]
    anyOf?: Record<string, unknown>[]
  }
  if (s.enum?.length) return z.enum(s.enum.map((v) => String(v)) as [string, ...string[]])
  switch (s.type) {
    case 'string':
      return z.string()
    case 'number':
    case 'integer':
      return z.number()
    case 'boolean':
      return z.boolean()
    case 'array':
      return z.array(s.items ? jsonSchemaToZod(s.items) : z.unknown())
    case 'object':
    case undefined:
      if (s.properties) {
        const required = new Set(s.required ?? [])
        const shape: Record<string, z.ZodType> = {}
        for (const [key, prop] of Object.entries(s.properties)) {
          const field = jsonSchemaToZod(prop)
          shape[key] = required.has(key) ? field : field.optional()
        }
        return z.looseObject(shape)
      }
      return z.looseObject({})
    default:
      return z.unknown()
  }
}
