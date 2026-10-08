-- ─────────────────────────────────────────────────────────────────────────────
-- 重建 users 表（保留全部行，收紧 role 约束，补齐 v7/v8 的列）
--
-- 什么时候需要它
--   只为「让数据库自己也拒绝旧角色」这一件事：`role` 的 CHECK 里原本还留着
--   已被删除的 'moderator'。SQLite 不能单独删约束，只能重建表。功能上并非必需——
--   应用层（VALID_ROLES）已经在写入侧挡住了。日常升级不需要跑这个脚本：
--   服务启动时会自动执行 v7 / v8 迁移。
--
-- ⚠️ 风险：users 是父表，namespaces / skills / api_tokens / audit_logs 等 15 张表
--   都是 `REFERENCES users(id) ON DELETE CASCADE`。开着外键直接 DROP TABLE users
--   会把该账号名下的技能连同版本、文件、搜索索引一起删掉。本脚本靠「事务外先关外键」
--   规避，**不要**把它拆开单步执行。
--
-- 用之前先确认版本：
--   sqlite3 "$DB" "PRAGMA user_version; SELECT sql FROM sqlite_master WHERE name='users';"
--   · 还是 6（users 里没有 status 列）→ 直接用本脚本，它同时完成 v7/v8 的效果。
--   · 已经是 8 且库里可能有「待审核 / 已驳回」的用户 → **不要用本脚本**：
--     它把 status 一律写成 'approved'，会把这批账号一起放行。这种情况找我改成保留列的版本。
--
-- 用法（宿主机，容器必须先停；在仓库根目录执行）：
--   docker compose stop skillhub
--   DB=/var/lib/docker/volumes/tfi-skill-hub_skillhub-data/_data/skillhub.db
--   for f in "" -wal -shm; do [ -f "$DB$f" ] && cp -a "$DB$f" "$DB$f.bak.$(date +%F-%H%M)"; done   # 三个文件都要备份
--   sqlite3 "$DB" < scripts/rebuild-users-table.sql
--   sqlite3 "$DB" "PRAGMA foreign_key_check; PRAGMA integrity_check;"    # 只应输出 ok
--   docker compose start skillhub
--
-- 已在真实库副本上验证（v6 → 本脚本 → 启动）：行数逐表不变、口令哈希逐字节保留、
-- 技能目录 38 个完好、注册/登录/审核全部可用、写入 'moderator' 被 CHECK 拒绝。
-- ─────────────────────────────────────────────────────────────────────────────

-- ① 关外键：必须在事务外执行 —— PRAGMA foreign_keys 在事务内是 no-op。
PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE users_new (
  id            TEXT PRIMARY KEY,
  handle        TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  email         TEXT,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','agent')),
  status        TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  is_banned     INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0,1)),
  ban_reason    TEXT,
  review_note   TEXT,
  reviewed_at   TEXT,
  reviewed_by   TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- 逐列搬运。旧角色 moderator 就地降级为 user（等价于 v8 迁移），
-- 其余账号补 status = 'approved'（等价于 v7 迁移的默认值）。
INSERT INTO users_new
  (id, handle, display_name, avatar_url, email, password_hash,
   role, status, is_banned, ban_reason,
   review_note, reviewed_at, reviewed_by, created_at, updated_at)
SELECT
   id, handle, display_name, avatar_url, email, password_hash,
   CASE WHEN role = 'moderator' THEN 'user' ELSE role END,
   'approved', is_banned, ban_reason,
   NULL, NULL, NULL, created_at, updated_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 索引随表一起被删掉，必须重建（两个 sqlite_autoindex_* 由 PK / UNIQUE 自动恢复）
CREATE INDEX idx_users_role   ON users (role);
CREATE INDEX idx_users_status ON users (status);

-- 追平迁移版本：不改这行的话，服务启动时 v7 的 ALTER TABLE ADD COLUMN status
-- 会因为「列已存在」而报错，容器直接起不来。
PRAGMA user_version = 8;

COMMIT;

-- ② 校验：以下两条都不应该有除 "ok" 之外的输出
PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
