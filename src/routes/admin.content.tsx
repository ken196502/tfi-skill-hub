import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminCreateSkill,
  adminListSkills,
  adminRemoveSkill,
  adminSetSkillVisibility,
  adminUpdateSkill,
  categories,
  getSkill,
  type AdminSkillInput,
} from '../lib/api'
import { useSession } from '../lib/auth'
import { useLang, useT, localizedName } from '../lib/i18n'
import { AdminNav } from '../components/AdminShell'
import { FileDropzone } from '../components/FileDropzone'
import { RichTextEditor } from '../components/RichTextEditor'
import { ErrorBox, Loading, PageHeader, formatDate, skillPath } from '../components/ui'
import type { SkillWithOwner } from '../lib/types'

export const Route = createFileRoute('/admin/content')({ component: ContentPage })

const PAGE_SIZE = 20

/** `''` shows everything; `pending` means offline but not yet decided on. */
type StatusFilter = '' | 'public' | 'private' | 'pending'

type RowStatus = 'public' | 'private' | 'pending'

/**
 * What the row's chip says. A skill that was submitted for public listing but
 * never acted on reads as its own state, so it is obvious which rows still want
 * a decision — that is the whole job the old review queue used to do.
 */
function rowStatus(skill: SkillWithOwner): RowStatus {
  if (skill.visibility === 'public') return 'public'
  return skill.moderationStatus === 'pending_review' ? 'pending' : 'private'
}

const STATUS_LABEL: Record<RowStatus, [string, string]> = {
  public: ['已上架', 'Online'],
  private: ['已下架', 'Offline'],
  pending: ['待上架', 'Awaiting publication'],
}

const STATUS_TONE: Record<RowStatus, string> = {
  public: 'success',
  // Offline is a resting state, not a problem; waiting on a decision is the one
  // that wants the eye.
  private: 'neutral',
  pending: 'warning',
}

/** The form's own shape: tags are edited as text, so they stay out of it. */
type Draft = Omit<AdminSkillInput, 'slug' | 'tags'> & { slug: string }

const EMPTY_DRAFT: Draft = {
  slug: '',
  displayName: '',
  summary: '',
  displayNameEn: '',
  summaryEn: '',
  category: 'general',
  visibility: 'private',
  html: '',
  htmlEn: '',
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/

function draftFromSkill(skill: SkillWithOwner, withBody = false): Draft {
  return {
    slug: skill.slug,
    displayName: skill.displayName ?? '',
    summary: skill.summary ?? '',
    displayNameEn: skill.displayNameEn ?? '',
    summaryEn: skill.summaryEn ?? '',
    category: skill.category || 'general',
    visibility: skill.visibility,
    // The list never carries the body; only the detail fetch does.
    html: withBody ? (skill.detailHtml ?? '') : '',
    htmlEn: withBody ? (skill.detailHtmlEn ?? '') : '',
  }
}

function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''))]
}

/**
 * Options for the category select.
 *
 * `/categories` advertises a short taxonomy, but the loaded records are the
 * truth about what this catalogue actually uses (the seeded skills are filed
 * under design, research, documentation and writing). Offering only the
 * advertised four would leave the select showing a category the record does not
 * have — and then write that wrong value on save.
 */
function categoryOptions(declared: string[], inUse: string[], current: string): string[] {
  const seen = new Set<string>()
  const options: string[] = []
  for (const value of [...declared, ...[...inUse].sort(), current]) {
    const label = value.trim()
    if (label === '' || seen.has(label)) continue
    seen.add(label)
    options.push(label)
  }
  return options
}

