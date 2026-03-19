import { IsometricPreview } from '../components/IsometricPreview'
import { CockpitInspector } from '../components/CockpitInspector'
import { FloorplanCanvas } from '../components/FloorplanCanvas'
import { useEditor } from '../context/EditorContext'

export function CockpitPage() {
  const { draft } = useEditor()

  return (
    <section className="cockpit-page">
      <div className="cockpit-layout">
        <div className="cockpit-stage-shell">
          {draft.surfaceMode === 'isometric' ? <IsometricPreview /> : <FloorplanCanvas />}
        </div>
        <CockpitInspector />
      </div>
    </section>
  )
}
