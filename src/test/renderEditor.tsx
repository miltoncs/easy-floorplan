import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import { EditorProvider } from '../context/EditorContext'
import { CanvasContextMenu } from '../components/CanvasContextMenu'
import { EditorDialogs } from '../components/EditorDialogs'
import { createSeedState } from '../data/seed'
import { DataPage } from '../pages/DataPage'
import { DetailPage } from '../pages/DetailPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import type { DraftState } from '../types'

export function renderEditor(options?: {
  draft?: DraftState
  initialPath?: '/workspace' | '/detail' | '/data'
}) {
  const draft = options?.draft ?? createSeedState()
  const initialPath = options?.initialPath ?? '/workspace'

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <EditorProvider initialDraft={draft}>
        <Routes>
          <Route element={<WorkspacePage />} path="/workspace" />
          <Route element={<DetailPage />} path="/detail" />
          <Route element={<DataPage />} path="/data" />
        </Routes>
        <CanvasContextMenu />
        <EditorDialogs />
      </EditorProvider>
    </MemoryRouter>,
  )
}
