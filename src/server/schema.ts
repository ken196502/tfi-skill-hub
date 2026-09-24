/**
 * Database schema.
 *
 * Derived from the GORM struct tags in the Go implementation's `pkg/model/*.go`
 * plus the Postgres/SQLite migration steps in `pkg/repository/db.go`.
 *
 * Two storage decisions differ from the original and are deliberate:
 *
 * 1. **Version content lives in SQLite.** Upstream stores each version as a git
 *    commit and keeps only metadata in the DB (`git_commit_hash`). We store file
 *    bytes in `skill_version_files` / `plugin_version_files`. The `gitCommitHash`
 *    field is retained for wire compatibility but is left unset.
 * 2. **Search is SQLite FTS5**, not Bleve. See `search_docs` below.
 *
 * Timestamps are ISO-8601 UTC strings (`2026-09-22T05:16:00.123Z`) rather than
 * Go's RFC3339-with-nanos-in-local-offset. Both are RFC3339-valid.
 */

export interface Migration {
  v: number
  name: string
  sql: string
}

const INITIAL_SCHEMA = /* sql */ `
-- ── users ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  email         TEXT,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','moderator','admin','agent')),
  is_banned     INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0,1)),
  ban_reason    TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);
CREATE INDEX idx_users_role ON users (role);

-- ── namespaces ───────────────────────────────────────────────────────────────
CREATE TABLE namespaces (
  id                 TEXT PRIMARY KEY,
  slug               TEXT NOT NULL UNIQUE,
  display_name       TEXT,
  description        TEXT,
  owner_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type               TEXT NOT NULL DEFAULT 'team' CHECK (type IN ('personal','team')),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  default_visibility TEXT NOT NULL DEFAULT 'private' CHECK (default_visibility IN ('private','public')),
  max_skills         INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_namespaces_owner ON namespaces (owner_id);

CREATE TABLE namespace_members (
  id           TEXT PRIMARY KEY,
  namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','reader')),
  created_at   TEXT NOT NULL,
  UNIQUE (namespace_id, user_id)
);
CREATE INDEX idx_ns_member_user ON namespace_members (user_id);

CREATE TABLE namespace_invitations (
  id             TEXT PRIMARY KEY,
  namespace_id   TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  inviter_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitee_handle TEXT NOT NULL,
  role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','reader')),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','accepted','declined','revoked','expired')),
  message        TEXT,
  created_at     TEXT NOT NULL,
  expires_at     TEXT NOT NULL,
  responded_at   TEXT
);
CREATE INDEX idx_ns_inv_namespace ON namespace_invitations (namespace_id);
CREATE INDEX idx_ns_inv_invitee   ON namespace_invitations (invitee_id);
CREATE INDEX idx_ns_inv_status    ON namespace_invitations (status);

-- ── skills ───────────────────────────────────────────────────────────────────
CREATE TABLE skills (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,
  display_name      TEXT,
  summary           TEXT,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  namespace_id      TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  latest_version_id TEXT,
  visibility        TEXT NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private','public')),
  moderation_status TEXT NOT NULL DEFAULT 'approved'
                    CHECK (moderation_status IN ('approved','pending_review','rejected')),
  is_suspicious     INTEGER NOT NULL DEFAULT 0 CHECK (is_suspicious IN (0,1)),
  kind              TEXT NOT NULL DEFAULT 'custom'
                    CHECK (kind IN ('builtin','domain','learned','custom')),
  category          TEXT NOT NULL DEFAULT 'general',
  tags              TEXT NOT NULL DEFAULT '[]',
  downloads         INTEGER NOT NULL DEFAULT 0,
  installs          INTEGER NOT NULL DEFAULT 0,
  stars_count       INTEGER NOT NULL DEFAULT 0,
  versions_count    INTEGER NOT NULL DEFAULT 0,
  comments_count    INTEGER NOT NULL DEFAULT 0,
  average_rating    REAL NOT NULL DEFAULT 0,
  ratings_count     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  soft_deleted_at   TEXT,
  UNIQUE (namespace_id, slug)
);
CREATE INDEX idx_skills_owner        ON skills (owner_id);
CREATE INDEX idx_skills_namespace    ON skills (namespace_id);
CREATE INDEX idx_skills_downloads    ON skills (downloads);
CREATE INDEX idx_skills_stars        ON skills (stars_count);
CREATE INDEX idx_skills_category     ON skills (category);
CREATE INDEX idx_skills_kind         ON skills (kind);
CREATE INDEX idx_skills_created      ON skills (created_at);
CREATE INDEX idx_skills_updated      ON skills (updated_at);
CREATE INDEX idx_skills_soft_deleted ON skills (soft_deleted_at);

CREATE TABLE skill_versions (
  id                  TEXT PRIMARY KEY,
  skill_id            TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version             TEXT NOT NULL,
  fingerprint         TEXT NOT NULL,
  git_commit_hash     TEXT,
  changelog           TEXT,
  changelog_source    TEXT,
  files               TEXT NOT NULL DEFAULT '[]',
  parsed              TEXT NOT NULL DEFAULT '{}',
  created_by          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sha256_hash         TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  soft_deleted_at     TEXT,
  yanked_at           TEXT,
  yank_reason         TEXT,
  deprecated_at       TEXT,
  deprecation_message TEXT,
  dependencies        TEXT NOT NULL DEFAULT '[]',
  signature_bundle    TEXT,
  signature_status    TEXT NOT NULL DEFAULT 'unsigned'
                      CHECK (signature_status IN ('unsigned','unverified','verified','invalid')),
  signature_subject   TEXT,
  signature_issuer    TEXT,
  UNIQUE (skill_id, version)
);
CREATE INDEX idx_sv_skill      ON skill_versions (skill_id);
CREATE INDEX idx_sv_fingerprint ON skill_versions (fingerprint);
CREATE INDEX idx_sv_sha256     ON skill_versions (sha256_hash);
CREATE INDEX idx_sv_created    ON skill_versions (created_at);

-- File bytes for each skill version. Replaces upstream's per-version git commit.
CREATE TABLE skill_version_files (
  version_id   TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  size         INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  content_type TEXT,
  content      BLOB NOT NULL,
  PRIMARY KEY (version_id, path)
);
CREATE INDEX idx_svf_seq ON skill_version_files (version_id, seq);

CREATE TABLE skill_slug_aliases (
  id           TEXT PRIMARY KEY,
  skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  namespace_id TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  old_slug     TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  UNIQUE (namespace_id, old_slug)
);
CREATE INDEX idx_ssa_skill ON skill_slug_aliases (skill_id);

-- ── plugins ──────────────────────────────────────────────────────────────────
CREATE TABLE plugins (
  id                TEXT PRIMARY KEY,
  slug              TEXT NOT NULL,
  display_name      TEXT,
  summary           TEXT,
  owner_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  namespace_id      TEXT NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  latest_version_id TEXT,
  visibility        TEXT NOT NULL DEFAULT 'private'
                    CHECK (visibility IN ('private','public')),
  moderation_status TEXT NOT NULL DEFAULT 'approved'
                    CHECK (moderation_status IN ('approved','pending_review','rejected')),
  category          TEXT NOT NULL DEFAULT 'general',
  tags              TEXT NOT NULL DEFAULT '[]',
  downloads         INTEGER NOT NULL DEFAULT 0,
  stars_count       INTEGER NOT NULL DEFAULT 0,
  versions_count    INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  soft_deleted_at   TEXT,
  UNIQUE (namespace_id, slug)
);
CREATE INDEX idx_plugins_owner     ON plugins (owner_id);
CREATE INDEX idx_plugins_namespace ON plugins (namespace_id);
CREATE INDEX idx_plugins_created   ON plugins (created_at);
CREATE INDEX idx_plugins_updated   ON plugins (updated_at);

CREATE TABLE plugin_versions (
  id              TEXT PRIMARY KEY,
  plugin_id       TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  version         TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,
  manifest        TEXT NOT NULL DEFAULT '{}',
  files           TEXT NOT NULL DEFAULT '[]',
  changelog       TEXT,
  created_by      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sha256_hash     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'ready',
  created_at      TEXT NOT NULL,
  soft_deleted_at TEXT,
  yanked_at       TEXT,
  yank_reason     TEXT,
  UNIQUE (plugin_id, version)
);
CREATE INDEX idx_pv_plugin      ON plugin_versions (plugin_id);
CREATE INDEX idx_pv_fingerprint ON plugin_versions (fingerprint);

CREATE TABLE plugin_version_files (
  version_id   TEXT NOT NULL REFERENCES plugin_versions(id) ON DELETE CASCADE,
  path         TEXT NOT NULL,
  seq          INTEGER NOT NULL,
  size         INTEGER NOT NULL,
  sha256       TEXT NOT NULL,
  content_type TEXT,
  content      BLOB NOT NULL,
  PRIMARY KEY (version_id, path)
);
CREATE INDEX idx_pvf_seq ON plugin_version_files (version_id, seq);

-- ── tokens ───────────────────────────────────────────────────────────────────
CREATE TABLE api_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  namespace_id TEXT REFERENCES namespaces(id) ON DELETE CASCADE,
  label        TEXT,
  prefix       TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,
  scope        TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full','read','publish')),
  last_used_at TEXT,
  expires_at   TEXT,
  created_at   TEXT NOT NULL,
  revoked_at   TEXT
);
CREATE INDEX idx_tokens_user      ON api_tokens (user_id);
CREATE INDEX idx_tokens_namespace ON api_tokens (namespace_id);
CREATE INDEX idx_tokens_prefix    ON api_tokens (prefix);

-- ── social ───────────────────────────────────────────────────────────────────
CREATE TABLE stars (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id   TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, skill_id)
);
CREATE INDEX idx_stars_skill ON stars (skill_id);

CREATE TABLE ratings (
  id         TEXT PRIMARY KEY,
  skill_id   TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score      INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (skill_id, user_id)
);
CREATE INDEX idx_ratings_skill ON ratings (skill_id);

CREATE TABLE comments (
  id              TEXT PRIMARY KEY,
  skill_id        TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  soft_deleted_at TEXT
);
CREATE INDEX idx_comments_skill ON comments (skill_id);
CREATE INDEX idx_comments_user  ON comments (user_id);

CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  is_read    INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications (user_id);
CREATE INDEX idx_notifications_created ON notifications (created_at);

-- ── ops ──────────────────────────────────────────────────────────────────────
CREATE TABLE download_dedupes (
  id            TEXT PRIMARY KEY,
  skill_id      TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  version_id    TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE,
  identity_hash TEXT NOT NULL,
  downloaded_at TEXT NOT NULL,
  UNIQUE (skill_id, version_id, identity_hash)
);
CREATE INDEX idx_dedup_skill ON download_dedupes (skill_id);

CREATE TABLE audit_logs (
  id            TEXT PRIMARY KEY,
  actor_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id   TEXT,
  details       TEXT,
  ip_address    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_audit_actor   ON audit_logs (actor_id);
CREATE INDEX idx_audit_created ON audit_logs (created_at);

CREATE TABLE skill_daily_stats (
  id          TEXT PRIMARY KEY,
  skill_id    TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  downloads   INTEGER NOT NULL DEFAULT 0,
  installs    INTEGER NOT NULL DEFAULT 0,
  stars_delta INTEGER NOT NULL DEFAULT 0,
  UNIQUE (skill_id, date)
);

CREATE TABLE reserved_slugs (
  slug       TEXT PRIMARY KEY,
  reason     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE skill_ownership_transfers (
  id           TEXT PRIMARY KEY,
  skill_id     TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL,
  to_user_id   TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending',
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);

CREATE TABLE oauth_identities (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider    TEXT NOT NULL,
  external_id TEXT NOT NULL,
  email       TEXT,
  avatar_url  TEXT,
  created_at  TEXT NOT NULL,
  UNIQUE (provider, external_id)
);
CREATE INDEX idx_oauth_user ON oauth_identities (user_id);

-- ── search index (FTS5) ──────────────────────────────────────────────────────
-- Replaces Bleve. The six leading columns are the analysed/full-text fields;
-- everything after them is UNINDEXED — stored and filterable, but not tokenised,
-- so filters like visibility / moderation_status / doc_type stay cheap.
--
-- tokenize='trigram' is chosen over the default 'unicode61' because it makes
-- CJK substring matching work (upstream Bleve used a CJK-aware analyser).
-- Trigrams require a query of >= 3 characters; the search service falls back to
-- a LIKE scan for shorter queries.
CREATE VIRTUAL TABLE search_docs USING fts5(
  slug,
  display_name,
  summary,
  skill_md_content,
  tags,
  owner_handle,
  doc_id        UNINDEXED,
  doc_type      UNINDEXED,
  target_id     UNINDEXED,
  category      UNINDEXED,
  namespace_slug UNINDEXED,
  visibility    UNINDEXED,
  moderation_status UNINDEXED,
  is_suspicious UNINDEXED,
  is_deleted    UNINDEXED,
  downloads     UNINDEXED,
  stars         UNINDEXED,
  updated_at    UNINDEXED,
  created_at    UNINDEXED,
  tokenize = 'trigram'
);
`

