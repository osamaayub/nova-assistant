import { openApp } from './apps'
import { listFolder, openFolder, organizeDownloads } from './files'
import { forgetFact, rememberFact } from './memory'
import { getDateTime, setTimer, systemStatus } from './system'
import type { NovaTool } from './types'
import { openWebsite, playMusic, readWebPage } from './web'

/** Every tool Nova has. In team mode the specialists share them out (see team.ts). */
export const TOOLS: NovaTool[] = [
  openApp,
  openWebsite,
  playMusic,
  readWebPage,
  systemStatus,
  getDateTime,
  setTimer,
  listFolder,
  openFolder,
  organizeDownloads,
  rememberFact,
  forgetFact
] as NovaTool[]
