/**
 * First-boot bootstrap.
 *
 * Creates the administrator named by `SKILLHUB_ADMIN_USER` /
 * `SKILLHUB_ADMIN_PASSWORD` when that handle does not exist yet — the same
 * behaviour as the original binary's `autoSetup`. Idempotent: restarting the
 * service never rewrites an existing account's password.
 *
 * Implemented with direct SQL rather than the repository layer so that `db.ts`
 * does not need to import `repo/*` (which imports `db.ts` back).
 */

import crypto from 'node:crypto'
import { getConfig } from './config'
import { hashPassword, MIN_PASSWORD_LENGTH } from './password'
import type { DatabaseSync } from 'node:sqlite'
import { BUILTIN_SKILLS, type BuiltinSkill } from './builtinSkills'

export function seedAdminUser(db: DatabaseSync, log: (msg: string) => void = () => {}): void {
  const { adminUser, adminPassword } = getConfig()
  if (adminUser === '' || adminPassword === '') return

  if (adminPassword.length < MIN_PASSWORD_LENGTH) {
    log(
      `bootstrap: SKILLHUB_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters; admin not created`,
    )
    return
  }

  const existing = db
    .prepare('SELECT id FROM users WHERE handle = ?')
    .get(adminUser) as { id?: string } | undefined
  if (existing) return

  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO users (id, handle, display_name, password_hash, role, is_banned, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'admin', 0, ?, ?)`,
  ).run(crypto.randomUUID(), adminUser, adminUser, hashPassword(adminPassword), now, now)

  log(`bootstrap: created admin user '${adminUser}'`)
}

/** Seed the catalog that is available in every new SkillHub installation. */
export function seedBuiltinSkills(db: DatabaseSync, log: (msg: string) => void = () => {}): void {
  const now = new Date().toISOString()
  const systemId = '00000000-0000-4000-8000-000000000001'
  const namespaceId = '00000000-0000-4000-8000-000000000002'
  db.prepare(`INSERT OR IGNORE INTO users
    (id, handle, display_name, role, is_banned, created_at, updated_at)
    VALUES (?, 'skillhub', 'SkillHub 内置技能', 'admin', 0, ?, ?)`).run(systemId, now, now)
  db.prepare(`INSERT OR IGNORE INTO namespaces
    (id, slug, display_name, description, owner_id, type, status, default_listing, max_skills, created_at, updated_at)
    VALUES (?, 'builtin', '内置技能', '随 SkillHub 项目初始化提供的技能', ?, 'team', 'active', 'listed', 0, ?, ?)`).run(namespaceId, systemId, now, now)
  db.prepare(`INSERT OR IGNORE INTO namespace_members
    (id, namespace_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`).run(
    '00000000-0000-4000-8000-000000000003', namespaceId, systemId, now,
  )

  const skillStmt = db.prepare(`INSERT OR IGNORE INTO skills
    (id, slug, display_name, summary, display_name_en, summary_en, owner_id, namespace_id,
     latest_version_id, listing, is_suspicious, kind, category, tags,
     versions_count, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'listed', 0, 'builtin', ?, ?, 1, ?, ?)`)
  const enStmt = db.prepare('UPDATE skills SET display_name_en = ?, summary_en = ? WHERE id = ?')
  const versionStmt = db.prepare(`INSERT OR IGNORE INTO skill_versions
    (id, skill_id, version, fingerprint, files, parsed, created_by, sha256_hash, created_at)
    VALUES (?, ?, '1.0.0', ?, ?, ?, ?, ?, ?)`)
  const fileStmt = db.prepare(`INSERT OR IGNORE INTO skill_version_files
    (version_id, path, seq, size, sha256, content_type, content) VALUES (?, 'SKILL.md', 0, ?, ?, 'text/markdown', ?)`)
  // Builtin skills never flow through the publish path, so nothing else would
  // index them — seed their search documents here (same column contract as
  // `repo/search.ts`).
  const unindexStmt = db.prepare('DELETE FROM search_docs WHERE doc_id = ?')
  const searchStmt = db.prepare(`INSERT INTO search_docs
    (slug, display_name, summary, skill_md_content, tags, owner_handle,
     doc_id, doc_type, target_id, category, namespace_slug, listing,
     is_suspicious, is_deleted, downloads, stars, updated_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'skill', ?, ?, 'builtin', 'listed', 0, 0, 0, 0, ?, ?)`)
  const nowMs = Date.parse(now)
  for (const skill of BUILTIN_SKILLS) {
    const skillId = `builtin-${skill.slug}`
    const versionId = `${skillId}-v1`
    const content = `---\nname: ${skill.nameEn}\ndescription: ${skill.descriptionEn}\ncategory: ${skill.category}\nsource: ${skill.source}\n---\n\n# ${skill.nameEn}\n\n${skill.descriptionEn}\n\nThis skill ships with the SkillHub catalog. When executing tasks, stay within the scope above and combine it with the current project context to produce verifiable results.\n\nSource: ${skill.source}\n`
    const bytes = Buffer.from(content, 'utf8')
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    skillStmt.run(
      skillId,
      skill.slug,
      skill.name,
      skill.description,
      skill.nameEn,
      skill.descriptionEn,
      systemId,
      namespaceId,
      versionId,
      skill.category,
      JSON.stringify([skill.author]),
      now,
      now,
    )
    // Existing installs already have the row (INSERT IGNORE skipped it); the
    // English columns are still backfilled so the language switch works.
    enStmt.run(skill.nameEn, skill.descriptionEn, skillId)
    versionStmt.run(versionId, skillId, hash, JSON.stringify([{ path: 'SKILL.md', size: bytes.length, sha256: hash, contentType: 'text/markdown' }]), JSON.stringify({}), systemId, hash, now)
    fileStmt.run(versionId, bytes.length, hash, bytes)
    unindexStmt.run(skillId)
    searchStmt.run(
      skill.slug,
      skill.name,
      skill.description,
      content,
      skill.author,
      'skillhub',
      skillId,
      skillId,
      skill.category,
      nowMs,
      nowMs,
    )
  }
  log(`bootstrap: seeded ${BUILTIN_SKILLS.length} builtin skills`)
}

