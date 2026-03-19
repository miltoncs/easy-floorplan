import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import { AppSettingsDialog } from './components/AppSettingsDialog'
import { CanvasContextMenu } from './components/CanvasContextMenu'
import { CockpitTopBar } from './components/CockpitTopBar'
import { EditorDialogs } from './components/EditorDialogs'
import { EditorProvider, useEditor } from './context/EditorContext'
import { CockpitPage } from './pages/CockpitPage'

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
        <div className="app-header-main cockpit-header-main">
          <CockpitTopBar />
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
            <SettingsIcon />
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
          <Route element={<CockpitPage />} path="/workspace" />
          <Route element={<CockpitPage />} path="/detail" />
          <Route element={<CockpitPage />} path="/data" />
        </Routes>
      </main>

      <CanvasContextMenu />
      <EditorDialogs />
      {settingsOpen ? <AppSettingsDialog onClose={() => setSettingsOpen(false)} onOpenData={() => navigate('/data')} /> : null}
    </div>
  )
}

function SettingsIcon() {
  return (
    <svg aria-hidden="true" className="settings-icon" viewBox="0 0 24 24">
      <path className="settings-icon__track" d="M5.5 4.5V19.5" />
      <path className="settings-icon__track" d="M12 4.5V19.5" />
      <path className="settings-icon__track" d="M18.5 4.5V19.5" />
      <rect className="settings-icon__knob" height="4.5" rx="1.2" width="4.5" x="3.25" y="6" />
      <rect className="settings-icon__knob" height="4.5" rx="1.2" width="4.5" x="9.75" y="11.25" />
      <rect className="settings-icon__knob" height="4.5" rx="1.2" width="4.5" x="16.25" y="7.75" />
    </svg>
  )
}

export default App
