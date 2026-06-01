import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { ValidationError } from '../errors/index.js'

/**
 * SSRF guard for operator-supplied URLs (webhooks, polling endpoints).
 *
 * Rejects anything that is not http(s) or that resolves to a loopback,
 * private, link-local, CGNAT or otherwise non-public address. DNS is resolved
 * so that a public hostname pointing at an internal IP is also blocked.
 *
 * Note: this does not defend against DNS rebinding between validation and the
 * actual request — for that the HTTP clients also enforce a short timeout.
 */
export async function assertSafeUrl(raw: string, field = 'url'): Promise<URL> {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new ValidationError(`${field} is not a valid URL`, { field })
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ValidationError(`${field} must use http or https`, { field })
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')

  if (hostname.toLowerCase() === 'localhost' || hostname.toLowerCase().endsWith('.localhost')) {
    throw new ValidationError(`${field} must not target localhost`, { field })
  }

  const addresses: string[] = []
  if (isIP(hostname)) {
    addresses.push(hostname)
  } else {
    try {
      const resolved = await lookup(hostname, { all: true })
      addresses.push(...resolved.map((r) => r.address))
    } catch {
      throw new ValidationError(`${field} host could not be resolved`, { field })
    }
  }

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new ValidationError(`${field} must not target a private or internal address`, { field })
    }
  }

  return url
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return isBlockedIpv4(address)
  if (family === 6) return isBlockedIpv6(address)
  return true // unparseable → treat as unsafe
}

function isBlockedIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8 "this host"
  if (a === 10) return true // 10.0.0.0/8 private
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true // 192.168.0.0/16 private
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false
}

function isBlockedIpv6(address: string): boolean {
  const addr = address.toLowerCase()
  // IPv4-mapped in dotted form (::ffff:1.2.3.4) — validate the embedded v4 address.
  const mappedDotted = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedDotted) return isBlockedIpv4(mappedDotted[1])
  // IPv4-mapped in hex form (URL parser normalizes ::ffff:127.0.0.1 to ::ffff:7f00:1).
  const mappedHex = addr.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return isBlockedIpv4(`${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`)
  }
  if (addr === '::1' || addr === '::') return true // loopback / unspecified
  if (addr.startsWith('fe80')) return true // link-local
  if (addr.startsWith('fc') || addr.startsWith('fd')) return true // fc00::/7 unique local
  if (addr.startsWith('ff')) return true // multicast
  return false
}
