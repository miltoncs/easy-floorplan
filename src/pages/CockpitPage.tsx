import { CockpitInspector } from '../components/CockpitInspector'
import { FloorplanCanvas } from '../components/FloorplanCanvas'

export function CockpitPage() {
  return (
    <section className="cockpit-page">
      <div className="cockpit-layout">
        <div className="cockpit-stage-shell">
          <FloorplanCanvas />
        </div>
        <CockpitInspector />
      </div>
    </section>
  )
}