function ContentPage() {
  const { user, booting } = useSession()
  const t = useT()
  const client = useQueryClient()

  const [filter, setFilter] = useState<StatusFilter>('')
  const [page, setPage] = useState(1)
  /** `{ skill: null }` opens the dialog in create mode. */
  const [editing, setEditing] = useState<{ skill: SkillWithOwner | null } | null>(null)
  const [removing, setRemoving] = useState<SkillWithOwner | null>(null)

  const isAdmin = user !== null && user.role === 'admin'

  const list = useQuery({
    queryKey: ['admin-content-skills', filter, page],
    queryFn: () => adminListSkills({ visibility: filter, page, pageSize: PAGE_SIZE }),
    enabled: isAdmin,
  })

  function refreshCatalogue() {
    void client.invalidateQueries({ queryKey: ['admin-content-skills'] })
    void client.invalidateQueries({ queryKey: ['skills'] })
    void client.invalidateQueries({ queryKey: ['skill'] })
    void client.invalidateQueries({ queryKey: ['features'] })
  }

  const toggle = useMutation({
    mutationFn: (input: { ref: string; visibility: 'public' | 'private' }) =>
      adminSetSkillVisibility(input.ref, input.visibility),
    onSuccess: refreshCatalogue,
  })
  const remove = useMutation({
    mutationFn: (ref: string) => adminRemoveSkill(ref),
    onSuccess: () => {
      setRemoving(null)
      refreshCatalogue()
    },
  })

  const rows = list.data?.data ?? []
  const total = list.data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const mutationError = toggle.error ?? remove.error

  /** Every category the loaded page actually uses, for the dialog's select. */
  const categoriesInUse = useMemo(
    () => [...new Set(rows.map((row) => row.category).filter((value) => value !== ''))],
    [rows],
  )

  // Filtering down, or deleting the last row of a page, can leave the cursor
  // past the end of the result set.
  useEffect(() => {
    if (list.data !== undefined && page > totalPages) setPage(totalPages)
  }, [list.data, page, totalPages])

  if (booting) return <Loading />
  if (!isAdmin) return <Navigate to="/login" />

  return (
    <div className="container page-container">
      <AdminNav active="content" />
      <PageHeader
        title={t('内容管理', 'Content management')}
        subtitle={t('维护技能的展示信息与详情内容，可随时上架、下架或删除。', 'Maintain skill details and rich content; take skills online, offline, or remove them.')}
      />

      <div className="admin-toolbar admin-toolbar-spaced">
        <div className="admin-filter-group">
          {([
            ['', t('全部', 'All')],
            ['public', t('已上架', 'Online')],
            ['private', t('已下架', 'Offline')],
            ['pending', t('待上架', 'Awaiting publication')],
          ] as Array<[StatusFilter, string]>).map(([value, label]) => (
            <button
              key={value || 'all'}
              className={`filter-btn${filter === value ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setFilter(value)
                setPage(1)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-small" type="button" onClick={() => setEditing({ skill: null })}>
          {t('新建技能', 'New skill')}
        </button>
      </div>

      {mutationError && (
        <ErrorBox
          message={mutationError instanceof Error
            ? mutationError.message
            : t('操作失败，请重试。', 'That did not work. Please try again.')}
        />
      )}

      {list.isLoading
        ? <Loading />
        : list.isError
          ? <ErrorBox message={t('加载技能列表失败，请稍后重试。', 'Could not load the skill list. Please try again later.')} />
          : (
            <SkillTable
              rows={rows}
              pendingRef={toggle.isPending ? toggle.variables?.ref : undefined}
              onEdit={(skill) => setEditing({ skill })}
              onToggle={(skill) => toggle.mutate({
                ref: skillPath(skill),
                visibility: rowStatus(skill) === 'public' ? 'private' : 'public',
              })}
              onRemove={setRemoving}
            />
          )}

      {total > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          onChange={setPage}
        />
      )}

      {editing && (
        <SkillDialog
          skill={editing.skill}
          categoriesInUse={categoriesInUse}
          onClose={() => setEditing(null)}
          onSaved={refreshCatalogue}
        />
      )}

      {removing && (
        <RemoveDialog
          skill={removing}
          busy={remove.isPending}
          error={remove.error}
          onCancel={() => setRemoving(null)}
          onConfirm={() => remove.mutate(skillPath(removing))}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Table
// ─────────────────────────────────────────────────────────────────────────────

function SkillTable({
  rows,
  pendingRef,
  onEdit,
  onToggle,
  onRemove,
}: {
  rows: SkillWithOwner[]
  pendingRef: string | undefined
  onEdit: (skill: SkillWithOwner) => void
  onToggle: (skill: SkillWithOwner) => void
  onRemove: (skill: SkillWithOwner) => void
}) {
  const { lang } = useLang()
  const t = useT()

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>{t('技能', 'Skill')}</th>
            <th>{t('作者', 'Author')}</th>
            <th>{t('状态', 'Status')}</th>
            <th>{t('更新时间', 'Updated')}</th>
            <th>{t('操作', 'Actions')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((skill) => {
            const status = rowStatus(skill)
            const ref = skillPath(skill)
            const busy = pendingRef === ref
            return (
              <tr key={skill.id}>
                <td>
                  <strong>{localizedName(skill, lang)}</strong>
                  <small className="admin-cell-sub">{ref}{skill.category ? ` · ${skill.category}` : ''}</small>
                </td>
                <td>{skill.ownerHandle}</td>
                <td>
                  <span className={`admin-status admin-status-${STATUS_TONE[status]}`}>
                    {t(STATUS_LABEL[status][0], STATUS_LABEL[status][1])}
                  </span>
                </td>
                <td className="muted">{formatDate(skill.updatedAt)}</td>
                <td>
                  <div className="admin-actions">
                    <button className="btn btn-secondary btn-small" type="button" onClick={() => onEdit(skill)}>
                      {t('编辑', 'Edit')}
                    </button>
                    <button
                      className="btn btn-secondary btn-small"
                      type="button"
                      disabled={busy}
                      onClick={() => onToggle(skill)}
                    >
                      {status === 'public' ? t('下架', 'Take offline') : t('上架', 'Take online')}
                    </button>
                    <button className="btn btn-danger btn-small" type="button" onClick={() => onRemove(skill)}>
                      {t('删除', 'Delete')}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="admin-empty">
                {t('当前筛选下没有技能。', 'No skills match the current filter.')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Page numbers around the current one, so long catalogues stay compact. */
function pageWindow(current: number, totalPages: number): number[] {
  const size = Math.min(5, totalPages)
  const start = Math.min(
    Math.max(1, current - Math.floor(size / 2)),
    Math.max(1, totalPages - size + 1),
  )
  return Array.from({ length: size }, (_, index) => start + index)
}

function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number
  totalPages: number
  total: number
  onChange: (page: number) => void
}) {
  const t = useT()
  const pages = useMemo(() => pageWindow(page, totalPages), [page, totalPages])

  return (
    <nav className="admin-pagination" aria-label={t('分页', 'Pagination')}>
      <span className="admin-pagination-info">
        {t(`第 ${page} / ${totalPages} 页`, `Page ${page} of ${totalPages}`)}
        <em>{t(`共 ${total} 条`, `${total} total`)}</em>
      </span>
      <div className="admin-pagination-controls">
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          {t('上一页', 'Previous')}
        </button>
        {pages.map((value) => (
          <button
            key={value}
            className={`admin-page-btn${value === page ? ' active' : ''}`}
            type="button"
            aria-current={value === page ? 'page' : undefined}
            onClick={() => onChange(value)}
          >
            {value}
          </button>
        ))}
        <button
          className="btn btn-secondary btn-small"
          type="button"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          {t('下一页', 'Next')}
        </button>
      </div>
    </nav>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Dialogs
// ─────────────────────────────────────────────────────────────────────────────

function Modal({
  title,
  size = 'default',
  onClose,
  children,
}: {
  title: string
  size?: 'default' | 'wide'
  onClose: () => void
  children: ReactNode
}) {
  const t = useT()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [onClose])

  return (
    <div
      className="admin-modal-backdrop"
      // Only a click that starts on the backdrop itself dismisses, so a drag
      // that ends outside a text selection does not close the dialog.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className={`admin-modal${size === 'wide' ? ' admin-modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="admin-modal-head">
          <h2>{title}</h2>
          <button
            className="admin-modal-close"
            type="button"
            onClick={onClose}
            aria-label={t('关闭', 'Close')}
          >
            ×
          </button>
        </header>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  )
}

function SkillDialog({
  skill,
  categoriesInUse,
  onClose,
  onSaved,
}: {
  skill: SkillWithOwner | null
  categoriesInUse: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const isEdit = skill !== null
  const ref = skill ? skillPath(skill) : ''

  const [draft, setDraft] = useState<Draft>(() => (skill ? draftFromSkill(skill) : { ...EMPTY_DRAFT }))
  const [tagsText, setTagsText] = useState('')
  const [editLang, setEditLang] = useState<'zh' | 'en'>('zh')
  const [files, setFiles] = useState<File[]>([])
  const [error, setError] = useState('')

  // The body is only on the detail path — a page of skills must not ship every
  // body in full — so editing starts by fetching the one record.
  const detail = useQuery({
    queryKey: ['admin-skill-content', ref],
    queryFn: () => getSkill(ref),
    enabled: isEdit,
    staleTime: 0,
  })

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: categories,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (!detail.data) return
    setDraft(draftFromSkill(detail.data, true))
    setTagsText((detail.data.tags ?? []).join(', '))
  }, [detail.data])

  const save = useMutation({
    mutationFn: (input: AdminSkillInput) =>
      isEdit ? adminUpdateSkill(ref, input, files) : adminCreateSkill(input, files),
    onSuccess: () => {
      onSaved()
      onClose()
    },
    onError: (cause) =>
      setError(cause instanceof Error ? cause.message : t('保存失败，请重试。', 'Could not save. Please try again.')),
  })

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))

  const slug = draft.slug.trim()
  const slugInvalid = !isEdit && slug !== '' && !SLUG_PATTERN.test(slug)
  const missingSlug = !isEdit && slug === ''
  // A new skill needs a SKILL.md to be usable, so an upload without one cannot
  // be saved. Editing does not: the skill already has one, and the point there
  // is usually adding to it.
  const uploadsWithoutSkillMd =
    !isEdit &&
    files.length > 0 &&
    !files.some((file) => file.name === 'SKILL.md' || file.webkitRelativePath.endsWith('SKILL.md'))
  const canSave =
    !missingSlug &&
    !slugInvalid &&
    !uploadsWithoutSkillMd &&
    !save.isPending &&
    (!isEdit || detail.data !== undefined)

  const submit = () => {
    if (!canSave) return
    setError('')
    save.mutate({ ...draft, slug, tags: parseTags(tagsText) })
  }

  return (
    <Modal
      title={isEdit ? t('编辑技能', 'Edit skill') : t('新建技能', 'New skill')}
      size="wide"
      onClose={onClose}
    >
      {isEdit && detail.isLoading
        ? <Loading />
        : detail.isError
          ? <ErrorBox message={t('读取技能内容失败，请重试。', 'Could not read this skill. Please try again.')} />
          : (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                submit()
              }}
            >
              {error && <ErrorBox message={error} />}

              <div className="admin-form-grid admin-form-grid-2">
                <label>
                  <span className="form-label">{t('标识名', 'Identifier')}</span>
                  <input
                    className="form-input"
                    value={draft.slug}
                    readOnly={isEdit}
                    onChange={(event) => set('slug', event.target.value)}
                    placeholder="code-review"
                  />
                  <span className="form-hint">
                    {isEdit
                      ? t('标识名创建后不可更改。', 'The identifier cannot be changed once created.')
                      : t('仅限小写字母、数字和连字符，如 code-review', 'Lowercase letters, digits and hyphens, e.g. code-review')}
                  </span>
                </label>
                <label>
                  <span className="form-label">{t('分类', 'Category')}</span>
                  <select
                    className="form-input"
                    value={draft.category}
                    onChange={(event) => set('category', event.target.value)}
                  >
                    {categoryOptions(categoriesQuery.data?.categories ?? [], categoriesInUse, draft.category).map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <span className="form-hint">{t('决定技能在目录中的归类。', 'Where the skill is filed in the catalogue.')}</span>
                </label>
              </div>

              <div className="admin-form-grid admin-form-grid-2">
                <label>
                  <span className="form-label">{t('标签', 'Tags')}</span>
                  <input
                    className="form-input"
                    value={tagsText}
                    onChange={(event) => setTagsText(event.target.value)}
                    placeholder="coding, automation"
                  />
                  <span className="form-hint">{t('用逗号分隔。', 'Separate with commas.')}</span>
                </label>
                <label>
                  <span className="form-label">{t('可见性', 'Visibility')}</span>
                  <select
                    className="form-input"
                    value={draft.visibility}
                    onChange={(event) => set('visibility', event.target.value)}
                  >
                    <option value="private">{t('下架（不在目录中展示）', 'Offline (hidden from the catalogue)')}</option>
                    <option value="public">{t('上架（所有人可见）', 'Online (visible to everyone)')}</option>
                  </select>
                </label>
              </div>

              {/*
                Everything below belongs to one language, so the switch scopes the
                name, the summary and the body together — the alternative, a
                Chinese field sitting next to its English twin, reads as one field
                split in half. Both languages stay in `draft`, so switching tabs
                (or closing without saving) never drops what was typed.
              */}
              <div className="admin-lang-block">
                <div className="admin-lang-tabs">
                  <span className="form-label">{t('编辑语言', 'Editing language')}</span>
                  <div className="admin-lang-tab-group">
                    <button
                      className={`filter-btn${editLang === 'zh' ? ' active' : ''}`}
                      type="button"
                      onClick={() => setEditLang('zh')}
                    >
                      {t('中文', 'Chinese')}
                    </button>
                    <button
                      className={`filter-btn${editLang === 'en' ? ' active' : ''}`}
                      type="button"
                      onClick={() => setEditLang('en')}
                    >
                      {t('英文', 'English')}
                    </button>
                  </div>
                </div>

                {editLang === 'zh' ? (
                  <>
                    <label className="admin-lang-field">
                      <span className="form-label">{t('显示名称', 'Display name')}</span>
                      <input
                        className="form-input"
                        value={draft.displayName}
                        onChange={(event) => set('displayName', event.target.value)}
                      />
                    </label>
                    <label className="admin-lang-field">
                      <span className="form-label">{t('简介', 'Summary')}</span>
                      <input
                        className="form-input"
                        value={draft.summary}
                        onChange={(event) => set('summary', event.target.value)}
                      />
                    </label>
                    <div className="admin-lang-field">
                      <span className="form-label">{t('详情内容', 'Detail content')}</span>
                      <span className="form-hint admin-form-hint-inline">
                        {t('显示在技能页面的正文。留空时，页面展示技能包自带的说明文件。', 'Shown as the body of the skill page. Leave it empty to show the description file bundled with the skill.')}
                      </span>
                      <RichTextEditor
                        value={draft.html}
                        onChange={(html) => set('html', html)}
                        placeholder={t('介绍这个技能能做什么、怎么用……', 'What this skill does and how to use it…')}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <label className="admin-lang-field">
                      <span className="form-label">{t('显示名称', 'Display name')}</span>
                      <input
                        className="form-input"
                        value={draft.displayNameEn}
                        onChange={(event) => set('displayNameEn', event.target.value)}
                      />
                    </label>
                    <label className="admin-lang-field">
                      <span className="form-label">{t('简介', 'Summary')}</span>
                      <input
                        className="form-input"
                        value={draft.summaryEn}
                        onChange={(event) => set('summaryEn', event.target.value)}
                      />
                    </label>
                    <div className="admin-lang-field">
                      <span className="form-label">{t('详情内容', 'Detail content')}</span>
                      <span className="form-hint admin-form-hint-inline">
                        {t('留空时，英文界面展示中文正文。', 'When empty, the Chinese body is shown in English too.')}
                      </span>
                      <RichTextEditor
                        value={draft.htmlEn}
                        onChange={(html) => set('htmlEn', html)}
                        placeholder={t('英文正文……', 'The body in English…')}
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="admin-lang-block">
                <div className="admin-lang-tabs">
                  <span className="form-label">{t('技能文件', 'Skill files')}</span>
                </div>
                <span className="form-hint admin-form-hint-inline">
                  {isEdit
                    ? t('上传的文件会作为新版本发布；不传则保持现有文件不变。', 'Uploaded files are published as a new version. Leave empty to keep the current files.')
                    : t('可上传技能文件夹（需包含 SKILL.md）；不传则只创建条目，之后再补文件。', 'Upload a skill folder (it must include SKILL.md). Leave empty to create the entry first and add files later.')}
                </span>
                <FileDropzone files={files} onChange={setFiles} requireSkillMd={!isEdit} />
              </div>

              <div className="admin-modal-foot">
                <button className="btn btn-secondary" type="button" onClick={onClose}>
                  {t('取消', 'Cancel')}
                </button>
                <button className="btn btn-primary" type="submit" disabled={!canSave}>
                  {save.isPending
                    ? t('保存中…', 'Saving…')
                    : isEdit ? t('保存修改', 'Save changes') : t('创建技能', 'Create skill')}
                </button>
              </div>
            </form>
          )}
    </Modal>
  )
}

function RemoveDialog({
  skill,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  skill: SkillWithOwner
  busy: boolean
  error: unknown
  onCancel: () => void
  onConfirm: () => void
}) {
  const { lang } = useLang()
  const t = useT()

  return (
    <Modal title={t('删除技能', 'Delete skill')} onClose={onCancel}>
      <p className="admin-confirm-lead">
        {t('删除后无法恢复。该技能及其全部版本与文件都会被移除。', 'This cannot be undone. The skill, all of its versions and every file it carries will be removed.')}
      </p>
      <p className="admin-confirm-target">
        <strong>{localizedName(skill, lang)}</strong>
        <small>{skillPath(skill)}</small>
      </p>
      {error !== null && error !== undefined && (
        <ErrorBox message={error instanceof Error ? error.message : t('删除失败，请重试。', 'Could not delete. Please try again.')} />
      )}
      <div className="admin-modal-foot">
        <button className="btn btn-secondary" type="button" onClick={onCancel}>
          {t('取消', 'Cancel')}
        </button>
        <button className="btn btn-danger" type="button" disabled={busy} onClick={onConfirm}>
          {busy ? t('删除中…', 'Deleting…') : t('确认删除', 'Delete')}
        </button>
      </div>
    </Modal>
  )
}
