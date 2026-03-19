import { useEditor } from '../context/EditorContext'
import { summarizeViewScope } from '../lib/viewScope'

const VIEW_SCOPE_OPTIONS = [
  { kind: 'room', label: 'Room view' },
  { kind: 'selection', label: 'Selection view' },
  { kind: 'floor', label: 'Floor view' },
  { kind: 'house', label: 'House view' },
] as const

export function CockpitTopBar() {
  const { activeFloor, activeStructure, draft, resolvedViewScope, actions } = useEditor()
  const viewScopeSummary = summarizeViewScope(resolvedViewScope)

  return (
    <div className="cockpit-topbar panel-card">
      <div
        className="cockpit-topbar__identity"
        data-testid="structure-header"
        onContextMenu={(event) => {
          if (!activeStructure) {
            return
          }

          event.preventDefault()
          actions.openContextMenu({
            x: event.clientX,
            y: event.clientY,
            target: {
              kind: 'structure',
              structureId: activeStructure.id,
            },
          })
        }}
      >
        <span className="panel-kicker">Project</span>
        <div className="cockpit-topbar__identity-row">
          <strong>{activeStructure?.name ?? 'No structure'}</strong>
          {activeStructure ? (
            <button
              aria-label="Rename structure"
              className="workspace-structure-title__edit"
              onClick={() => actions.openRenameDialog('structure', { structureId: activeStructure.id })}
              type="button"
            >
              <PencilIcon />
            </button>
          ) : null}
        </div>
        <span className="cockpit-topbar__meta">
          {activeFloor?.name ?? 'No floor'} · {viewScopeSummary}
        </span>
      </div>

      <div aria-label="View scope" className="cockpit-topbar__scope" role="toolbar">
        {VIEW_SCOPE_OPTIONS.map((option) => {
          const active = draft.viewScope.kind === option.kind
          const nextScope =
            option.kind === 'floor'
              ? { kind: 'floor' as const, floorId: activeFloor?.id ?? draft.activeFloorId }
              : option.kind === 'house'
                ? { kind: 'house' as const, structureId: activeStructure?.id ?? draft.activeStructureId }
                : { kind: option.kind }

          return (
            <button
              aria-pressed={active}
              className={active ? 'scope-chip active' : 'scope-chip'}
              key={option.kind}
              onClick={() => actions.setViewScope(nextScope)}
              type="button"
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PencilIcon() {
  return (
    <svg aria-hidden="true" className="pencil-icon" fill="none" viewBox="0 0 16 16">
      <path
        d="M10.85 2.65a1.75 1.75 0 0 1 2.5 0l.01.01a1.77 1.77 0 0 1 0 2.5l-7.3 7.29-2.92.63.64-2.92 7.07-7.51Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.2"
      />
      <path d="m10.25 3.25 2.5 2.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.2" />
    </svg>
  )
}
