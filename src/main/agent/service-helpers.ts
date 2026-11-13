/** The Settings switch for web search also takes the keyless search tool away from every agent. */
export function withSearchSetting<T extends { name: string }>(tools: T[], on: boolean): T[] {
  return on ? tools : tools.filter((t) => t.name !== 'web_search')
}
