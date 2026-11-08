import si from 'systeminformation'
import { z } from 'zod'
import { defineTool } from './types'

const gb = (bytes: number): string => `${(bytes / 1024 ** 3).toFixed(1)} GB`

export const systemStatus = defineTool({
  name: 'system_status',
  label: 'Checking your PC',
  description:
    'Read CPU load, memory, disk space, battery and the programs using the most CPU and memory right now.',
  schema: z.object({}),
  async run() {
    const [load, mem, disks, battery, procs] = await Promise.all([
      si.currentLoad(),
      si.mem(),
      si.fsSize(),
      si.battery(),
      si.processes()
    ])
    const top = [...procs.list]
      .sort((a, b) => b.cpu - a.cpu || b.memRss - a.memRss)
      .slice(0, 5)
      .map((p) => `${p.name} (CPU ${p.cpu.toFixed(1)}%, RAM ${(p.memRss / 1024).toFixed(0)} MB)`)
    const disk = disks
      .filter((d) => d.size > 0)
      .slice(0, 3)
      .map((d) => `${d.mount} ${gb(d.size - d.used)} free of ${gb(d.size)}`)
    const lines = [
      `CPU load: ${load.currentLoad.toFixed(0)}%`,
      `Memory: ${gb(mem.active)} used of ${gb(mem.total)}`,
      `Disks: ${disk.join('; ') || 'unknown'}`,
      battery.hasBattery
        ? `Battery: ${battery.percent}%${battery.isCharging ? ' (charging)' : ''}`
        : 'Battery: none (desktop PC)',
      `Busiest programs: ${top.join('; ')}`
    ]
    return {
      content: lines.join('\n'),
      summary: `CPU ${load.currentLoad.toFixed(0)}%, RAM ${gb(mem.active)} / ${gb(mem.total)}`
    }
  }
})

export const getDateTime = defineTool({
  name: 'get_datetime',
  label: 'Checking the time',
  description: 'Get the current local date, time and time zone.',
  schema: z.object({}),
  async run(_input, ctx) {
    const now = ctx.now()
    const text = now.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
    return { content: `${text} (${Intl.DateTimeFormat().resolvedOptions().timeZone})` }
  }
})

const timers = new Set<ReturnType<typeof setTimeout>>()

export const setTimer = defineTool({
  name: 'set_timer',
  label: 'Setting a timer',
  description:
    'Set a reminder that shows a Windows notification after some minutes (1 to 720). It only fires while Nova is running.',
  schema: z.object({
    minutes: z.number().min(1).max(720),
    label: z.string().min(1).max(80).describe('What the reminder is for, e.g. "Take the pizza out"')
  }),
  async run({ minutes, label }, ctx) {
    if (timers.size >= 20)
      return { content: 'Too many timers are already running (20).', isError: true }
    const t = setTimeout(() => {
      timers.delete(t)
      ctx.platform.notify('Nova reminder', label)
    }, minutes * 60_000)
    timers.add(t)
    const at = new Date(ctx.now().getTime() + minutes * 60_000).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit'
    })
    return {
      content: `Timer set for ${minutes} minutes (at ${at}): ${label}.`,
      summary: `Reminder at ${at}`
    }
  }
})
