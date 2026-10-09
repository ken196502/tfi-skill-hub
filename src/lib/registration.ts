/**
 * Registration option catalogues.
 *
 * Countries and markets are fixed lists rather than free text so the answers
 * stay comparable across accounts and can be filtered on later. Both live here
 * because three layers need the exact same set: the sign-up form renders it,
 * the service validates a submitted slug against it, and the admin console
 * turns a stored slug back into a label.
 *
 * Slugs are the stable identity — the labels are copy and may be reworded or
 * translated freely. A slug that leaves the catalogue keeps its stored value;
 * `marketLabel` simply falls back to the raw slug rather than rendering a blank.
 */

/** ISO-3166 alpha-2, ordered as they read best in a dropdown. */
export interface CountryOption {
  code: string
  zh: string
  en: string
}

export const COUNTRIES: CountryOption[] = [
  { code: 'CN', zh: '中国大陆', en: 'Mainland China' },
  { code: 'HK', zh: '中国香港', en: 'Hong Kong SAR' },
  { code: 'MO', zh: '中国澳门', en: 'Macao SAR' },
  { code: 'TW', zh: '中国台湾', en: 'Taiwan' },
  { code: 'SG', zh: '新加坡', en: 'Singapore' },
  { code: 'JP', zh: '日本', en: 'Japan' },
  { code: 'KR', zh: '韩国', en: 'South Korea' },
  { code: 'US', zh: '美国', en: 'United States' },
  { code: 'CA', zh: '加拿大', en: 'Canada' },
  { code: 'GB', zh: '英国', en: 'United Kingdom' },
  { code: 'DE', zh: '德国', en: 'Germany' },
  { code: 'FR', zh: '法国', en: 'France' },
  { code: 'CH', zh: '瑞士', en: 'Switzerland' },
  { code: 'NL', zh: '荷兰', en: 'Netherlands' },
  { code: 'SE', zh: '瑞典', en: 'Sweden' },
  { code: 'AU', zh: '澳大利亚', en: 'Australia' },
  { code: 'NZ', zh: '新西兰', en: 'New Zealand' },
  { code: 'AE', zh: '阿联酋', en: 'United Arab Emirates' },
  { code: 'SA', zh: '沙特阿拉伯', en: 'Saudi Arabia' },
  { code: 'IN', zh: '印度', en: 'India' },
  { code: 'ID', zh: '印度尼西亚', en: 'Indonesia' },
  { code: 'VN', zh: '越南', en: 'Vietnam' },
  { code: 'TH', zh: '泰国', en: 'Thailand' },
  { code: 'MY', zh: '马来西亚', en: 'Malaysia' },
  { code: 'PH', zh: '菲律宾', en: 'Philippines' },
  { code: 'BR', zh: '巴西', en: 'Brazil' },
  { code: 'MX', zh: '墨西哥', en: 'Mexico' },
  { code: 'ZA', zh: '南非', en: 'South Africa' },
  { code: 'RU', zh: '俄罗斯', en: 'Russia' },
  { code: 'TR', zh: '土耳其', en: 'Türkiye' },
  { code: 'IL', zh: '以色列', en: 'Israel' },
  { code: 'OTHER', zh: '其他', en: 'Other' },
]

export interface MarketOption {
  slug: string
  zh: string
  en: string
}

/** Coverage areas a subscriber might work in. */
export const MARKETS: MarketOption[] = [
  { slug: 'a-share', zh: 'A 股', en: 'China A-shares' },
  { slug: 'hk', zh: '港股', en: 'Hong Kong' },
  { slug: 'us', zh: '美股', en: 'US equities' },
  { slug: 'overseas', zh: '海外市场', en: 'Other overseas markets' },
  { slug: 'fixed-income', zh: '固定收益', en: 'Fixed income' },
  { slug: 'commodity', zh: '大宗商品', en: 'Commodities' },
  { slug: 'fx', zh: '外汇', en: 'FX' },
  { slug: 'fund', zh: '基金与 ETF', en: 'Funds & ETFs' },
  { slug: 'private', zh: '私募与另类投资', en: 'Private & alternatives' },
]

const MARKET_BY_SLUG = new Map(MARKETS.map((item) => [item.slug, item]))

/** Label for a stored market slug, in the requested language. */
export function marketLabel(slug: string, lang: 'zh' | 'en'): string {
  const found = MARKET_BY_SLUG.get(slug)
  if (!found) return slug
  return lang === 'zh' ? found.zh : found.en
}

const COUNTRY_BY_CODE = new Map(COUNTRIES.map((item) => [item.code, item]))

/** Label for a stored country code, in the requested language. */
export function countryLabel(code: string, lang: 'zh' | 'en'): string {
  const found = COUNTRY_BY_CODE.get(code)
  if (!found) return code
  return lang === 'zh' ? found.zh : found.en
}

/**
 * Combobox rows for the country picker.
 *
 * `keywords` carries the *other* language plus the ISO code, so someone whose
 * interface is in Chinese can still type "Japan" and someone typing "HK" lands
 * on 中国香港 — without having to know which language the label happens to be
 * rendered in this session.
 */
export function countryOptions(lang: 'zh' | 'en') {
  return COUNTRIES.map((item) => {
    const label = lang === 'zh' ? item.zh : item.en
    const other = lang === 'zh' ? item.en : item.zh
    return { value: item.code, label, keywords: `${other} ${item.code}` }
  })
}

/** The slugs a submission may claim; anything else is dropped. */
export function knownMarketSlugs(): string[] {
  return MARKETS.map((item) => item.slug)
}

/**
 * Longest accepted value for a single-line profile field. Generous enough for
 * a long institution name or a city plus province, short enough that the column
 * cannot become a dumping ground.
 */
export const PROFILE_FIELD_MAX = 200

/** Cap on the free-text research needs field. */
export const RESEARCH_NEEDS_MAX = 2000

/**
 * The code a sign-up must enter.
 *
 * There is no mail service behind this yet: the check exists so the form's
 * confirmation step is real rather than decorative, and the code is the fixed
 * value below. Wiring an actual provider means swapping this check for a
 * single-use, expiring code issued per address — the field, the plumbing and the
 * error message are already shaped for that.
 */
export const EMAIL_VERIFICATION_CODE = '123456'

export function isEmailVerificationCode(value: string): boolean {
  return value.trim() === EMAIL_VERIFICATION_CODE
}
