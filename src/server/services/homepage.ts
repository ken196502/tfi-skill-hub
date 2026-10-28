import { nowIso, query, tx } from '../db'
import { fail } from '../errors'
import { auditLog } from './shared'

export function getLayout(): unknown {
  const row = query.get<{ layout: string }>('SELECT layout FROM homepage_config WHERE id = 1')
  return row ? JSON.parse(row.layout) : null
}

export function saveLayout(actorId: string, value: unknown): void {
  const object = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail('invalid homepage layout')
    return v as Record<string, unknown>
  }
  const number = (v: unknown, min: number, max: number): number => {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail('invalid homepage layout value')
    return v
  }
  const raw = object(value)
  const title = object(raw.title)
  const hands = object(raw.hands)
  if (!Array.isArray(hands.items) || hands.items.length !== 10) fail('homepage layout requires ten hands')
  const layout = {
    title: { x: number(title.x, 0, 1), y: number(title.y, 0, 1), scale: number(title.scale, 0.25, 3.5) },
    hands: {
      scale: number(hands.scale, 0.25, 3.5),
      items: hands.items.map((v: unknown) => {
        const hand = object(v)
        if (typeof hand.visible !== 'boolean') fail('invalid hand visibility')
        return { x: number(hand.x, 0, 1), y: number(hand.y, 0, 1), visible: hand.visible }
      }),
    },
    titleHoldMs: number(raw.titleHoldMs, 0, 5000),
  }
  tx(() => {
    query.run(`INSERT INTO homepage_config (id, layout, updated_at) VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET layout = excluded.layout, updated_at = excluded.updated_at`, JSON.stringify(layout), nowIso())
    auditLog({ actorId, action: 'update_homepage_config', resourceType: 'homepage_config', resourceId: 'homepage' })
  })
}
