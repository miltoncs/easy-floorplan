import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { CanvasContextMenu } from './components/CanvasContextMenu'
import { EditorDialogs } from './components/EditorDialogs'
import { EditorProvider, useEditor } from './context/EditorContext'
import {
  MAX_LABEL_FONT_SIZE,
  MAX_WALL_STROKE_SCALE,
  MIN_LABEL_FONT_SIZE,
  MIN_WALL_STROKE_SCALE,
} from './lib/blueprint'
import { DataPage } from './pages/DataPage'
import { DetailPage } from './pages/DetailPage'
import { WorkspaceHeaderControls, WorkspacePage } from './pages/WorkspacePage'

function App() {
  return (
    <BrowserRouter>
      <EditorProvider>
        <AppShell />
      </EditorProvider>
    </BrowserRouter>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const { actions } = useEditor()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const isWorkspaceRoute = location.pathname === '/workspace'

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-main">
          <nav aria-label="Primary" className="primary-nav">
            <NavLink className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')} to="/workspace">
              Workspace
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')} to="/detail">
              Detail
            </NavLink>
            <NavLink className={({ isActive }) => (isActive ? 'nav-pill active' : 'nav-pill')} to="/data">
              Data
            </NavLink>
          </nav>

          {isWorkspaceRoute ? (
            <div className="app-header-workspace">
              <WorkspaceHeaderControls />
            </div>
          ) : null}
        </div>

        <div className="app-header-actions" ref={menuRef}>
          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label="App settings"
            className="icon-button"
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            <span className="gear-icon" aria-hidden="true">
              <span className="gear-icon__ring" />
              <span className="gear-icon__hub" />
            </span>
          </button>

          {menuOpen ? (
            <div aria-label="App menu" className="app-menu panel-card" role="menu">
              <button
                className="app-menu__item"
                onClick={() => {
                  setSettingsOpen(true)
                  setMenuOpen(false)
                }}
                role="menuitem"
                type="button"
              >
                Open settings
              </button>
              <button
                className="app-menu__item"
                onClick={() => {
                  navigate('/data')
                  setMenuOpen(false)
                }}
                role="menuitem"
                type="button"
              >
                JSON import/export
              </button>
              <button
                className="app-menu__item danger"
                onClick={() => {
                  actions.restoreSample()
                  setMenuOpen(false)
                }}
                role="menuitem"
                type="button"
              >
                Restore sample workspace
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main className="page-shell">
        <Routes>
          <Route element={<Navigate replace to="/workspace" />} path="/" />
          <Route element={<WorkspacePage />} path="/workspace" />
          <Route element={<DetailPage />} path="/detail" />
          <Route element={<DataPage />} path="/data" />
        </Routes>
      </main>

      <CanvasContextMenu />
      <EditorDialogs />
      {settingsOpen ? <AppSettingsDialog onClose={() => setSettingsOpen(false)} onOpenData={() => navigate('/data')} /> : null}
    </div>
  )
}

function AppSettingsDialog({
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
                <strong>{Math.round(draft.wallStrokeScale * 100)}%</strong>
                <input
                  aria-label="Wall line width"
                  className="settings-slider__input"
                  max={Math.round(MAX_WALL_STROKE_SCALE * 100)}
                  min={Math.round(MIN_WALL_STROKE_SCALE * 100)}
                  onChange={(event) => actions.setWallStrokeScale(Number(event.target.value) / 100)}
                  step={10}
                  type="range"
                  value={Math.round(draft.wallStrokeScale * 100)}
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
              <div><span>Canvas menu</span><code>Shift+F10</code></div>
            </div>
          </section>

          <section className="app-settings-section">
            <p className="panel-kicker">Editing</p>
            <h3>Canvas-first controls</h3>
            <p>Walls, corners, room names, and inferred geometry are edited directly on the drawing. Fine-grain changes still use dialogs when needed.</p>
          </section>
        </div>
      </div>
    </div>
  )
}

function formatSettingNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default App
