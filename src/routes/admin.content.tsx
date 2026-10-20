import { useEffect, useMemo, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  adminCreateSkill,
  adminListCategories,
  adminListSkills,
  adminRemoveSkill,
  adminSetSkillListing,
  adminUpdateSkill,
  downloadUrl,
  getSkill,
  type AdminSkillInput,
} from '../lib/api'
import { useSession } from '../lib/auth'
import { useLang, useT, localizedName } from '../lib/i18n'
import { AdminNav } from '../components/AdminShell'
import { Combobox, type ComboboxOption } from '../components/Combobox'
import { FileDropzone } from '../components/FileDropzone'
import { Modal } from '../components/Modal'
import { RichTextEditor } from '../components/RichTextEditor'
import { ErrorBox, Loading, PageHeader, formatDate, skillPath } from '../components/ui'
import type { ListingStatus, SkillType, SkillWithOwner } from '../lib/types'

export const Route = createFileRoute('/admin/content')({ component: ContentPage })

const PAGE_SIZE = 20

type StatusFilter = '' | ListingStatus
type TypeFilter = '' | SkillType

function rowStatus(skill: SkillWithOwner): ListingStatus {
  return skill.listing
}

const STATUS_LABEL: Record<ListingStatus, [string, string]> = {
  listed: ['已上架', 'Listed'],
  unlisted: ['已下架', 'Unlisted'],
}

const STATUS_TONE: Record<ListingStatus, string> = {
  listed: 'success',
  // Unlisted is a resting state, not a problem.
  unlisted: 'neutral',
}

const TYPE_LABEL: Record<SkillType, [string, string]> = {
  skill: ['技能', 'Skill'],
  knowledge_base: ['知识库', 'Knowledge base'],
}

/** The form's own shape: tags are edited as text, so they stay out of it. */
type Draft = Omit<AdminSkillInput, 'slug' | 'tags'> & { slug: string }

const EMPTY_DRAFT: Draft = {
  slug: '',
  displayName: '',
  summary: '',
  displayNameEn: '',
  summaryEn: '',
  category: '',
  listing: 'unlisted',
  type: 'skill',
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
    // Left exactly as stored: an unusual value must survive an unrelated edit
    // rather than being snapped back to the default.
    category: skill.category ?? '',
    listing: skill.listing,
    type: skill.type,
    // The list never carries the body; only the detail fetch does.
    html: withBody ? (skill.detailHtml ?? '') : '',
    htmlEn: withBody ? (skill.detailHtmlEn ?? '') : '',
  }
}

function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''))]
}

/**
 * Suggestions for the category field, in the order they are offered.
 *
 * The field takes free text, so this list is only a shortcut: it holds the
 * categories the catalogue already uses, plus whatever the record currently
 * carries (which may predate this list) so the saved value is always among the
 * choices. Sorting is case-insensitive alphabetical, which puts both `Design`
 * and `design` next to each other and keeps the list stable as it grows.
 */
function categoryOptions(inUse: string[], current: string): ComboboxOption[] {
  const seen = new Set<string>()
  const values: string[] = []
  for (const value of [...inUse, current]) {
    const label = value.trim()
    if (label === '' || seen.has(label)) continue
    seen.add(label)
    values.push(label)
  }
  values.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  return values.map((value) => ({ value, label: value }))
}

