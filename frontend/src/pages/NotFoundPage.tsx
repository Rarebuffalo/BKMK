import { FlowLayout, Window } from '../components/scan/Window'
import { ButtonLink } from '../components/ui/Button'

export function NotFoundPage() {
  return (
    <FlowLayout>
      <div className="mx-auto w-full max-w-md">
        <Window title="error">
          <div className="p-6 text-center">
            <div className="font-pixel text-5xl text-phosphor">404</div>
            <p className="mt-3 font-mono text-sm text-paper-dim">file not found in archive</p>
            <ButtonLink to="/" variant="primary" className="mt-6">Back to start</ButtonLink>
          </div>
        </Window>
      </div>
    </FlowLayout>
  )
}
