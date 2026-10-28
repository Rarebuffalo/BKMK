import type { ContentType, TopicId } from './types'

export interface TopicDef {
  id: TopicId
  label: string
  short: string
  description: string
  /** CSS custom property holding the topic's data-viz colour. */
  color: string
  family: 'build' | 'business' | 'craft' | 'knowledge' | 'none'
  /** Lower-case keywords. Multi-word phrases are matched as substrings. */
  keywords: string[]
}

export const TOPICS: TopicDef[] = [
  {
    id: 'ai',
    label: 'AI & Machine Learning',
    short: 'AI / ML',
    description: 'Models, agents, prompting, evals and the research around them.',
    color: 'var(--topic-ai)',
    family: 'build',
    keywords: ['llm', 'model', 'agent', 'prompt', 'fine-tun', 'embedding', 'inference', 'transformer', 'eval', 'rag', 'diffusion', 'gpu', 'token'],
  },
  {
    id: 'engineering',
    label: 'Software Engineering',
    short: 'Engineering',
    description: 'Architecture, languages, performance and the craft of shipping code.',
    color: 'var(--topic-engineering)',
    family: 'build',
    keywords: ['postgres', 'database', 'rust', 'typescript', 'react', 'api', 'latency', 'architecture', 'refactor', 'backend', 'frontend', 'kubernetes', 'cache', 'sql', 'compiler', 'distributed'],
  },
  {
    id: 'devtools',
    label: 'Developer Tools',
    short: 'Dev tools',
    description: 'CLIs, editors, libraries and open-source projects worth installing.',
    color: 'var(--topic-devtools)',
    family: 'build',
    keywords: ['cli', 'open source', 'open-source', 'library', 'editor', 'terminal', 'vscode', 'neovim', 'plugin', 'devtool', 'npm', 'repo', 'starter'],
  },
  {
    id: 'startups',
    label: 'Startups & Founders',
    short: 'Startups',
    description: 'Ideas, fundraising, pricing and lessons from people building companies.',
    color: 'var(--topic-startups)',
    family: 'business',
    keywords: ['startup', 'founder', 'fundraising', 'seed round', 'yc', 'pricing', 'mrr', 'customers', 'saas', 'bootstrapp', 'pmf', 'product-market'],
  },
  {
    id: 'growth',
    label: 'Marketing & Growth',
    short: 'Growth',
    description: 'Distribution, copywriting, SEO, launches and audience building.',
    color: 'var(--topic-growth)',
    family: 'business',
    keywords: ['marketing', 'growth', 'seo', 'copywriting', 'launch', 'audience', 'newsletter', 'conversion', 'landing page', 'distribution', 'viral'],
  },
  {
    id: 'design',
    label: 'Design',
    short: 'Design',
    description: 'Interfaces, typography, systems and visual references.',
    color: 'var(--topic-design)',
    family: 'craft',
    keywords: ['design', 'typography', 'figma', 'ui', 'ux', 'font', 'color', 'colour', 'layout', 'animation', 'interaction'],
  },
  {
    id: 'security',
    label: 'Security',
    short: 'Security',
    description: 'Vulnerabilities, incident write-ups, auth and defensive practice.',
    color: 'var(--topic-security)',
    family: 'build',
    keywords: ['security', 'vulnerability', 'cve', 'exploit', 'auth', 'oauth', 'encryption', 'phishing', 'supply chain', 'pentest'],
  },
  {
    id: 'research',
    label: 'Research & Science',
    short: 'Research',
    description: 'Papers, long reads, data and deep explanations.',
    color: 'var(--topic-research)',
    family: 'knowledge',
    keywords: ['paper', 'study', 'research', 'arxiv', 'dataset', 'physics', 'biology', 'neuroscience', 'experiment', 'survey'],
  },
  {
    id: 'productivity',
    label: 'Productivity & Learning',
    short: 'Productivity',
    description: 'Habits, notes, learning systems and ways of working.',
    color: 'var(--topic-productivity)',
    family: 'craft',
    keywords: ['productivity', 'habit', 'notes', 'focus', 'learning', 'reading', 'writing', 'deep work', 'routine', 'second brain'],
  },
  {
    id: 'other',
    label: 'Unsorted',
    short: 'Unsorted',
    description: 'Bookmarks no rule could confidently place. Nothing wrong with them.',
    color: 'var(--topic-other)',
    family: 'none',
    keywords: [],
  },
]

export const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t])) as Record<TopicId, TopicDef>

export const CONTENT_TYPES: { id: ContentType; label: string; plural: string }[] = [
  { id: 'post', label: 'Post', plural: 'Posts' },
  { id: 'thread', label: 'Thread', plural: 'Threads' },
  { id: 'article', label: 'Article', plural: 'Articles' },
  { id: 'repo', label: 'Repository', plural: 'Repos' },
  { id: 'paper', label: 'Paper', plural: 'Papers' },
  { id: 'video', label: 'Video', plural: 'Videos' },
  { id: 'tool', label: 'Tool', plural: 'Tools' },
]

export const CONTENT_TYPE_LABEL = Object.fromEntries(CONTENT_TYPES.map((c) => [c.id, c.label])) as Record<ContentType, string>
