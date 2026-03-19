# Layered Cockpit Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the route-split UI with a unified layered cockpit, add first-class room/selection/floor/house scopes, and introduce a read-only isometric preview that renders rooms, floors, or the whole house without cluttering the main 2D editor.

**Architecture:** Keep the existing geometry and editor core, but separate three concerns that are currently blended together: view scope, active surface (`plan` vs `isometric`), and contextual editing UI. Build a new cockpit shell around the existing canvas, move detail/data features into a right inspector and top-bar utility actions, and derive isometric scene data from the current room/floor/furniture model instead of introducing a separate 3D scene graph.

**Tech Stack:** React 19, TypeScript, React Router 7, Vite, Vitest, Testing Library, Playwright.

---

## File Structure

### Existing files to modify

- `src/types.ts`
  Add `ViewScopeKind`, `SurfaceMode`, and typed scope state that can describe room, multi-room selection, floor, and house views.
- `src/lib/editorState.ts`
  Persist and normalize the new scope/surface state. Keep legacy drafts loadable.
- `src/context/EditorContext.tsx`
  Add selectors and actions for scope switching, preview toggling, and inspector state. Keep existing geometry- and selection-driven actions intact.
- `src/App.tsx`
  Collapse the route shell into a unified cockpit route and redirect old top-level destinations into the new single-surface experience.
- `src/App.css`
  Replace the page-split layout with the layered cockpit shell, scoped top bar, tabbed inspector, preview surface, and calmer canvas chrome.
- `src/index.css`
  Tighten global tokens so the cockpit looks intentional and dense on desktop.
- `src/components/FloorplanCanvas.tsx`
  Keep the editor core but simplify persistent controls, wire in scope/surface awareness, and expose preview/context-menu entry points without adding permanent 3D chrome.
- `src/components/CanvasContextMenu.tsx`
  Add scope and preview actions while keeping target-specific editing actions intact.
- `src/components/EditorDialogs.tsx`
  Ensure dialogs still work after the shell consolidation and inspector migration.
- `src/components/AppSettingsDialog.tsx`
  Keep settings accessible from the top bar without route changes.
- `src/lib/blueprint.ts`
  Add helpers for deriving scope summaries and visible entity collections.
- `src/App.test.tsx`
  Update app-level assertions to target the unified cockpit instead of route-based UI.
- `tests/e2e/workspace.spec.ts`
  Rewrite route-oriented assertions to cover the unified cockpit flow and preview entry/exit behavior.

### Existing files likely to retire or reduce to redirects/wrappers

- `src/pages/WorkspacePage.tsx`
  Replace with a thin wrapper around the new cockpit page or fold its logic into the new shell.
- `src/pages/DetailPage.tsx`
  Remove primary-page responsibilities and route to the cockpit until tests are updated.
- `src/pages/DataPage.tsx`
  Remove primary-page responsibilities and route to the cockpit until tests are updated.
- `src/components/WorkspaceHeaderControls.tsx`
  Fold into the new cockpit top bar or retire if superseded.
- `src/lib/editorModes.ts`
  Replace the old `rooms/furniture/stacked` label model with explicit scope/surface semantics where possible.

### New files to create

- `src/pages/CockpitPage.tsx`
  Main single-surface container that composes the top bar, center stage, and right inspector.
- `src/components/CockpitTopBar.tsx`
  Project identity, scope selector, global utility actions, and current selection/scope summary.
- `src/components/CockpitInspector.tsx`
  Tabbed contextual inspector for properties, measurements, furniture, and preview/export.
- `src/components/CockpitInspectorTabs.tsx`
  Small focused component for the tab header and empty-state handling if `CockpitInspector.tsx` gets large.
- `src/components/IsometricPreview.tsx`
  Read-only isometric surface that renders the current scope and supports returning to plan view.
- `src/lib/viewScope.ts`
  Pure selectors/helpers for resolving room/selection/floor/house scopes.
- `src/lib/viewScope.test.ts`
  Unit coverage for scope resolution and summaries.
- `src/lib/isometric.ts`
  Deterministic helpers that derive preview walls, slabs, furniture blocks, and floor offsets from existing geometry/state.
- `src/lib/isometric.test.ts`
  Unit coverage for single-room, multi-room, floor, house, and open-room preview derivation.
