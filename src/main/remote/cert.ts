import * as selfsigned from 'selfsigned'

export interface Cert {
  cert: string
  key: string
  /** The addresses this certificate is valid for. */
  ips: string[]
  notAfter: number
}

const DAY = 86_400_000

/**
 * A certificate made on this PC, so a phone can open the Nova page over https. Browsers only let a
 * page use the microphone on https. The phone shows a one-time warning, because no outside company
 * vouches for this certificate; the pairing code is what keeps strangers out.
 */
export async function makeCert(ips: string[], now = Date.now()): Promise<Cert> {
  const all = [...new Set(['127.0.0.1', ...ips])]
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'Nova' }], {
    keyType: 'ec',
    algorithm: 'sha256',
    notBeforeDate: new Date(now - DAY),
    notAfterDate: new Date(now + 365 * DAY),
    extensions: [
      { name: 'basicConstraints', cA: false },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, ...all.map((ip) => ({ type: 7 as const, ip }))]
      }
    ]
  })
  return { cert: pems.cert, key: pems.private, ips: all, notAfter: now + 365 * DAY }
}

/** True when a saved certificate still covers this address and has more than a month left. */
export function certStillGood(c: Cert | null, ip: string, now = Date.now()): c is Cert {
  return !!c && c.ips.includes(ip) && c.notAfter - now > 30 * DAY
}
