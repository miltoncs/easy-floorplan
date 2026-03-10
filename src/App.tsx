import { useLayoutEffect } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import './App.css'
import { CanvasContextMenu } from './components/CanvasContextMenu'
import { EditorDialogs } from './components/EditorDialogs'
import { EditorProvider } from './context/EditorContext'
import { DataPage } from './pages/DataPage'
import { DetailPage } from './pages/DetailPage'
import { WorkspacePage } from './pages/WorkspacePage'

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
  const location = useLocation()

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <p className="eyebrow">Incremental Blueprint</p>
          <h1>Canvas-first survey editor</h1>
        </div>

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
    </div>
  )
}

export default App