- `src/components/CockpitShell.test.tsx`
  Component-level coverage for the new shell, inspector tabs, and scope switching.
- `src/components/IsometricPreview.test.tsx`
  Component-level coverage for preview rendering states and return-to-plan behavior.

## Task 1: Add Scope And Surface State

**Files:**
- Create: `src/lib/viewScope.ts`
- Test: `src/lib/viewScope.test.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/editorState.ts`
- Modify: `src/context/EditorContext.tsx`
- Modify: `src/lib/blueprint.ts`

- [ ] **Step 1: Write the failing scope-selector tests**

```ts
import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { resolveViewScope, summarizeViewScope } from './viewScope'

describe('resolveViewScope', () => {
  it('resolves the selected room for room scope', () => {
    const draft = createSeedState()
    const resolved = resolveViewScope(draft, [], { kind: 'room' })
    expect(resolved.kind).toBe('room')
    expect(resolved.rooms).toHaveLength(1)
  })

  it('falls back from empty selection scope to room scope', () => {
    const draft = createSeedState()
    const resolved = resolveViewScope(draft, [], { kind: 'selection' })
    expect(resolved.kind).toBe('room')
  })
})
```

- [ ] **Step 2: Run the new scope tests to verify they fail**

Run: `npx vitest run src/lib/viewScope.test.ts`
Expected: FAIL because `src/lib/viewScope.ts` and the new scope types do not exist yet.

- [ ] **Step 3: Add the minimum new state and pure scope helpers**

```ts
// src/types.ts
export type ViewScopeKind = 'room' | 'selection' | 'floor' | 'house'
export type SurfaceMode = 'plan' | 'isometric'

export type ViewScopeState =
  | { kind: 'room' }
  | { kind: 'selection' }
  | { kind: 'floor'; floorId: string }
  | { kind: 'house'; structureId: string }
```

```ts
// src/lib/viewScope.ts
export function resolveViewScope(draft: DraftState, selectionTargets: CanvasTarget[], scope: ViewScopeState): ResolvedViewScope {
  // Derive rooms/floors/structure from existing selection and draft state.
}
```

Add normalization in `src/lib/editorState.ts` for missing `viewScope` and `surfaceMode`, then expose read/write access through `src/context/EditorContext.tsx`.

- [ ] **Step 4: Re-run the scope tests**

Run: `npx vitest run src/lib/viewScope.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the scope-state foundation**

```bash
git add src/types.ts src/lib/viewScope.ts src/lib/viewScope.test.ts src/lib/editorState.ts src/context/EditorContext.tsx src/lib/blueprint.ts
git commit -m "feat: add scope and surface editor state"
```

## Task 2: Introduce The Unified Cockpit Shell

**Files:**
- Create: `src/pages/CockpitPage.tsx`
- Create: `src/components/CockpitTopBar.tsx`
- Create: `src/components/CockpitShell.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`
- Modify: `src/index.css`
- Modify: `src/pages/WorkspacePage.tsx`
- Modify: `src/pages/DetailPage.tsx`
- Modify: `src/pages/DataPage.tsx`

- [ ] **Step 1: Write failing shell tests**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from '../App'

describe('cockpit shell', () => {
  it('renders the unified top bar and inspector shell', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /room view/i })).toBeVisible()
    expect(screen.getByRole('tab', { name: /properties/i })).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the shell tests to verify they fail**

Run: `npx vitest run src/components/CockpitShell.test.tsx`
Expected: FAIL because the cockpit shell and top-bar controls do not exist yet.

- [ ] **Step 3: Create the new page shell and route redirects**

```tsx
// src/App.tsx
<Routes>
  <Route path="/" element={<Navigate replace to="/workspace" />} />
  <Route path="/workspace" element={<CockpitPage />} />
  <Route path="/detail" element={<Navigate replace to="/workspace" />} />
  <Route path="/data" element={<Navigate replace to="/workspace" />} />
</Routes>
```

```tsx
// src/pages/CockpitPage.tsx
export function CockpitPage() {
  return (
    <section className="cockpit-page">
      <CockpitTopBar />
      <div className="cockpit-layout">
        <div className="cockpit-stage">{/* plan or preview */}</div>
        <CockpitInspector />
      </div>
    </section>
  )
}
```

Move header responsibility out of the old workspace page and into the new top bar. Keep old page modules as thin wrappers or redirects until all call sites and tests are updated.

- [ ] **Step 4: Re-run shell tests**

Run: `npx vitest run src/components/CockpitShell.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the shell consolidation**

