import { useRef, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditor } from '../context/EditorContext'
import { parseImportedJson } from '../lib/serialization'

const JSON_PREVIEW = `{
  "kind": "workspace",
  "version": 2,
  "exportedAt": "2026-03-09T00:00:00.000Z",
  "payload": { ... }
}`

export function DataPage() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const { activeStructure, ui, actions } = useEditor()

  return (
    <section className="data-page">
      <input
        ref={inputRef}
        accept="application/json,.json"
        className="hidden-input"
        type="file"
        onChange={handleImport}
      />

      <div className="data-grid">
        <section className="panel-card data-card">
          <div className="section-heading">
            <div>
              <p className="panel-kicker">JSON workflow</p>
              <h2>Import and export</h2>
            </div>
          </div>
          <div className="workspace-toolbar-group wrap">
            <button className="primary-button" onClick={() => actions.exportActiveStructure()} type="button">
              Export structure JSON
            </button>
            <button className="ghost-button" onClick={() => actions.exportWorkspace()} type="button">
              Export workspace JSON
            </button>
            <button className="ghost-button" onClick={() => inputRef.current?.click()} type="button">
              Import JSON
            </button>
            <button className="ghost-button" onClick={() => actions.restoreSample()} type="button">
              Restore sample
            </button>
          </div>
          <div className="status-banner">
            <strong>Current status</strong>
            <span>{ui.status}</span>
          </div>
          <div className="stats-grid two-up">
            <MetricCard label="Active structure" value={activeStructure?.name ?? 'None'} />
            <MetricCard label="Format" value="JSON only" />
            <MetricCard label="Versioned export" value="v2 envelope" />
            <MetricCard label="Legacy import" value="Supported" />
          </div>
        </section>

        <section className="panel-card data-card">
          <div className="section-heading">
            <div>
              <p className="panel-kicker">Format</p>
              <h2>Envelope shape</h2>
            </div>
          </div>
          <pre className="json-preview">
            <code>{JSON_PREVIEW}</code>
          </pre>
          <div className="copy-list">
            <p>Structure exports use `kind: "structure"`.</p>
            <p>Workspace exports use `kind: "workspace"`.</p>
            <p>Legacy raw `Structure` and raw `DraftState` files still import when names satisfy the new Unicode rules.</p>
          </div>
        </section>

        <section className="panel-card data-card">
          <div className="section-heading">
            <div>
              <p className="panel-kicker">Verification</p>
              <h2>Test matrix</h2>
            </div>
          </div>
          <p className="empty-state">
            The manual regression matrix lives in <code>docs/test-plan.md</code> and mirrors the automated coverage.
          </p>
          <button className="ghost-button" onClick={() => navigate('/workspace')} type="button">
            Return to workspace
          </button>
        </section>
      </div>
    </section>
  )

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const imported = parseImportedJson(await file.text())

      if (imported.kind === 'workspace') {
        actions.importWorkspace(imported.draft)
      } else {
        actions.importStructure(imported.structure)
      }

      navigate('/workspace')
    } catch (error) {
      actions.setStatus(error instanceof Error ? error.message : 'Could not import that JSON file.')
    } finally {
      event.target.value = ''
    }
  }
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  )
}
