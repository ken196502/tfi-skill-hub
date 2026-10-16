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
 *    bytes in `skill_version_files`. The `gitCommitHash`
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
-- Kept here verbatim for historical fidelity: plugins were a separate content
-- type in the Go original and this is migration v1. They are dropped entirely by
-- migration 13 — see that entry for why.
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
-- so filters like listing / doc_type stay cheap.
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
    // Admin-issued API keys. These are the only programmatic credential: they
    // are minted for one job — driving the skill catalogue over HTTP —
    // carry per-endpoint capabilities, and are listed/revoked from the admin
    // console as their own resource.
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
  {
    // English variant of the rich detail text, mirroring the v3 bilingual
    // catalogue columns. NULL means no English body yet — the page falls back
    // to the Chinese detail_html (or SKILL.md when that is missing too).
    v: 6,
    name: 'skill detail html (english)',
    sql: `
      ALTER TABLE skills ADD COLUMN detail_html_en TEXT;
      ALTER TABLE skills ADD COLUMN detail_html_en_updated_at TEXT;
    `,
  },
  {
    // Self-service registration queues an account for an admin decision. Only
    // accounts created through the public registration form start out
    // 'pending'; the NOT NULL DEFAULT backfills every existing row to
    // 'approved', so no account that works today changes behaviour.
    //
    // A rejected account is kept rather than deleted: the decision stays
    // auditable, and the handle cannot be silently re-registered.
    v: 7,
    name: 'user review status',
    sql: `
      ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'
        CHECK (status IN ('pending','approved','rejected'));
      ALTER TABLE users ADD COLUMN review_note TEXT;
      ALTER TABLE users ADD COLUMN reviewed_at TEXT;
      ALTER TABLE users ADD COLUMN reviewed_by TEXT;
      CREATE INDEX idx_users_status ON users (status);
    `,
  },
  {
    // People hold one of two roles: admin or user. The inherited 'moderator'
    // role had no administrative surface (no /admin/* route accepted it), so an
    // early install that still carries such an account folds it back into a
    // plain user rather than leaving a state the code no longer honours.
    //
    // The column's CHECK still lists the old value: SQLite cannot drop a
    // constraint without rebuilding the table, and rebuilding `users` would
    // cascade through every table that references it. The rule is enforced
    // where roles enter the database instead (VALID_ROLES).
    v: 8,
    name: 'drop the moderator role',
    sql: `
      UPDATE users SET role = 'user', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
        WHERE role = 'moderator';
    `,
  },
  {
    // Speeds up the "is this email already registered?" lookup used by public
    // registration and admin user creation. Uniqueness is enforced in the
    // service layer (a plain, non-unique index keeps installs that already hold
    // rows with a NULL/blank email valid, and avoids breaking the migration on a
    // database that happens to contain duplicate addresses).
    v: 9,
    name: 'index users by email',
    sql: `
      CREATE INDEX idx_users_email ON users (email);
    `,
  },
  {
    // The admin console builds a ready-to-run usage sheet for any key in the
    // list, so the value has to survive past creation. This registry only
    // guards skill documents, and anyone who can read this table can already
    // mint a fresh key, so keeping the plaintext alongside the hash buys
    // convenience without widening the attack surface. `key_hash` remains the
    // only thing verification reads; this column is for display and copying.
    // Rows minted before this migration keep NULL and simply fall back to a
    // placeholder in the console.
    v: 10,
    name: 'store api key plaintext',
    sql: `
      ALTER TABLE api_keys ADD COLUMN key_secret TEXT;
    `,
  },
  {
    // Personal and team tokens are gone — the admin-issued API key in
    // `api_keys` is now the only programmatic credential. But `api_tokens`
    // was also the session store: `login` wrote a `web-session` row and the
    // cookie carried it. Those rows move into a dedicated `sessions` table so
    // nobody is logged out, and everything else — personal tokens, team
    // tokens, and the device-flow / agent-provisioning rows that existed only
    // to hand a bearer credential out — is dropped with the table.
    v: 11,
    name: 'sessions replace personal and team tokens',
    sql: `
      CREATE TABLE sessions (
        id           TEXT PRIMARY KEY,
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prefix       TEXT NOT NULL,
        token_hash   TEXT NOT NULL UNIQUE,
        last_used_at TEXT,
        expires_at   TEXT,
        created_at   TEXT NOT NULL
      );
      CREATE INDEX idx_sessions_user   ON sessions (user_id);
      CREATE INDEX idx_sessions_prefix ON sessions (prefix);
      INSERT INTO sessions (id, user_id, prefix, token_hash, last_used_at, expires_at, created_at)
        SELECT id, user_id, prefix, token_hash, last_used_at, expires_at, created_at
          FROM api_tokens
         WHERE label = 'web-session' AND revoked_at IS NULL;
      DROP TABLE api_tokens;
    `,
  },
  {
    // Who the account belongs to. Registration collects this so an admin can
    // judge an application from the person's actual context — who they are,
    // where they sit, and what they intend to research — instead of a handle
    // and an email address.
    //
    // Every column is nullable and no existing row is touched: accounts created
    // by the bootstrap admin, by the admin console, or before this migration
    // simply carry no profile and render as "not provided". `display_name`
    // already existed and is reused as the person's real name (姓名), so no
    // second name column is added.
    //
    // `markets` holds a JSON array of slugs from the shared catalogue in
    // `lib/registration.ts` — fixed values, so it can be filtered on later.
    v: 12,
    name: 'user profile',
    sql: `
      ALTER TABLE users ADD COLUMN country TEXT;
      ALTER TABLE users ADD COLUMN organization TEXT;
      ALTER TABLE users ADD COLUMN job_title TEXT;
      ALTER TABLE users ADD COLUMN office_location TEXT;
      ALTER TABLE users ADD COLUMN research_needs TEXT;
      ALTER TABLE users ADD COLUMN markets TEXT NOT NULL DEFAULT '[]';
    `,
  },
{
    // A skill now has exactly three operations: publish, edit, and take it
    // on/off the shelf. Two concepts that stood on their own are gone:
    //
    //   * **Public vs private.** `visibility` existed to say who may see a
    //     skill, but the admin console had long been reading that same column
    //     as on-shelf/off-shelf — one column doing two jobs. It is now purely
    //     the latter: `listing` is `listed` or `unlisted`, and "everyone can
    //     see a listed skill" is a property of the catalogue, not a per-skill
    //     setting anyone chooses.
    //   * **Skill review.** `moderation_status` was a three-state queue fed by
    //     an author's "request public" call and drained by an admin. With no
    //     public/private distinction there is nothing left to review, so the
    //     column and both endpoints go away.
    //
    // `namespaces.default_visibility` moves with it: it existed only to decide
    // what a newly published skill inherited, and now says whether the
    // namespace's skills start on or off the shelf.
    //
    // SQLite cannot alter a CHECK constraint in place, so each column is added
    // with its new constraint, backfilled, and the old one dropped. The FTS5
    // table cannot be altered at all, so it is rebuilt and repopulated — the
    // document set is derived state and is rebuilt from the source tables
    // rather than translated row by row.
    v: 13,
    name: 'skills are listed or unlisted; no review queue',
    sql: `
      -- Dropping the plugin tables is irreversible, so refuse to do it blind.
      -- The CHECK (must_be_zero = 0) trick is the only way to abort a migration
      -- from pure SQL: inserting a non-zero count violates the constraint, which
      -- rolls the whole migration back and leaves the database at v12 untouched.
      -- An operator who really wants the rows gone can drop the three tables by
      -- hand and re-run — a destructive decision deserves to be deliberate.
      CREATE TEMP TABLE _skillhub_migrate_guard (
        must_be_zero INTEGER NOT NULL CHECK (must_be_zero = 0)
      );
      INSERT INTO _skillhub_migrate_guard (must_be_zero)
        SELECT (SELECT COUNT(*) FROM plugins)
             + (SELECT COUNT(*) FROM plugin_versions)
             + (SELECT COUNT(*) FROM plugin_version_files);
      DROP TABLE _skillhub_migrate_guard;

      DROP TABLE IF EXISTS plugin_version_files;
      DROP TABLE IF EXISTS plugin_versions;
      DROP TABLE IF EXISTS plugins;

      ALTER TABLE namespaces ADD COLUMN default_listing TEXT NOT NULL DEFAULT 'unlisted'
        CHECK (default_listing IN ('listed','unlisted'));
      UPDATE namespaces SET default_listing =
        CASE WHEN default_visibility = 'public' THEN 'listed' ELSE 'unlisted' END;
      ALTER TABLE namespaces DROP COLUMN default_visibility;

      ALTER TABLE skills ADD COLUMN listing TEXT NOT NULL DEFAULT 'unlisted'
        CHECK (listing IN ('listed','unlisted'));
      UPDATE skills SET listing =
        CASE WHEN visibility = 'public' THEN 'listed' ELSE 'unlisted' END;
      ALTER TABLE skills DROP COLUMN visibility;
      ALTER TABLE skills DROP COLUMN moderation_status;

      DROP TABLE IF EXISTS search_docs;
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
        listing       UNINDEXED,
        is_suspicious UNINDEXED,
        is_deleted    UNINDEXED,
        downloads     UNINDEXED,
        stars         UNINDEXED,
        updated_at    UNINDEXED,
        created_at    UNINDEXED,
        tokenize = 'trigram'
      );
      INSERT INTO search_docs
        (slug, display_name, summary, skill_md_content, tags, owner_handle,
         doc_id, doc_type, target_id, category, namespace_slug, listing,
         is_suspicious, is_deleted, downloads, stars, updated_at, created_at)
      SELECT s.slug,
             COALESCE(s.display_name, s.slug),
             COALESCE(s.summary, ''),
             COALESCE((SELECT CAST(f.content AS TEXT) FROM skill_version_files f
                        WHERE f.version_id = s.latest_version_id AND f.path = 'SKILL.md'), ''),
             COALESCE(s.tags, ''),
             COALESCE(u.handle, ''),
             s.id, 'skill', s.id, s.category, COALESCE(n.slug, ''),
             s.listing,
             -- Carried across from the row rather than defaulted: a flagged
             -- skill must stay flagged in the index, exactly as
             -- reindexSkill would write it.
             s.is_suspicious,
             -- Soft-deleted skills stay in the index, flagged -- that is what
             -- reindexSkill writes for them, and search filters on this
             -- column. Dropping the rows instead would leave is_deleted
             -- permanently 0 and make the column a lie.
             CASE WHEN s.soft_deleted_at IS NULL THEN 0 ELSE 1 END,
             s.downloads,
             s.stars_count,
             -- The index sorts by these. Reindexing through the service layer
             -- would store Date.parse(...), i.e. epoch milliseconds, so they
             -- are converted the same way here rather than reset to 0 — a
             -- search sorted by "recently updated" would otherwise come back in
             -- arbitrary order after the upgrade. julianday reads the ISO-8601
             -- strings directly; the epoch offset is the 1970-01-01 constant.
             CAST((julianday(s.updated_at) - 2440587.5) * 86400000 AS INTEGER),
             CAST((julianday(s.created_at) - 2440587.5) * 86400000 AS INTEGER)
        FROM skills s
        JOIN users u ON u.id = s.owner_id
        LEFT JOIN namespaces n ON n.id = s.namespace_id;
    `,
  },
  {
    // Two activity counters for the admin console's user list.
    //
    // **Downloads.** A skill's `downloads` column says how popular the skill is,
    // and it is de-duplicated by the downloader's IP hash (`download_dedupes`) —
    // enough to stop one person inflating a skill, but it answers nothing about
    // *who* is downloading. The console asks the other question, so a download
    // by a signed-in account is now also logged here against that account. The
    // unique key keeps the same discipline as `download_dedupes`: one row per
    // person per version, so re-fetching a bundle you already have does not pad
    // the figure. Anonymous downloads are not attributable and stay unrecorded.
    //
    // **Sign-ins.** Counted in a column on `users` rather than derived from
    // `sessions`, whose rows describe *live credentials*: a count over them would
    // silently change meaning the day sessions are pruned or rotated. Existing
    // history is backfilled from the session rows that exist, so accounts that
    // have already signed in do not read as zero.
    v: 14,
    name: 'per-user download log and sign-in counter',
    sql: `
      CREATE TABLE user_downloads (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        skill_id      TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        version_id    TEXT NOT NULL REFERENCES skill_versions(id) ON DELETE CASCADE,
        downloaded_at TEXT NOT NULL,
        UNIQUE (user_id, skill_id, version_id)
      );
      CREATE INDEX idx_user_downloads_user ON user_downloads (user_id);

      ALTER TABLE users ADD COLUMN login_count INTEGER NOT NULL DEFAULT 0;
      UPDATE users SET login_count =
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = users.id);
    `,
  },
]

/** Slugs that may never be used as a skill slug (`seedReservedSlugs`). */
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