```bash
git add src/App.tsx src/App.css src/index.css src/pages/CockpitPage.tsx src/components/CockpitTopBar.tsx src/components/CockpitShell.test.tsx src/pages/WorkspacePage.tsx src/pages/DetailPage.tsx src/pages/DataPage.tsx src/App.test.tsx
git commit -m "feat: add unified cockpit shell"
```

## Task 3: Move Detail And Data Functions Into The Inspector

**Files:**
- Create: `src/components/CockpitInspector.tsx`
- Create: `src/components/CockpitInspectorTabs.tsx`
- Modify: `src/context/EditorContext.tsx`
- Modify: `src/App.css`
- Modify: `src/components/AppSettingsDialog.tsx`
- Modify: `src/components/EditorDialogs.tsx`
- Test: `src/components/CockpitShell.test.tsx`

- [ ] **Step 1: Write failing inspector tests**

```tsx
it('shows measurement, furniture, and preview tabs in the inspector', () => {
  render(<App />)
  expect(screen.getByRole('tab', { name: 'Measurements' })).toBeVisible()
  expect(screen.getByRole('tab', { name: 'Furniture' })).toBeVisible()
  expect(screen.getByRole('tab', { name: /Preview \/ Export/i })).toBeVisible()
})
```

- [ ] **Step 2: Run the inspector tests**

Run: `npx vitest run src/components/CockpitShell.test.tsx`
Expected: FAIL because the inspector tabs and merged detail/data content do not exist yet.

- [ ] **Step 3: Implement the tabbed inspector and move page content into it**

```tsx
// src/components/CockpitInspector.tsx
const TABS = ['properties', 'measurements', 'furniture', 'preview-export'] as const

export function CockpitInspector() {
  const [activeTab, setActiveTab] = useState<typeof TABS[number]>('properties')
  // Render selected room/wall/furniture summaries, measurement tables, furniture lists, and preview/export utilities.
}
```

Migrate the useful pieces of `src/pages/DetailPage.tsx` and `src/pages/DataPage.tsx` into the new inspector. Replace empty panels with contextual summaries or actionable empty states instead of blank cards.

- [ ] **Step 4: Re-run the inspector tests**

Run: `npx vitest run src/components/CockpitShell.test.tsx src/App.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the inspector migration**

```bash
git add src/components/CockpitInspector.tsx src/components/CockpitInspectorTabs.tsx src/context/EditorContext.tsx src/App.css src/components/AppSettingsDialog.tsx src/components/EditorDialogs.tsx src/components/CockpitShell.test.tsx src/App.test.tsx
git commit -m "feat: merge detail and data tools into cockpit inspector"
```

## Task 4: Simplify Canvas Chrome And Wire Scope Controls

**Files:**
- Modify: `src/components/FloorplanCanvas.tsx`
- Modify: `src/components/CanvasContextMenu.tsx`
- Modify: `src/components/CockpitTopBar.tsx`
- Modify: `src/context/EditorContext.tsx`
- Modify: `src/App.css`
- Test: `src/components/CockpitShell.test.tsx`
- Test: `tests/e2e/workspace.spec.ts`

- [ ] **Step 1: Write failing interaction tests for scope and reduced chrome**

```tsx
it('switches between room, floor, and house scopes from the top bar', async () => {
  render(<App />)
  await user.click(screen.getByRole('button', { name: /floor view/i }))
  expect(screen.getByText(/entire active floor/i)).toBeVisible()
})
```

Add one Playwright assertion that the old top-level `Detail` and `Data` tabs are gone.

- [ ] **Step 2: Run the scope-interaction tests**

Run: `npx vitest run src/components/CockpitShell.test.tsx`
Run: `npx playwright test tests/e2e/workspace.spec.ts --grep "route-based navigation"`
Expected: FAIL because scope controls and the updated chrome are not implemented yet.

- [ ] **Step 3: Remove route-style nav, expose scope controls, and move actions into menus**

```tsx
// src/components/CockpitTopBar.tsx
<div className="scope-switch">
  <button type="button" aria-pressed={viewScope.kind === 'room'}>Room view</button>
  <button type="button" aria-pressed={viewScope.kind === 'selection'}>Selection view</button>
  <button type="button" aria-pressed={viewScope.kind === 'floor'}>Floor view</button>
  <button type="button" aria-pressed={viewScope.kind === 'house'}>House view</button>
