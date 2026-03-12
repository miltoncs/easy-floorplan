import { useEditor } from '../context/EditorContext'

export function WorkspaceHeaderControls() {
  const { activeStructure, actions } = useEditor()

  return (
    <div
      className="workspace-structure-title"
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
      <div className="workspace-structure-title__row">
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