export const MIGRATIONS: Migration[] = [
  { v: 1, name: 'initial schema', sql: INITIAL_SCHEMA },
  {
    v: 2,
    name: 'featured skills',
    sql: `
      CREATE TABLE featured_skills (
        skill_id TEXT PRIMARY KEY REFERENCES skills(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX idx_featured_skills_position ON featured_skills(position);
    `,
  },
  {
    // Bilingual catalogue: an optional English variant for every skill/plugin
    // display name and summary. Columns stay NULL when no English text exists
    // (e.g. user-published entries), and the UI falls back to the base value.
    v: 3,
    name: 'english display name and summary',
    sql: `
      ALTER TABLE skills ADD COLUMN display_name_en TEXT;
      ALTER TABLE skills ADD COLUMN summary_en TEXT;
      ALTER TABLE plugins ADD COLUMN display_name_en TEXT;
      ALTER TABLE plugins ADD COLUMN summary_en TEXT;
    `,
  },
  {
    // Admin-issued API keys. Deliberately separate from `api_tokens`: those are
    // a user's personal credentials (session-ish, `clh_` prefix, broad scope)
    // while these are minted for one job — driving the skill catalogue over
    // HTTP — carry per-endpoint capabilities, and are listed/revoked from the
    // admin console as their own resource.
    v: 4,
    name: 'admin api keys',
    sql: `
      CREATE TABLE api_keys (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        created_by   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        namespace_id TEXT REFERENCES namespaces(id) ON DELETE CASCADE,
        prefix       TEXT NOT NULL,
        key_hash     TEXT NOT NULL UNIQUE,
        scopes       TEXT NOT NULL DEFAULT '[]',
        last_used_at TEXT,
        expires_at   TEXT,
        created_at   TEXT NOT NULL,
        revoked_at   TEXT
      );
      CREATE INDEX idx_api_keys_creator  ON api_keys (created_by);
      CREATE INDEX idx_api_keys_prefix   ON api_keys (prefix);
      CREATE INDEX idx_api_keys_namespace ON api_keys (namespace_id);
    `,
  },
  {
    // Rich detail text for a skill, rendered on its detail page instead of
    // SKILL.md when present. Kept out of `skill_versions` deliberately: it is
    // presentation, not versioned content, so correcting it must not require
    // publishing a new release. Stored already sanitised (see lib/sanitizeHtml).
    v: 5,
    name: 'skill detail html',
    sql: `
      ALTER TABLE skills ADD COLUMN detail_html TEXT;
      ALTER TABLE skills ADD COLUMN detail_html_updated_at TEXT;
    `,
  },
]

/** Slugs that may never be used as a skill/plugin slug (`seedReservedSlugs`). */
export const SEED_RESERVED_SLUGS = [
  'admin',
  'api',
  'auth',
  'login',
  'register',
  'search',
  'settings',
  'system',
  'help',
  'about',
]

export const RESERVED_SLUG_REASON = 'system reserved'
