import { FloorplanCanvas } from '../components/FloorplanCanvas'
import { useEditor } from '../context/EditorContext'

const INSPECTOR_TABS = ['Properties', 'Measurements', 'Furniture', 'Preview / Export'] as const

export function CockpitPage() {
  const { activeFloor, activeStructure, resolvedViewScope, selectedRoom } = useEditor()

  return (
    <section className="cockpit-page">
      <div className="cockpit-layout">
        <div className="cockpit-stage-shell">
          <FloorplanCanvas />
        </div>

        <aside className="cockpit-inspector panel-card" aria-label="Inspector">
          <div className="cockpit-inspector__section">
            <p className="panel-kicker">Selected scope</p>
            <h2>{selectedRoom?.name ?? activeFloor?.name ?? activeStructure?.name ?? 'Workspace'}</h2>
            <p className="cockpit-inspector__summary">
              {resolvedViewScope.rooms.length} room{resolvedViewScope.rooms.length === 1 ? '' : 's'} in view
            </p>
          </div>

          <div aria-label="Inspector tabs" className="cockpit-inspector__tablist" role="tablist">
            {INSPECTOR_TABS.map((tab, index) => (
              <button
                aria-selected={index === 0}
                className={index === 0 ? 'cockpit-inspector__tab active' : 'cockpit-inspector__tab'}
                key={tab}
                role="tab"
                type="button"
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="cockpit-inspector__section">
            <p className="empty-state">
              The unified inspector shell is in place. Properties, measurements, furniture, and preview/export panels land
              in the next task.
            </p>
          </div>
        </aside>
      </div>
    </section>
  )
}
