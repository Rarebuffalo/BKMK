import type { TopicId } from '../domain/types'

// SAMPLE CONTENT for demo mode only. Every author handle and post below is
// fictional and written for this prototype. None of it was retrieved from X.

export interface PostTemplate {
  text: string
  /** Link attached to the post, if any. `{slug}` is filled deterministically. */
  link?: string
  thread?: [number, number]
}

export const DEMO_AUTHORS: Record<Exclude<TopicId, 'other'> | 'misc', { handle: string; name: string }[]> = {
  ai: [
    { handle: 'tensor_tess', name: 'Tess Okafor' },
    { handle: 'evalgoblin', name: 'Eval Goblin' },
    { handle: 'kaito_infers', name: 'Kaito Mori' },
  ],
  engineering: [
    { handle: 'postgres_priya', name: 'Priya Raman' },
    { handle: 'latency_lars', name: 'Lars Eklund' },
    { handle: 'rustacean_rio', name: 'Rio Alvarez' },
  ],
  devtools: [
    { handle: 'dotfiles_dana', name: 'Dana Whitfield' },
    { handle: 'cli_crafter', name: 'Ines Duarte' },
    { handle: 'oss_otto', name: 'Otto Brandt' },
  ],
  startups: [
    { handle: 'bootstrapped_ben', name: 'Ben Achebe' },
    { handle: 'zero_to_mrr', name: 'Mira Holt' },
    { handle: 'pricingpage_pat', name: 'Pat Lindqvist' },
  ],
  growth: [
    { handle: 'copy_corner', name: 'Noor Haddad' },
    { handle: 'launchday_lu', name: 'Lu Chen' },
    { handle: 'seo_sven', name: 'Sven Kask' },
  ],
  design: [
    { handle: 'kerning_kat', name: 'Kat Moreau' },
    { handle: 'pixel_pablo', name: 'Pablo Ruiz' },
    { handle: 'grid_gwen', name: 'Gwen Adeyemi' },
  ],
  security: [
    { handle: 'cve_cass', name: 'Cass Novak' },
    { handle: 'redteam_ravi', name: 'Ravi Menon' },
  ],
  research: [
    { handle: 'arxiv_anya', name: 'Anya Volkova' },
    { handle: 'labnotes_lee', name: 'Jun Lee' },
    { handle: 'dataset_dee', name: 'Dee Okonkwo' },
  ],
  productivity: [
    { handle: 'deepwork_dom', name: 'Dom Fischer' },
    { handle: 'notes_nadia', name: 'Nadia Sato' },
  ],
  misc: [
    { handle: 'just_vibes_jo', name: 'Jo Park' },
    { handle: 'random_rana', name: 'Rana Aziz' },
  ],
}

