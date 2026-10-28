import { BrainCircuit, Code2, Inbox, Lightbulb, Megaphone, Microscope, Palette, ShieldCheck, Timer, Wrench, type LucideProps } from 'lucide-react'
import type { TopicId } from '../../domain/types'

const ICONS: Record<TopicId, React.ComponentType<LucideProps>> = {
  ai: BrainCircuit,
  engineering: Code2,
  devtools: Wrench,
  startups: Lightbulb,
  growth: Megaphone,
  design: Palette,
  security: ShieldCheck,
  research: Microscope,
  productivity: Timer,
  other: Inbox,
}

export function TopicIcon({ topic, ...props }: { topic: TopicId } & LucideProps) {
  const Icon = ICONS[topic]
  return <Icon {...props} />
}
