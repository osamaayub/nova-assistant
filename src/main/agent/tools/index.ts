import { closeApp, openApp } from './apps'
import { readCodeFile, runProjectCheck, writeCodeFile } from './code'
import { createFolder, findFile, listFolder, openFolder, organizeDownloads } from './files'
import { forgetFact, rememberFact } from './memory'
import { getDateTime, setTimer, systemStatus } from './system'
import type { NovaTool } from './types'
import { openWebsite, playMusic, readWebPage, whatsappMessage } from './web'

/** Every tool Nova has. In team mode the specialists share them out (see team.ts). */
export const TOOLS: NovaTool[] = [
  openApp,
  closeApp,
  openWebsite,
  playMusic,
  whatsappMessage,
  readWebPage,
  systemStatus,
  getDateTime,
  setTimer,
  listFolder,
  openFolder,
  findFile,
  createFolder,
  organizeDownloads,
  readCodeFile,
  writeCodeFile,
  runProjectCheck,
  rememberFact,
  forgetFact
] as NovaTool[]
