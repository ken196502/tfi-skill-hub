import { useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { listFeatures, listSkills } from '../lib/api'
import { SkillCard, Loading } from '../components/ui'

export const Route = createFileRoute('/')({
  component: HomePage,
})

// A small, stable selection sampled from the builtin catalog. Keeping the
// selection stable avoids the homepage reshuffling on every render while
// still giving the catalog a varied set of featured capabilities.
function HomePage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const popular = useQuery({
    queryKey: ['skills', { sort: 'downloads', limit: 6 }],
    queryFn: () => listSkills({ limit: 6, sort: 'downloads' }),
  })
  const featured = useQuery({
    queryKey: ['features'],
    queryFn: listFeatures,
    select: (response) => response.data,
  })

  const onSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = query.trim()
    if (value) navigate({ to: '/search', search: { q: value } })
  }

  return (
    <div className="home-page">
      <div className="home-backdrop" aria-hidden="true" />
      <div className="container home-container">
        <section className="home-hero">
          <h1 className="home-title">
            Build with <span>AI Skills.</span>
          </h1>
          <p className="home-subtitle">Discover powerful capabilities for your AI agents.</p>

          <form className="home-search" onSubmit={onSearch} role="search">
            <input
              className="home-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search skills, capabilities, and more..."
              aria-label="Search skills"
            />
            <button className="home-search-button" type="submit" aria-label="Search">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
            </button>
          </form>
        </section>

        <section className="home-popular" aria-labelledby="featured-skills-title">
          <div className="home-section-heading">
            <div>
              <h2 id="featured-skills-title">Featured skills</h2>
              <p className="muted">精选一些适合马上开始使用的内置能力</p>
            </div>
          </div>

          {featured.isLoading ? (
            <Loading />
          ) : (
            <div className="skill-grid">
              {featured.data?.map((skill) => <SkillCard key={skill.id} skill={skill} />)}
            </div>
          )}
        </section>

        <section className="home-popular" aria-labelledby="popular-skills-title">
          <div className="home-section-heading">
            <div>
              <h2 id="popular-skills-title">Popular skills</h2>
            </div>
          </div>

          {popular.isLoading ? (
            <Loading />
          ) : (
            <div className="skill-grid">
              {(popular.data?.data ?? []).map((skill) => (
                <SkillCard key={skill.id} skill={skill} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
