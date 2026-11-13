// A tiny fake MCP server for tests: newline-delimited JSON-RPC over stdio.
// Responds to initialize, tools/list and tools/call. Ignores notifications.
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl = buf.indexOf('\n')
  while (nl >= 0) {
    const line = buf.slice(0, nl).trim()
    buf = buf.slice(nl + 1)
    nl = buf.indexOf('\n')
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      continue
    }
    if (msg.id === undefined) continue
    let result
    if (msg.method === 'initialize') {
      result = {
        protocolVersion: msg.params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'fake', version: '0.0.1' }
      }
    } else if (msg.method === 'tools/list') {
      result = {
        tools: [
          {
            name: 'list_events',
            description: 'List calendar events',
            inputSchema: {
              type: 'object',
              properties: { day: { type: 'string' } },
              required: ['day']
            },
            annotations: { readOnlyHint: true }
          },
          {
            name: 'send_email',
            description: 'Send an email',
            inputSchema: {
              type: 'object',
              properties: { to: { type: 'string' }, body: { type: 'string' } },
              required: ['to', 'body']
            }
          }
        ]
      }
    } else if (msg.method === 'tools/call') {
      if (msg.params?.name === 'send_email' && msg.params?.arguments?.to === 'blocked@example.com') {
        result = { content: [{ type: 'text', text: 'send failed' }], isError: true }
      } else {
        result = {
          content: [{ type: 'text', text: `called ${msg.params?.name} with ${JSON.stringify(msg.params?.arguments)}` }]
        }
      }
    } else {
      result = {}
    }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n')
  }
})
