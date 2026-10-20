#!/usr/bin/env node
/**
 * Smoke test for the deployed SkillHub: publish a "test" knowledge base and
 * verify it shows up everywhere a knowledge base should.
 *
 * Run against the live deploy:
 *   SKILLHUB_API_KEY=xxxx node scripts/smoke-kb.mjs
 *
 * Env:
 *   SKILLHUB_BASE     default https://skills.subx.fun
 *   SKILLHUB_API_KEY  required — an admin key with the `skills:publish` scope
 *   KB_SLUG           default "test"
 *   KB_VERSION        default "1.0.0"
 *   KB_NAME           default "Test Knowledge Base"
 *   KB_SUMMARY        default "A test knowledge base created by the smoke test."
 *
 * The publishes are idempotent: if the slug already exists the test treats a
 * 409 as "already live" and keeps verifying the read paths.
 */

import { Blob } from 'node:buffer'
// FormData is a global in Node 18+; we only need Blob for the file part.

const BASE = (process.env.SKILLHUB_BASE || 'https://skills.subx.fun').replace(/\/+$/, '')
const KEY = process.env.SKILLHUB_API_KEY
const SLUG = process.env.KB_SLUG || 'test'
const VERSION = process.env.KB_VERSION || '1.0.0'
const NAME = process.env.KB_NAME || 'Test Knowledge Base'
const SUMMARY = process.env.KB_SUMMARY || 'A test knowledge base created by the smoke test.'

if (!KEY) {
  console.error('SKILLHUB_API_KEY is required (set it in the environment).')
  process.exit(2)
}

let failures = 0
function check(name, cond, extra = '') {
  const ok = !!cond
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  — ${extra}` : ''}`)
  return ok
}

const auth = { Authorization: `Bearer ${KEY}` }

async function main() {
  console.log(`# Smoke test: knowledge base "${SLUG}" @ ${BASE}\n`)

  // 1. Publish the knowledge base. SKILL.md is optional for a KB; we ship a
  //    minimal one so the download bundle and the detail page have a manifest.
  const skillMd = `# ${NAME}\n\n${SUMMARY}\n`
  const fd = new FormData()
  fd.set('slug', SLUG)
  fd.set('version', VERSION)
  fd.set('displayName', NAME)
  fd.set('summary', SUMMARY)
  fd.set('category', 'general')
  fd.set('type', 'knowledge_base')
  fd.set('listing', 'listed')
  fd.set('tags', 'test,smoke')
  fd.set('SKILL.md', new Blob([skillMd], { type: 'text/markdown' }), 'SKILL.md')

  const pubRes = await fetch(`${BASE}/api/v1/skills`, {
    method: 'POST',
    headers: auth,
    body: fd,
  })
  const pubBody = await pubRes.json().catch(() => null)
  const pubStatus = pubRes.status

  let ns = pubBody?.skill?.namespaceSlug || ''
  if (pubStatus === 409) {
    console.log('INFO  slug already exists (409) — will verify whether it is our knowledge base')
  } else if (pubStatus >= 200 && pubStatus < 300) {
    console.log(`INFO  published @${ns}/${SLUG} v${VERSION}`)
  } else {
    check(`publish KB returns 2xx (got ${pubStatus})`, false, JSON.stringify(pubBody).slice(0, 300))
    console.log('\nAborting: could not publish the test knowledge base.')
    process.exit(1)
  }

  // 2. It must appear in the knowledge-base listing.
  const listRes = await fetch(`${BASE}/api/v1/skills?type=knowledge_base&limit=200`)
  const listBody = await listRes.json().catch(() => ({}))
  const items = listBody?.data || listBody?.skills || []
  const listed = items.find((s) => s.slug === SLUG)
  if (listed?.namespaceSlug) ns = listed.namespaceSlug
  if (!listed && pubStatus === 409) {
    // The slug exists but is not a knowledge base — most likely a skill with
    // the same name. Tell the operator instead of failing silently.
    const all = await fetch(`${BASE}/api/v1/skills?limit=200`).then((r) => r.json().catch(() => ({})))
    const clash = (all?.data || all?.skills || []).find((s) => s.slug === SLUG)
    console.log(
      `WARN  slug '${SLUG}' already exists as a ${clash?.type ?? 'different'} entry` +
        ` — set KB_SLUG to a free slug to publish a knowledge base`,
    )
  }
  check(
    'KB appears in GET /api/v1/skills?type=knowledge_base',
    !!listed,
    listed ? `@${listed.namespaceSlug}/${listed.slug} (${listed.type})` : 'not found',
  )

  // 3. The detail endpoint reports type=knowledge_base.
  if (ns) {
    const detailRes = await fetch(`${BASE}/api/v1/skills/@${ns}/${SLUG}`)
    const detail = await detailRes.json().catch(() => ({}))
    check('detail type === knowledge_base', detail?.type === 'knowledge_base', `type=${detail?.type}`)
  } else {
    console.log('SKIP  detail check (namespace unknown after publish)')
  }

  // 4. Search should surface it.
  const searchRes = await fetch(`${BASE}/api/v1/search?q=${encodeURIComponent(SLUG)}&type=knowledge_base&limit=20`)
  const searchBody = await searchRes.json().catch(() => ({}))
  const hits = searchBody?.hits || searchBody?.data || searchBody?.skills || []
  check('search finds the KB', hits.some((h) => (h.slug || h.skill?.slug) === SLUG))

  console.log('')
  if (failures === 0) {
    console.log(`SMOKE TEST PASSED — test knowledge base @${ns}/${SLUG} is live.`)
    process.exit(0)
  } else {
    console.log(`SMOKE TEST FAILED — ${failures} check(s) failed.`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error('ERROR', e)
  process.exit(3)
})