/**
 * Seed the homepage "Featured skills" rail on first boot.
 *
 * The catalog keeps a curated, ordered set of featured skills in `featured_skills`.
 * On a brand-new install that table is empty, leaving the landing page's
 * Featured section blank — so we pre-populate it with a varied slice of the
 * builtin skills (one per category first, then filling up to the 12 the admin
 * UI allows). Idempotent: once an admin has curated the list we never overwrite
 * it, and `skill_id` is the primary key so a re-run is a no-op.
 */
export function seedFeaturedSkills(db: DatabaseSync, log: (msg: string) => void = () => {}): void {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM featured_skills').get() as { c: number }
  if (c > 0) return

  const MAX_FEATURED = 12
  // First one skill of each category (variety), then fill the rest in order.
  const picked: BuiltinSkill[] = []
  const seenCats = new Set<string>()
  for (const s of BUILTIN_SKILLS) {
    if (!seenCats.has(s.category)) {
      seenCats.add(s.category)
      picked.push(s)
    }
  }
  for (const s of BUILTIN_SKILLS) {
    if (picked.length >= MAX_FEATURED) break
    if (!picked.includes(s)) picked.push(s)
  }

  const now = new Date().toISOString()
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO featured_skills (skill_id, position, created_at, updated_at) VALUES (?, ?, ?, ?)',
  )
  picked.slice(0, MAX_FEATURED).forEach((s, i) => {
    stmt.run(`builtin-${s.slug}`, i, now, now)
  })

  if (picked.length > 0) log(`bootstrap: seeded ${Math.min(picked.length, MAX_FEATURED)} featured skills`)
}
