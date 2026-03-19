/* eslint-disable react-refresh/only-export-components */

import { useEffect, useRef } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import { WorkspaceHeaderControls } from '../components/WorkspaceHeaderControls'
import { EditorProvider, useEditor } from '../context/EditorContext'
import { CanvasContextMenu } from '../components/CanvasContextMenu'
import { EditorDialogs } from '../components/EditorDialogs'
import { createSeedState } from '../data/seed'
import { DataPage } from '../pages/DataPage'
import { DetailPage } from '../pages/DetailPage'
import { WorkspacePage } from '../pages/WorkspacePage'
import type { CanvasTarget, DraftState } from '../types'

export function renderEditor(options?: {
  draft?: DraftState
  initialPath?: '/workspace' | '/detail' | '/data'
  selectionTargets?: CanvasTarget[]
  focusedTarget?: CanvasTarget | null
}) {
  const draft = options?.draft ?? createSeedState()
  const initialPath = options?.initialPath ?? '/workspace'
  const selectionTargets = options?.selectionTargets ?? []
  const focusedTarget = options?.focusedTarget ?? selectionTargets[0] ?? null

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <EditorProvider initialDraft={draft}>
        <SelectionBootstrap focusedTarget={focusedTarget} selectionTargets={selectionTargets} />
        <Routes>
          <Route
            element={
              <>
                <WorkspaceHeaderControls />
                <WorkspacePage />
              </>
            }
            path="/workspace"
          />
          <Route element={<DetailPage />} path="/detail" />
          <Route element={<DataPage />} path="/data" />
        </Routes>
        <CanvasContextMenu />
        <EditorDialogs />
      </EditorProvider>
    </MemoryRouter>,
  )
}

function SelectionBootstrap({
  selectionTargets,
  focusedTarget,
}: {
  selectionTargets: CanvasTarget[]
  focusedTarget: CanvasTarget | null
}) {
  const { actions } = useEditor()
  const appliedRef = useRef(false)

  useEffect(() => {
    if (appliedRef.current || (selectionTargets.length === 0 && !focusedTarget)) {
      return
    }

    appliedRef.current = true
    actions.setSelectionTargets(selectionTargets, {
      primaryTarget: focusedTarget,
    })
  }, [actions, focusedTarget, selectionTargets])

  return null
}