</div>
```

Reduce always-visible canvas controls to universal actions only: zoom, fit, undo/redo, current surface, and essential display toggles. Keep add/edit actions in context menus, shortcuts, and inspector actions.

- [ ] **Step 4: Re-run the scope/chrome tests**

Run: `npx vitest run src/components/CockpitShell.test.tsx`
Run: `npx playwright test tests/e2e/workspace.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit the scope-aware cockpit controls**

```bash
git add src/components/FloorplanCanvas.tsx src/components/CanvasContextMenu.tsx src/components/CockpitTopBar.tsx src/context/EditorContext.tsx src/App.css src/components/CockpitShell.test.tsx tests/e2e/workspace.spec.ts
git commit -m "feat: add scope controls and simplify cockpit chrome"
```

## Task 5: Add Deterministic Isometric Scene Derivation

**Files:**
- Create: `src/lib/isometric.ts`
- Create: `src/lib/isometric.test.ts`
- Modify: `src/lib/geometry.ts`
- Modify: `src/lib/blueprint.ts`
- Modify: `src/types.ts`

- [ ] **Step 1: Write failing scene-derivation tests**

```ts
import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import { buildIsometricScene } from './isometric'

describe('buildIsometricScene', () => {
  it('builds closed-room slabs and walls for room scope', () => {
    const draft = createSeedState()
    const scene = buildIsometricScene({ draft, scope: { kind: 'room' } })
    expect(scene.rooms[0].walls.length).toBeGreaterThan(0)
  })

  it('does not fabricate floor slabs for open rooms', () => {
    const draft = createSeedState()
    draft.structures[0].floors[0].rooms[0].segments = draft.structures[0].floors[0].rooms[0].segments.slice(0, 2)
    const scene = buildIsometricScene({ draft, scope: { kind: 'room' } })
    expect(scene.rooms[0].slab).toBeNull()
  })
})
```

- [ ] **Step 2: Run the new isometric tests**

Run: `npx vitest run src/lib/isometric.test.ts`
Expected: FAIL because the scene builder does not exist yet.

- [ ] **Step 3: Implement deterministic scene derivation**

```ts
// src/lib/isometric.ts
export function buildIsometricScene(input: {
  draft: DraftState
  resolvedScope: ResolvedViewScope
}): IsometricScene {
  // Derive wall segments, slabs, furniture blocks, and floor offsets from current geometry.
}
```

Use existing room geometry and furniture data. Do not add stored 3D scene data. Open rooms render truthful wall runs only.

- [ ] **Step 4: Re-run the isometric unit tests**

Run: `npx vitest run src/lib/isometric.test.ts src/lib/viewScope.test.ts`
Expected: PASS

- [ ] **Step 5: Commit the isometric derivation helpers**

```bash
git add src/lib/isometric.ts src/lib/isometric.test.ts src/lib/geometry.ts src/lib/blueprint.ts src/types.ts
git commit -m "feat: derive isometric preview scenes from plan data"
```

## Task 6: Build The Isometric Preview Surface

**Files:**
- Create: `src/components/IsometricPreview.tsx`
- Create: `src/components/IsometricPreview.test.tsx`
- Modify: `src/pages/CockpitPage.tsx`
- Modify: `src/context/EditorContext.tsx`
- Modify: `src/App.css`
- Modify: `src/components/CockpitInspector.tsx`
- Modify: `src/components/CanvasContextMenu.tsx`

- [ ] **Step 1: Write failing preview component tests**

```tsx
it('swaps the center stage into isometric preview and returns to plan view', async () => {
  render(<App />)
  await user.click(screen.getByRole('tab', { name: /Preview \/ Export/i }))
  await user.click(screen.getByRole('button', { name: /Preview Isometric/i }))
  expect(screen.getByText(/isometric preview/i)).toBeVisible()
  await user.click(screen.getByRole('button', { name: /Return to plan/i }))
  expect(screen.queryByText(/isometric preview/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run the preview tests**

Run: `npx vitest run src/components/IsometricPreview.test.tsx`
Expected: FAIL because the preview surface and `surfaceMode` UI do not exist yet.

- [ ] **Step 3: Implement the read-only preview surface**

```tsx
// src/components/IsometricPreview.tsx
export function IsometricPreview() {
  const { resolvedViewScope, isometricScene, actions } = useEditor()
  return (
    <section className="isometric-preview" aria-label="Isometric preview">
      <button type="button" onClick={() => actions.openPlanSurface()}>Return to plan</button>
      {/* Render projected walls, slabs, and furniture blocks */}
    </section>
  )
}
```

Render the current scope only. Keep the preview read-only and free of permanent orbit/tool clutter.

- [ ] **Step 4: Re-run the preview tests**

Run: `npx vitest run src/components/IsometricPreview.test.tsx src/components/CockpitShell.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit the preview surface**