function ContentPage() {
  const { user, booting } = useSession()
  const t = useT()
  const client = useQueryClient()

  const [filter, setFilter] = useState<StatusFilter>('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('')
  const [page, setPage] = useState(1)
  /** `{ skill: null }` opens the dialog in create mode. */
  const [editing, setEditing] = useState<{ skill: SkillWithOwner | null } | null>(null)
  const [removing, setRemoving] = useState<SkillWithOwner | null>(null)

  const isAdmin = user !== null && user.role === 'admin'

  const list = useQuery({
    queryKey: ['admin-content-skills', filter, typeFilter, page],
    queryFn: () => adminListSkills({ listing: filter, type: typeFilter, page, pageSize: PAGE_SIZE }),
    enabled: isAdmin,
  })

  function refreshCatalogue() {
    void client.invalidateQueries({ queryKey: ['admin-content-skills'] })
    void client.invalidateQueries({ queryKey: ['admin-categories'] })
    void client.invalidateQueries({ queryKey: ['categories'] })
    // The browse page's filter is derived from the same records.
    void client.invalidateQueries({ queryKey: ['categories-in-use'] })
    void client.invalidateQueries({ queryKey: ['skills'] })
    void client.invalidateQueries({ queryKey: ['skill'] })
    void client.invalidateQueries({ queryKey: ['features'] })
  }

  const toggle = useMutation({
    mutationFn: (input: { ref: string; listing: ListingStatus }) =>
      adminSetSkillListing(input.ref, input.listing),
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

  /**
   * Every category the catalogue already uses, for the dialog's field to
   * suggest. Read once per mount rather than per page, so paging through the
   * list does not change what the suggestions are.
   */
  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: adminListCategories,
    enabled: isAdmin,
    staleTime: 30_000,
  })

  const categoriesInUse = useMemo(
    () => [...new Set(categoriesQuery.data?.categories ?? [])],
    [categoriesQuery.data],
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
        subtitle={t('维护技能的展示信息与详情内容，可随时上架、下架或删除。', 'Maintain skill details and rich content; list, unlist or remove a skill at any time.')}
      />

      <div className="admin-toolbar admin-toolbar-spaced">
        <div className="admin-filter-group">
          {([
            ['', t('全部', 'All')],
            ['listed', t('已上架', 'Listed')],
            ['unlisted', t('已下架', 'Unlisted')],
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
        <div className="admin-filter-group">
          {([
            ['', t('全部类型', 'All types')],
            ['skill', t('技能', 'Skills')],
            ['knowledge_base', t('知识库', 'Knowledge bases')],
          ] as Array<[TypeFilter, string]>).map(([value, label]) => (
            <button
              key={value || 'all-types'}
              className={`filter-btn${typeFilter === value ? ' active' : ''}`}
              type="button"
              onClick={() => {
                setTypeFilter(value)
                setPage(1)
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-small" type="button" onClick={() => setEditing({ skill: null })}>
          {t('新建', 'New entry')}
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
                listing: rowStatus(skill) === 'listed' ? 'unlisted' : 'listed',
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
            <th>{t('名称', 'Name')}</th>
            <th>{t('类型', 'Type')}</th>
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
                <td>
                  <span className="admin-status admin-status-neutral">
                    {t(TYPE_LABEL[skill.type][0], TYPE_LABEL[skill.type][1])}
                  </span>
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
                      {status === 'listed' ? t('下架', 'Unlist') : t('上架', 'List')}
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
              <td colSpan={6} className="admin-empty">
                {t('当前筛选下没有内容。', 'Nothing matches the current filter.')}
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

  // Editing an existing skill: its current files are already published, so offer
  // a direct download of that package from the upload module.
  const existingDownloadHref =
    isEdit && skill ? downloadUrl({ slug: skill.slug, namespace: skill.namespaceSlug }) : ''

  // The body is only on the detail path — a page of skills must not ship every
  // body in full — so editing starts by fetching the one record.
  const detail = useQuery({
    queryKey: ['admin-skill-content', ref],
    queryFn: () => getSkill(ref),
    enabled: isEdit,
    staleTime: 0,
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
  // is usually adding to it. A knowledge base is reference material, so its
  // package needs no manifest — the server writes one from the form.
  const isKnowledgeBase = draft.type === 'knowledge_base'
  const uploadsWithoutSkillMd =
    !isEdit &&
    !isKnowledgeBase &&
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
      title={
        isEdit
          ? isKnowledgeBase ? t('编辑知识库', 'Edit knowledge base') : t('编辑技能', 'Edit skill')
          : isKnowledgeBase ? t('新建知识库', 'New knowledge base') : t('新建技能', 'New skill')
      }
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
                <div className="admin-field">
                  <label className="form-label" htmlFor="admin-skill-category">
                    {t('分类', 'Category')}
                  </label>
                  <Combobox
                    id="admin-skill-category"
                    value={draft.category}
                    options={categoryOptions(categoriesInUse, draft.category)}
                    onChange={(value) => set('category', value)}
                    placeholder={t('输入或选择分类', 'Type or pick a category')}
                    listLabel={t('已有分类', 'Existing categories')}
                    emptyLabel={t('还没有分类，直接输入即可新建', 'No categories yet — type one to create it')}
                    allowCustom
                  />
                  <span className="form-hint">
                    {t('可自行输入新分类，点击输入框可从已有分类中选择。', 'Type a new category, or click the field to pick one already in use.')}
                  </span>
                </div>
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
                  <span className="form-label">{t('上下架', 'Listing')}</span>
                  <select
                    className="form-input"
                    value={draft.listing}
                    onChange={(event) => set('listing', event.target.value)}
                  >
                    <option value="unlisted">{t('下架（不在目录中展示）', 'Unlisted (hidden from the catalogue)')}</option>
                    <option value="listed">{t('上架（在目录中展示）', 'Listed (shown in the catalogue)')}</option>
                  </select>
                </label>
              </div>

              <div className="admin-form-grid admin-form-grid-2">
                <label>
                  <span className="form-label">{t('类型', 'Type')}</span>
                  <select
                    className="form-input"
                    value={draft.type}
                    onChange={(event) => set('type', event.target.value)}
                  >
                    <option value="skill">{t('技能', 'Skill')}</option>
                    <option value="knowledge_base">{t('知识库', 'Knowledge base')}</option>
                  </select>
                  <span className="form-hint">
                    {isKnowledgeBase
                      ? t('知识库用于成体系的研究资料与参考文档。', 'Knowledge bases hold curated research material and reference documents.')
                      : t('技能是智能体可以直接安装并运行的扩展包。', 'Skills are extension packages an agent can install and run.')}
                  </span>
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
                  <span className="form-label">
                    {isKnowledgeBase ? t('知识库文件', 'Knowledge base files') : t('技能文件', 'Skill files')}
                  </span>
                </div>
                <span className="form-hint admin-form-hint-inline">
                  {isEdit
                    ? t('上传的文件会作为新版本发布；不传则保持现有文件不变。', 'Uploaded files are published as a new version. Leave empty to keep the current files.')
                    : isKnowledgeBase
                      ? t('可上传知识库资料包（无需 SKILL.md）；不传则只创建条目，之后再补文件。', 'Upload a knowledge base package (no SKILL.md needed). Leave empty to create the entry first and add files later.')
                      : t('可上传技能文件夹（需包含 SKILL.md）；不传则只创建条目，之后再补文件。', 'Upload a skill folder (it must include SKILL.md). Leave empty to create the entry first and add files later.')}
                </span>
                {isEdit && existingDownloadHref && (
                  <a className="admin-download-link" href={existingDownloadHref} download>
                    {t('点击下载已上传附件', 'Download uploaded files')}
                  </a>
                )}
                <FileDropzone files={files} onChange={setFiles} requireSkillMd={!isEdit && !isKnowledgeBase} />
              </div>

              <div className="admin-modal-foot">
                <button className="btn btn-secondary" type="button" onClick={onClose}>
                  {t('取消', 'Cancel')}
                </button>
                <button className="btn btn-primary" type="submit" disabled={!canSave}>
                  {save.isPending
                    ? t('保存中…', 'Saving…')
                    : isEdit
                      ? t('保存修改', 'Save changes')
                      : isKnowledgeBase ? t('创建知识库', 'Create knowledge base') : t('创建技能', 'Create skill')}
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