export const TEMPLATES: Record<TopicId, PostTemplate[]> = {
  ai: [
    { text: 'Spent a week building evals for our support agent. The model was fine — our prompt was the bug. Write-up below.', link: 'https://blog.example-labs.dev/agent-evals-{slug}', thread: [3, 9] },
    { text: 'A clean, minimal implementation of a transformer from scratch. Best way to actually understand attention.', link: 'https://github.com/example-ml/tiny-transformer-{slug}' },
    { text: 'RAG checklist: chunking, embedding choice, reranking, and the eval set you forgot to build first.', thread: [4, 12] },
    { text: 'Inference costs dropped again. Here is the GPU math for serving a 70B model in production.', link: 'https://example-infra.substack.com/p/gpu-math-{slug}' },
    { text: 'Paper: small models fine-tuned on synthetic data beat larger ones on narrow tasks.', link: 'https://arxiv.org/abs/2609.{slug}' },
    { text: 'Prompt caching cut our LLM bill by 60%. Token accounting matters more than model choice.' },
    { text: 'Open-source agent framework with tool calling, retries and tracing built in.', link: 'https://github.com/example-agents/harness-{slug}' },
    { text: 'Talk recording: what we learned shipping diffusion models to 2M users.', link: 'https://youtube.com/watch?v=demo{slug}' },
    { text: 'Hot take: most "agent" demos are a while loop and a prompt. That is fine. Ship the loop.' },
  ],
  engineering: [
    { text: 'Postgres tip: partial indexes are wildly underused. Here is how we cut query latency by 10×.', thread: [3, 8] },
    { text: 'The architecture doc template we use before any new backend service. Copy it.', link: 'https://blog.example-eng.dev/architecture-template-{slug}' },
    { text: 'Rust vs TypeScript for a CLI rewrite: our honest numbers after six months.', thread: [5, 14] },
    { text: 'Distributed systems reading list, ordered by how much each one changed my mind.', link: 'https://example-reads.substack.com/p/distributed-{slug}' },
    { text: 'Cache invalidation case study: the bug that took down checkout for 40 minutes.', link: 'https://blog.example-shop.dev/incident-{slug}' },
    { text: 'React rendering, explained with one diagram. Finally clicked for me.' },
    { text: 'SQL window functions cheat sheet. Saved me twice this week already.' },
    { text: 'Refactor rule: make the change easy, then make the easy change. Thread on how we apply it.', thread: [2, 7] },
    { text: 'Conference talk on building a compiler in a weekend.', link: 'https://youtube.com/watch?v=compiler{slug}' },
  ],
  devtools: [
    { text: 'This open-source CLI replaced four tools in my terminal setup.', link: 'https://github.com/example-cli/swiss-{slug}' },
    { text: 'My neovim config, annotated line by line. Steal anything.', link: 'https://github.com/example-dots/nvim-{slug}' },
    { text: 'A tiny library for typed environment variables. No more undefined in prod.', link: 'https://github.com/example-oss/envtype-{slug}' },
    { text: 'VS Code plugin that shows inline test coverage. Small thing, huge quality-of-life upgrade.', link: 'https://example-marketplace.dev/coverage-{slug}' },
    { text: 'The terminal emulator I switched to this year, and why.', link: 'https://example-term.app/?ref={slug}' },
    { text: 'Starter repo with auth, payments and a database wired up. Clone and build.', link: 'https://github.com/example-starters/saas-{slug}' },
    { text: 'npm package of the week: a 2kb date library that does exactly what you need.', link: 'https://github.com/example-oss/tinydate-{slug}' },
    { text: 'Devtool founders: your docs are your landing page. Thread with examples.', thread: [4, 10] },
  ],
  startups: [
    { text: 'We hit $10k MRR bootstrapped. Every pricing experiment we ran, in order.', thread: [6, 15] },
    { text: 'Founders: talk to customers before you write code. Here are the 7 questions I ask.', thread: [3, 8] },
    { text: 'Fundraising memo template from our seed round. Use it.', link: 'https://example-founders.substack.com/p/seed-memo-{slug}' },
    { text: 'Startup idea I will never build: a pricing page A/B tester for indie SaaS. Take it.' },
    { text: 'How we found product-market fit by firing our biggest customer.', link: 'https://blog.example-startup.dev/pmf-{slug}' },
    { text: 'YC application advice from someone who read 300 of them.', thread: [5, 11] },
    { text: 'SaaS pricing teardown: why three tiers beat two for us.' },
    { text: 'Ten startup ideas hiding in boring industries.', thread: [10, 12] },
  ],
  growth: [
    { text: 'Copywriting rule: write the landing page headline last. Here is why.', thread: [3, 6] },
    { text: 'Our launch day playbook: 0 to 4,000 signups with no ad spend.', link: 'https://example-growth.substack.com/p/launch-{slug}' },
    { text: 'SEO for developers: the 20% of work that drives 80% of traffic.', link: 'https://blog.example-seo.dev/dev-seo-{slug}' },
    { text: 'Newsletter growth: the referral loop that tripled our audience.', thread: [4, 9] },
    { text: 'Distribution beats product until it does not. Long thread on timing.', thread: [7, 16] },
    { text: 'Landing page conversion audit of 12 devtool sites.', link: 'https://example-teardowns.dev/landing-{slug}' },
    { text: 'What made our post go viral, and why we could not repeat it.' },
  ],
  design: [
    { text: 'Typography pairing guide for interfaces. Bookmark this one.', link: 'https://example-type.design/pairings-{slug}' },
    { text: 'Micro-interaction teardown: why this toggle animation feels so good.', link: 'https://youtube.com/watch?v=toggle{slug}' },
    { text: 'Figma file: 120 empty-state illustrations, free to use.', link: 'https://example-community.design/empty-states-{slug}' },
    { text: 'Colour systems for dark UI: stop using pure black.', thread: [4, 9] },
    { text: 'Layout grids explained with paper and scissors.' },
    { text: 'UX writing: error messages that actually help. 15 before/after examples.', thread: [5, 15] },
    { text: 'The font I keep coming back to for dashboards.', link: 'https://example-foundry.design/mono-{slug}' },
  ],
  security: [
    { text: 'Incident write-up: how a supply chain attack slipped through our CI.', link: 'https://blog.example-sec.dev/supply-chain-{slug}' },
    { text: 'OAuth mistakes I see in almost every security review.', thread: [6, 12] },
    { text: 'CVE breakdown: why this auth bypass was so easy to miss.', thread: [3, 8] },
    { text: 'Encryption at rest is not a threat model. Thread.', thread: [4, 7] },
    { text: 'Open-source scanner for leaked secrets in your git history.', link: 'https://github.com/example-sec/secretscan-{slug}' },
  ],
  research: [
    { text: 'New paper on how sleep consolidates memory. Surprisingly readable.', link: 'https://www.nature.com/articles/demo-{slug}' },
    { text: 'A dataset of 10M open-source commits, released for research.', link: 'https://arxiv.org/abs/2608.{slug}' },
    { text: 'Survey of 40 years of neuroscience on attention, summarised in one thread.', thread: [8, 20] },
    { text: 'Physics explainer: why the sky is not violet. Beautiful diagrams.', link: 'https://example-explains.substack.com/p/violet-{slug}' },
    { text: 'Replication study: the famous experiment holds up — mostly.', link: 'https://www.biorxiv.org/content/demo-{slug}' },
    { text: 'Biology rabbit hole: how octopuses taste with their arms.', thread: [5, 13] },
  ],
  productivity: [
    { text: 'Deep work routine that finally stuck: two 90-minute blocks, phone in another room.', thread: [3, 7] },
    { text: 'My notes system after five years of iterating. Simpler than you think.', link: 'https://example-notes.substack.com/p/system-{slug}' },
    { text: 'Learning in public: what writing every day for a year taught me.', thread: [4, 10] },
    { text: 'Reading list for engineers who want to write better.' },
    { text: 'Habit tracking is a trap. Focus on environment design instead.' },
  ],
  other: [
    { text: 'This made me laugh far harder than it should have.' },
    { text: 'Saving this for later. You know why.' },
    { text: 'The best sandwich in the city, and I will not be taking questions.' },
    { text: 'Photo of the week. No notes.' },
    { text: 'Me every Monday.' },
  ],
}
