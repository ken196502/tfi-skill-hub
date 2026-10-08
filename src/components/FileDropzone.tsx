import { useState, type DragEvent } from 'react'
import { useT } from '../lib/i18n'

/**
 * Skill file picker: drag a folder or files in, or use the two buttons.
 *
 * Shared by the publish page and the console's create/edit dialog so both
 * behave the same way. `webkitRelativePath` is what carries a dropped folder's
 * structure through to the server as the stored file path — a plain multi-file
 * pick has no paths and lands flat.
 */
export function FileDropzone({
  files,
  onChange,
  requireSkillMd = false,
}: {
  files: File[]
  onChange: (files: File[]) => void
  /** Warn until a `SKILL.md` is present — required when creating a skill. */
  requireSkillMd?: boolean
}) {
  const t = useT()
  const [dragover, setDragover] = useState(false)

  const add = (incoming: FileList | null) => {
    if (!incoming) return
    onChange([...files, ...Array.from(incoming)])
  }

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragover(false)
    add(event.dataTransfer.files)
  }

  const hasSkillMd = files.some(
    (file) => file.name === 'SKILL.md' || file.webkitRelativePath.endsWith('SKILL.md'),
  )
  const showMissing = requireSkillMd && !hasSkillMd

  return (
    <>
      <div
        className={`drop-zone${dragover ? ' dragover' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragover(true)
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={onDrop}
      >
        <p style={{ marginBottom: 12 }}>{t('拖放文件夹或文件到这里', 'Drop a folder or files here')}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
          <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
            {t('选择文件夹', 'Choose folder')}
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => add(event.target.files)}
              {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
            />
          </label>
          <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
            {t('选择文件', 'Choose files')}
            <input
              type="file"
              multiple
              style={{ display: 'none' }}
              onChange={(event) => add(event.target.files)}
            />
          </label>
        </div>
      </div>

      {files.length > 0 && (
        <div className="file-picker-list">
          <div className="file-picker-head">
            <span className="form-hint">
              {t('已选择', 'Selected')} {files.length} {t('个文件', 'files')}
              {showMissing ? t('（缺少 SKILL.md）', ' (SKILL.md missing)') : ''}
            </span>
            <button type="button" className="filter-btn" onClick={() => onChange([])}>
              {t('清除全部', 'Clear all')}
            </button>
          </div>
          <ul className="version-list">
            {files.slice(0, 12).map((file, index) => (
              <li className="version-item" key={`${file.webkitRelativePath || file.name}-${index}`}>
                <span className="file-picker-name">{file.webkitRelativePath || file.name}</span>
                <span className="version-date">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                <button
                  type="button"
                  className="file-picker-remove"
                  aria-label={t('移除该文件', 'Remove this file')}
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          {files.length > 12 && (
            <span className="form-hint">
              {t(`其余 ${files.length - 12} 个文件未列出`, `${files.length - 12} more files not listed`)}
            </span>
          )}
        </div>
      )}
    </>
  )
}