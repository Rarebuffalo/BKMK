import { ArrowRight, EyeOff, KeyRound, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AchievementBadge, ArchetypeEmblem, DnaStrip, RARITY_COLOR, Wordmark } from '../components/brand/Pixel'
import { DemoLab } from '../components/brand/Demo'
import { UsernameForm } from '../components/landing/UsernameForm'
import { ShareCardCanvas } from '../components/share/ShareCardCanvas'
import { ButtonLink } from '../components/ui/Button'
import { sampleResult } from '../data/sample'
import { ACHIEVEMENTS } from '../domain/achievements'
import { ARCHETYPES } from '../domain/archetypes'
import { TOPIC_BY_ID } from '../domain/topics'
import type { ArchetypeId } from '../domain/types'
import { cardDataFrom } from '../lib/shareCard'
import { useSession } from '../state/session'

const NAMED: ArchetypeId[] = ['builder', 'researcher', 'explorer', 'curator', 'idea-hunter', 'rabbit-hole']

export function LandingPage() {
  const { state } = useSession()
  const [typed, setTyped] = useState('')
  const sample = sampleResult()
  const cardData = useMemo(() => cardDataFrom(sample, typed || 'yourhandle'), [sample, typed])
  const cardOptions = useMemo(() => ({ variant: 'terminal' as const, showScore: true }), [])

  return (
    <div className="min-h-dvh overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link to="/" aria-label="BKMK.exe home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 font-mono text-xs text-paper-dim sm:gap-4">
          <a href="#how" className="hidden px-2 py-1 hover:text-paper sm:inline">How it works</a>
          <a href="#privacy" className="hidden px-2 py-1 hover:text-paper sm:inline">Privacy</a>
          {state.result ? (
            <ButtonLink to="/app" size="sm" variant="secondary">Open my archive</ButtonLink>
          ) : (
            <span className="rounded-xs border border-line px-2 py-1 text-[10px] text-paper-faint">BUILD 001 · PROTOTYPE</span>
          )}
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-6 pb-16 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pt-14 lg:pb-24">
        <div className="animate-rise">
          <div className="eyebrow mb-5 flex items-center gap-2 text-phosphor">
            <span className="inline-block size-2 animate-blink bg-phosphor" />
            Bookmark DNA scanner
          </div>
          <h1 className="display text-[clamp(2.5rem,10vw,4.2rem)] text-paper lg:text-[clamp(3rem,4.9vw,5.2rem)]">
            You saved it <br className="hidden sm:block" />
            for a <span className="text-phosphor">reason.</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-paper-dim">
            Scan your X bookmarks. Find out what kind of collector you are, unlock badges, and finally search the things you saved.
          </p>
          <div className="mt-8 max-w-xl">
            <UsernameForm id="hero-handle" onChange={setTyped} />
          </div>
          <p className="mt-1 font-mono text-xs text-paper-faint">
            Prototype build: scans run on sample data.{' '}
            <Link to="/connect" state={{ handle: 'demo' }} className="text-paper-dim underline decoration-dotted underline-offset-4 hover:text-phosphor">
              Try the demo profile →
            </Link>
          </p>
        </div>

        <div className="relative lg:pl-4">
          <div className="absolute -inset-6 -z-10 dotgrid opacity-60 [mask-image:radial-gradient(closest-side,black,transparent)]" />
          <div className="rotate-[1.2deg] transition-transform duration-500 hover:rotate-0">
            <div className="panel-raised overflow-hidden p-1.5 shadow-[8px_8px_0_0_#000]">
              <ShareCardCanvas data={cardData} options={cardOptions} label="Sample Bookmark DNA card" />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-paper-faint">
            <span>↑ sample card · {typed ? `previewing @${typed}` : 'type your handle to personalise the preview'}</span>
            <span className="hidden sm:inline">1200×675 PNG</span>
          </div>
        </div>
      </section>

      {/* ── Archetype ticker ───────────────────────────────────── */}
      <div className="overflow-hidden border-y border-line bg-ink-2 py-3" aria-hidden>
        <div className="flex w-max animate-[ticker_40s_linear_infinite] gap-10 font-pixel text-sm text-paper-faint motion-reduce:animate-none">
          {[0, 1].map((k) => (
            <div key={k} className="flex gap-10">
              {[...NAMED, 'collector' as const].map((id) => (
                <span key={id} className="flex items-center gap-3">
                  <span className="size-2" style={{ background: ARCHETYPES[id].color }} />
                  {ARCHETYPES[id].code}
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ───────────────────────────────────────── */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-8 px-4 py-20 sm:px-6">
        <SectionHead eyebrow="HOW IT WORKS" title="Three steps. About a minute." />
        <ol className="mt-10 grid gap-4 md:grid-cols-3">
          {[
            { n: '01', t: 'Connect', d: 'Enter your handle, confirm it’s you, and approve read-only bookmark access on X.', icon: <KeyRound size={18} /> },
            { n: '02', t: 'Scan', d: 'We index what X lets apps read — your 800 most recent bookmarks — sorting topics, threads, repos and papers with real progress.', icon: <Search size={18} /> },
            { n: '03', t: 'Reveal', d: 'Get your collector archetype, Curation Score and badges. Share the card, then explore your library.', icon: <ArrowRight size={18} /> },
          ].map((s) => (
            <li key={s.n} className="panel relative p-6">
              <div className="flex items-center justify-between">
                <span className="font-pixel text-2xl text-phosphor">{s.n}</span>
                <span className="text-paper-faint">{s.icon}</span>
              </div>
              <h3 className="mt-6 text-xl font-semibold">{s.t}</h3>
              <p className="mt-2 text-sm text-paper-dim">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Archetypes ─────────────────────────────────────────── */}
      <section className="border-y border-line bg-ink-2/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHead eyebrow="COLLECTOR ARCHETYPES" title="Which one are you?" body="Every scan resolves to one archetype, derived from what you actually save. If the signal is weak, we say so instead of guessing." />
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {NAMED.map((id) => {
              const a = ARCHETYPES[id]
              return (
                <div key={id} className="panel group flex gap-4 p-5 transition-colors hover:border-line-strong">
                  <ArchetypeEmblem id={id} size={64} className="transition-transform group-hover:-translate-y-0.5" />
                  <div className="min-w-0">
                    <div className="eyebrow" style={{ color: a.color }}>{a.code}</div>
                    <h3 className="mt-1 font-semibold">{a.name}</h3>
                    <p className="mt-1 text-sm text-paper-dim">{a.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── What you get: badges + library ─────────────────────── */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHead eyebrow="AFTER THE REVEAL" title="Fun to share. Useful to keep." />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="panel p-6">
            <div className="eyebrow text-paper-faint">ACHIEVEMENT CABINET</div>
            <h3 className="mt-1 text-lg font-semibold">Badges you earn from your real collection</h3>
            <p className="mt-1 text-sm text-paper-dim">Every badge has a visible rule and progress. No random drops, no rewards for rescanning.</p>
            <div className="mt-6 grid grid-cols-4 gap-3">
              {ACHIEVEMENTS.map((a, i) => (
                <div key={a.id} className="flex flex-col items-center gap-2 text-center">
                  <AchievementBadge id={a.id} earned={i < 5} size={56} />
                  <span className="font-pixel text-[9px] leading-tight" style={{ color: i < 5 ? RARITY_COLOR[a.rarity] : 'var(--paper-faint)' }}>{a.name}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="panel p-6">
            <div className="eyebrow text-paper-faint">KNOWLEDGE LIBRARY</div>
            <h3 className="mt-1 text-lg font-semibold">Find that thread you saved in March</h3>
            <p className="mt-1 text-sm text-paper-dim">Search, filter by topic, author, type and date, and jump back to the original post.</p>
            <div className="mt-5 flex h-10 items-center gap-2 rounded-sm border border-line-strong bg-ink px-3 font-mono text-sm text-paper-dim">
              <Search size={14} /> postgres index<span className="animate-blink">▌</span>
            </div>
            <div className="mt-4 space-y-2">
              {sample.stats.topTopics.slice(0, 5).map((t) => (
                <div key={t.topic} className="flex items-center gap-3 font-mono text-xs">
                  <span className="w-24 shrink-0 text-paper-dim">{TOPIC_BY_ID[t.topic].short}</span>
                  <span className="h-2" style={{ width: `${Math.max(4, t.share * 100 * 1.6)}%`, background: TOPIC_BY_ID[t.topic].color }} />
                  <span className="text-paper-faint">{t.count}</span>
                </div>
              ))}
            </div>
            <DnaStrip stats={sample.stats} height={18} className="mt-5 opacity-80" />
            <div className="mt-2 font-mono text-[10px] text-paper-faint">sample collection</div>
          </div>
        </div>
      </section>

      {/* ── Privacy ────────────────────────────────────────────── */}
      <section id="privacy" className="scroll-mt-8 border-y border-line bg-ink-2/60">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <SectionHead eyebrow="PRIVACY MODEL" title="Your bookmarks stay yours." />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { i: <KeyRound size={18} />, t: 'Official X sign-in', d: 'You approve access on X’s own page. We never ask for or store your password.' },
              { i: <ShieldCheck size={18} />, t: 'Read-only', d: 'We request permission to read bookmarks and your profile. We can’t post, like or DM.' },
              { i: <EyeOff size={18} />, t: 'Private by default', d: 'Your library is only visible to you. Share cards show totals and badges — never bookmark contents.' },
              { i: <Trash2 size={18} />, t: 'Leave anytime', d: 'Disconnect and delete your data from settings. One click, no email required.' },
            ].map((p) => (
              <div key={p.t} className="p-1">
                <div className="grid size-10 place-items-center border border-phosphor-dim text-phosphor">{p.i}</div>
                <h3 className="mt-4 font-semibold">{p.t}</h3>
                <p className="mt-1 text-sm text-paper-dim">{p.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6">
        <div className="eyebrow text-phosphor">READY WHEN YOU ARE</div>
        <h2 className="display mt-4 text-[clamp(2rem,5.5vw,3.6rem)]">Let’s see what you’ve been saving.</h2>
        <div className="mx-auto mt-10 max-w-xl text-left">
          <UsernameForm id="footer-handle" compact />
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 pb-20 font-mono text-xs text-paper-faint sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:pb-8">
          <Wordmark size="sm" />
          <span>Independent project · not affiliated with X Corp.</span>
        </div>
      </footer>
      <DemoLab />
    </div>
  )
}

function SectionHead({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <div className="eyebrow text-phosphor">{eyebrow}</div>
      <h2 className="mt-3 text-3xl font-bold tracking-tight [font-stretch:110%] sm:text-4xl">{title}</h2>
      {body && <p className="mt-3 text-paper-dim">{body}</p>}
    </div>
  )
}
