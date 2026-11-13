import type { AvatarId, Settings } from '../../../../shared/types'
import { systemVoices } from '../voice/speaker'
import { avatarInfo, pickSystemVoice } from './avatars'

/** The settings to save when an avatar is picked: the avatar, and the voices that go with it. */
export async function avatarPatch(id: AvatarId): Promise<Partial<Settings>> {
  const names = (await systemVoices()).filter((v) => v.lang.startsWith('en')).map((v) => v.name)
  const system = pickSystemVoice(id, names)
  return {
    avatar: id,
    kokoroVoice: avatarInfo(id).kokoro,
    ...(system ? { systemVoiceName: system } : {})
  }
}
