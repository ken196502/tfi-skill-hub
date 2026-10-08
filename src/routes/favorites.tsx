import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listStarredSkills } from '../lib/api'
import { SkillCard, Loading, ErrorBox, PageHeader } from '../components/ui'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'

/**
 * The signed-in user's collection.
 *
 * Anonymous visitors get a sign-in prompt rather than a redirect, so the tab
 * stays discoverable in the header without bouncing anyone off the page.
 */
export const Route = createFileRoute('/favorites')({
  component: FavoritesPage,
})

function FavoritesPage() {
  const t = useT()
  const { user, booting } = useSession()
  const [pages, setPages] = useState(1)

  const query = useQuery({
    queryKey: ['favorites', { limit: 20 * pages }],
    queryFn: () => listStarredSkills({ limit: 20 * pages }),
    enabled: user !== null,
  })

  return (
    <div className="home-page">
      <div className="home-backdrop" aria-hidden="true" />
      <div className="container home-container" style={{ paddingTop: 40 }}>
        <PageHeader
          title={t('收藏', 'Favorites')}
          subtitle={t(
            '这里汇集了您收藏的技能，随时可以回来取用。',
            'Every skill you have starred, ready when you need it.',
          )}
        />

        {booting ? (
          <Loading />
        ) : !user ? (
          <div className="favorites-empty">
            <p className="detail-summary">
              {t('登录后即可查看收藏的技能。', 'Sign in to see the skills you have favourited.')}
            </p>
            <a className="btn btn-primary" href="/login?redirect=%2Ffavorites">
              {t('登录', 'Log in')}
            </a>
          </div>
        ) : query.isLoading ? (
          <Loading />
        ) : query.isError ? (
          <ErrorBox
            message={t('加载收藏失败，请稍后重试。', 'Failed to load your favourites. Please try again later.')}
          />
        ) : (query.data?.data.length ?? 0) === 0 ? (
          <div className="favorites-empty">
            <p className="detail-summary">
              {t(
                '还没有收藏任何技能。浏览时点击卡片上的星标即可收藏。',
                'Nothing favourited yet. Tap the star on any skill card to collect it here.',
              )}
            </p>
            <Link to="/skills" className="btn btn-secondary">
              {t('去浏览技能', 'Browse skills')}
            </Link>
          </div>
        ) : (
          <>
            <div className="skill-grid">
              {query.data!.data.map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
            {query.data!.nextCursor !== '' && (
              <div className="load-more">
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setPages((p) => p + 1)}
                >
                  {t('加载更多', 'Load more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