```bash
git add src/components/IsometricPreview.tsx src/components/IsometricPreview.test.tsx src/pages/CockpitPage.tsx src/context/EditorContext.tsx src/App.css src/components/CockpitInspector.tsx src/components/CanvasContextMenu.tsx
git commit -m "feat: add scope-aware isometric preview surface"
```

## Task 7: Tighten Shortcuts, Context Menus, And Desktop Polish

**Files:**
- Modify: `src/context/EditorContext.tsx`
- Modify: `src/components/FloorplanCanvas.tsx`
- Modify: `src/components/CanvasContextMenu.tsx`
- Modify: `src/App.css`
- Modify: `src/index.css`
- Test: `src/components/workspaceInteractions.test.tsx`
- Test: `tests/e2e/workspace.spec.ts`

- [ ] **Step 1: Write failing shortcut/context-menu tests**

```tsx
it('opens isometric preview and returns to plan with keyboard shortcuts', async () => {
  render(<App />)
  await user.keyboard('{Meta>}Shift+P{/Meta}')
  expect(screen.getByLabelText(/isometric preview/i)).toBeVisible()
})
```

Add one end-to-end assertion that right-clicking a room or wall exposes preview/scope-aware actions without adding new persistent toolbars.

- [ ] **Step 2: Run the shortcut and interaction tests**

Run: `npx vitest run src/components/workspaceInteractions.test.tsx`
Run: `npx playwright test tests/e2e/workspace.spec.ts`
Expected: FAIL because the new shortcut map and preview actions are not wired yet.

- [ ] **Step 3: Implement the shortcut map and final desktop polish**

```ts
// src/context/EditorContext.tsx
const SHORTCUTS = {
  openIsometricPreview: 'Shift+P',
  returnToPlan: 'Escape',
  fitView: '0',
}
```

Keep the surface visually technical but calmer than the current card-heavy UI. Remove obsolete route-era styles and overgrown floating control patterns.

- [ ] **Step 4: Re-run the desktop interaction tests**

Run: `npx vitest run src/components/workspaceInteractions.test.tsx src/App.test.tsx`
Run: `npx playwright test tests/e2e/workspace.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit the interaction and polish pass**

```bash
git add src/context/EditorContext.tsx src/components/FloorplanCanvas.tsx src/components/CanvasContextMenu.tsx src/App.css src/index.css src/components/workspaceInteractions.test.tsx tests/e2e/workspace.spec.ts src/App.test.tsx
git commit -m "feat: refine cockpit shortcuts and desktop polish"
```

## Task 8: Full Verification And Cleanup

**Files:**
- Modify: `docs/test-plan.md`
- Modify: `README.md`

- [ ] **Step 1: Update docs for the new single-surface workflow**

```md
## What it does
- Uses one continuous cockpit for plan editing, furniture, export, and preview
- Supports room, selection, floor, and house scopes
- Includes a read-only isometric preview surface
```

- [ ] **Step 2: Run unit and component tests**

Run: `npm run test:unit`
Expected: PASS

- [ ] **Step 3: Run end-to-end tests**

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 4: Run lint and build**

Run: `npm run lint`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit the docs and verification pass**

```bash
git add README.md docs/test-plan.md
git commit -m "docs: update workflow and verification notes"
```

## Manual Review Notes

- Keep the preview honest for open rooms. Never fabricate closed slabs or completed outlines.
- Prefer moving actions into context menus and shortcuts over creating new persistent button rows.
- Avoid growing `src/components/FloorplanCanvas.tsx` further if a helper or child component can take new shell-only responsibilities.
- Keep the old import/export and settings behavior available throughout the refactor; only their placement should change.
