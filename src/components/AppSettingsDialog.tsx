import {
  MAX_FURNITURE_CORNER_SNAP_STRENGTH,
  MAX_FURNITURE_SNAP_STRENGTH,
  MAX_LABEL_FONT_SIZE,
  MAX_WALL_STROKE_WIDTH_PX,
  MIN_FURNITURE_CORNER_SNAP_STRENGTH,
  MIN_FURNITURE_SNAP_STRENGTH,
  MIN_LABEL_FONT_SIZE,
  MIN_WALL_STROKE_WIDTH_PX,
} from '../lib/blueprint'
import { useEditor } from '../context/EditorContext'

export function AppSettingsDialog({
  onClose,
  onOpenData,
}: {
  onClose: () => void
  onOpenData: () => void
}) {
  const { draft, actions } = useEditor()

  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-modal="true" className="dialog-card app-settings-dialog" role="dialog">
        <div className="dialog-header">
          <div>
            <p className="panel-kicker">Application</p>
            <h2>Settings</h2>
            <p className="dialog-copy">Global workspace behavior, file format rules, and shortcut reference.</p>
          </div>
          <button className="ghost-button small" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <div className="app-settings-grid">
          <section className="app-settings-section">
            <p className="panel-kicker">Canvas</p>
            <h3>Appearance</h3>
            <p>Tune the drawing weight and label treatment without changing the underlying room geometry.</p>
            <div className="settings-controls">
              <label className="settings-slider">
                <span>Wall line width</span>
                <strong>{formatSettingNumber(draft.wallStrokeWidthPx)} px</strong>
                <input
                  aria-label="Wall line width"
                  className="settings-slider__input"
                  max={MAX_WALL_STROKE_WIDTH_PX}
                  min={MIN_WALL_STROKE_WIDTH_PX}
                  onChange={(event) => actions.setWallStrokeWidthPx(Number(event.target.value))}
                  step={0.2}
                  type="range"
                  value={draft.wallStrokeWidthPx}
                />
              </label>

              <label className="settings-slider">
                <span>Label font size</span>
                <strong>{formatSettingNumber(draft.labelFontSize)} px</strong>
                <input
                  aria-label="Label font size"
                  className="settings-slider__input"
                  max={MAX_LABEL_FONT_SIZE}
                  min={MIN_LABEL_FONT_SIZE}
                  onChange={(event) => actions.setLabelFontSize(Number(event.target.value))}
                  step={0.5}
                  type="range"
                  value={draft.labelFontSize}
                />
              </label>

              <label className="toggle settings-toggle">
                <input
                  aria-label="Show label shapes"
                  checked={draft.showLabelShapes}
                  onChange={(event) => actions.toggleLabelShapes(event.target.checked)}
                  type="checkbox"
                />
                <span>Show label shapes</span>
              </label>
            </div>
          </section>

          <section className="app-settings-section">
            <p className="panel-kicker">Storage</p>
            <h3>Local-first workspace</h3>
            <p>Drafts autosave in this browser. JSON is the only import/export format.</p>
            <button
              className="ghost-button small"
              onClick={() => {
                onOpenData()
                onClose()
              }}
              type="button"
            >
              Open Data page
            </button>
          </section>

          <section className="app-settings-section">
            <p className="panel-kicker">Shortcuts</p>
            <h3>Keyboard</h3>
            <div className="settings-shortcuts">
              <div><span>Undo</span><code>Cmd/Ctrl+Z</code></div>
              <div><span>Redo</span><code>Cmd/Ctrl+Shift+Z</code></div>
              <div><span>Redo</span><code>Ctrl+Y</code></div>
              <div><span>Select all walls</span><code>Cmd/Ctrl+A</code></div>
              <div><span>Canvas menu</span><code>Shift+F10</code></div>
            </div>
          </section>

          <section className="app-settings-section">
            <p className="panel-kicker">Editing</p>
            <h3>Canvas-first controls</h3>
            <p>Walls, corners, room names, and inferred geometry are edited directly on the drawing. Fine-grain changes still use dialogs when needed.</p>
            <div className="settings-controls">
              <label className="settings-slider">
                <span>Furniture wall snap strength</span>
                <strong>{formatSnapStrengthLabel(draft.furnitureSnapStrength)}</strong>
                <input
                  aria-label="Furniture wall snap strength"
                  className="settings-slider__input"
                  max={MAX_FURNITURE_SNAP_STRENGTH}
                  min={MIN_FURNITURE_SNAP_STRENGTH}
                  onChange={(event) => actions.setFurnitureSnapStrength(Number(event.target.value))}
                  step={0.25}
                  type="range"
                  value={draft.furnitureSnapStrength}
                />
              </label>

              <label className="settings-slider">
                <span>Furniture corner snap strength</span>
                <strong>{formatSnapStrengthLabel(draft.furnitureCornerSnapStrength)}</strong>
                <input
                  aria-label="Furniture corner snap strength"
                  className="settings-slider__input"
                  max={MAX_FURNITURE_CORNER_SNAP_STRENGTH}
                  min={MIN_FURNITURE_CORNER_SNAP_STRENGTH}
                  onChange={(event) => actions.setFurnitureCornerSnapStrength(Number(event.target.value))}
                  step={0.25}
                  type="range"
                  value={draft.furnitureCornerSnapStrength}
                />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function formatSettingNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function formatSnapStrengthLabel(value: number) {
  return value <= 0 ? 'Off' : `${Number(value.toFixed(2)).toString()} ft`
}
