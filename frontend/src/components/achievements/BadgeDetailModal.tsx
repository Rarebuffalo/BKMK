import { Share2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ACHIEVEMENT_BY_ID, progressLabel } from '../../domain/achievements'
import type { AchievementProgress } from '../../domain/types'
import { AchievementBadge, RARITY_COLOR, RARITY_LABEL } from '../brand/Pixel'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { BlockProgress } from '../ui/primitives'

export function BadgeDetailModal({ progress, version, onClose }: { progress: AchievementProgress | null; version: string; onClose: () => void }) {
  const navigate = useNavigate()
  const def = progress ? ACHIEVEMENT_BY_ID[progress.id] : null
  return (
    <Modal
      open={!!progress}
      onClose={onClose}
      title={def?.name ?? ''}
      eyebrow={def ? `${RARITY_LABEL[def.rarity].toUpperCase()} · ${progress!.earned ? 'UNLOCKED' : 'LOCKED'}` : ''}
      size="sm"
      footer={
        progress?.earned ? (
          <Button variant="primary" icon={<Share2 size={14} />} onClick={() => navigate('/share?variant=badges')}>
            Share my badges
          </Button>
        ) : (
          <Button onClick={onClose}>Close</Button>
        )
      }
    >
      {def && progress && (
        <div className="flex flex-col items-center text-center">
          <div className="grid size-40 place-items-center dotgrid">
            <AchievementBadge id={def.id} earned={progress.earned} size={120} className={progress.earned ? 'animate-pop' : ''} />
          </div>
          <p className="mt-4 text-paper">{def.description}</p>
          <div className="mt-5 w-full rounded-sm border border-line bg-ink p-4 text-left">
            <div className="eyebrow text-paper-faint">Unlock condition</div>
            <p className="mt-1 text-sm">{def.condition}</p>
            <div className="mt-4 flex justify-between font-mono text-xs">
              <span className="text-paper-dim">Progress</span>
              <span style={{ color: progress.earned ? RARITY_COLOR[def.rarity] : undefined }}>
                {progressLabel(progress)}
              </span>
            </div>
            <BlockProgress value={progress.current} max={progress.target} segments={24} className="mt-2" color={progress.earned ? RARITY_COLOR[def.rarity] : 'var(--paper-dim)'} label={`${def.name} progress`} />
          </div>
          <p className="mt-3 text-[11px] text-paper-faint">Rules version {version}. Rarity is a visual tier, not a measured percentage of users.</p>
        </div>
      )}
    </Modal>
  )
}
