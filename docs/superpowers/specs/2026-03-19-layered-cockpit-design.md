# Incremental Blueprint Layered Cockpit Design

Date: 2026-03-19
Status: Approved in conversation, pending written-spec review

## Summary

Incremental Blueprint will move from a three-page app (`Workspace`, `Detail`, `Data`) to a single desktop-first planning surface built around a layered cockpit. The center of the product remains the 2D drawing editor, but the surrounding UI becomes calmer and more cohesive by pushing secondary tools into a contextual inspector, keyboard shortcuts, and right-click menus instead of persistent button clutter.

The new experience is intentionally non-linear. Users do not need to close a room before placing furniture, switching scope, or opening an isometric preview. The app should feel like a technical drafting tool with selective assistance, not a room-capture wizard.

The first 3D feature is a read-only isometric renderer that can depict a single room, multiple selected rooms, a full floor, or a whole house. It is treated as a dedicated preview surface, not an always-on editing mode.

## Product Decisions Locked In

- Desktop and laptop are the intended primary platforms.
- The app should feel somewhat technical and efficient.
- The overall direction is a layered cockpit, not a sparse guided flow.
- Tool access should lean on keyboard shortcuts and context menus.
- There should be no persistent left workflow rail.
- Users should be free to move between measuring, furniture, and preview tasks in any order.
- The UI should support one-room, multi-room, floor, and whole-house viewing.
- The 3D goal is read-only isometric depiction of rooms, walls, and furniture.
- The 3D preview must not clutter the main cockpit view with permanent controls.

## Current-State Findings

Review of the current code and captured UI surfaces shows a strong underlying editor with weak product cohesion.

### Strengths

- The canvas editor already supports direct geometry editing, contextual actions, and furniture placement.
- The data model already represents structures, floors, rooms, wall segments, and furniture in a way that can drive richer views.
- The geometry layer already computes room outlines, bounds, inferred closure suggestions, and room relationships.

### Problems

- The product feels split into separate tools because `Workspace`, `Detail`, and `Data` behave like different applications.
- The current workspace right rail is over-carded, which fragments related information into too many equal-weight boxes.
- The canvas control region uses large, visually heavy pills that compete with the drawing itself.
- The `Detail` and `Data` pages contain large regions of dead space and duplicate context that should live beside the drawing instead.
- Global navigation consumes space without helping users switch scope or edit faster.
- The current state model conflates editing mode, visible scope, and top-level page routing.

## Goals

- Unify the app into one continuous planning surface.
- Preserve the current editor’s depth while reducing visual clutter.
- Make scope selection explicit and fast.
- Let users edit partial rooms without workflow pressure.
- Add read-only isometric rendering without introducing a full 3D editing environment.
- Improve visual hierarchy, interaction consistency, and overall drafting clarity.

## Non-Goals

- Do not add direct manipulation in 3D for the first release.
- Do not turn the app into a step-by-step wizard.
- Do not require a room to be closed before furniture or preview features are usable.
- Do not rewrite the core geometry model from scratch.
- Do not introduce mobile- or touch-first interaction patterns.

## Approaches Considered

### 1. Structured Cockpit

A single workspace with persistent progress guidance and a more obvious room-by-room flow.

Why not chosen:

- Too close to a guided workflow.
- Adds workflow framing the user explicitly did not want.

### 2. Layered Cockpit

A single workspace with a calm default layout, contextual inspector, shortcut-heavy access, and no persistent workflow rail.

Why chosen:

- Matches the desired technical feel.
- Preserves editor power without constant visual density.
- Keeps the 2D editor visually dominant.
- Allows 3D preview to remain separate and deliberate.

### 3. Editor Cockpit

A denser always-visible control surface that leans hardest into power-user exposure.

Why not chosen:

- The direction resonated visually, but the final requirements favored a calmer layered interpretation of that concept.
- Too much always-visible chrome would compete with the drawing and with the “no 3D clutter” requirement.

## Chosen Experience

The app becomes a layered cockpit with three primary zones:

- Top bar for identity, scope, and global actions.
- Center stage for the active render surface, which is almost always the 2D plan editor.
- Right inspector for contextual editing and preview/export actions.

There is no left rail. Guidance exists as lightweight status and contextual summaries rather than as a sequential checklist.

## Information Architecture

### Top Bar

The top bar replaces the existing page navigation and should include:

- Project identity and rename access.
- Active structure and floor context.
- Scope selector with explicit options:
  - `Room`
  - `Selection`
  - `Floor`
  - `House`
- Global actions such as import, export, settings, and restore sample.
- A compact selection breadcrumb or target summary when helpful.

The top bar should be denser and more useful than the current header. It is not a decorative container.

### Center Stage

The center stage is the dominant working area.

Default surface:

- 2D floorplan editor with room, wall, corner, and furniture interaction.

Alternate surface:

- Read-only isometric preview of the current scope.

The center stage should never carry persistent 3D orbit controls or a permanent 3D toolbar. Preview controls should be minimal and scoped to the preview session only.

### Right Inspector

The inspector replaces both the current workspace rail detail cards and the `Detail` page.

Recommended tabs:

- `Properties`
- `Measurements`
- `Furniture`
- `Preview / Export`

The inspector content is driven by current selection and current scope. It should show useful summary content when no fine-grained target is selected.

### Utility Surfaces

The `Data` page should be removed as a primary destination. Its capabilities should move into utility affordances inside the unified cockpit:

- import/export actions in top bar menus or the `Preview / Export` tab
- format and compatibility notes in utility dialogs or inspector content
- testing references kept in docs, not in the runtime navigation

## Interaction Model

### Primary Editing

- Left click selects room, wall, corner, or furniture targets.
- Double-click or `Enter` edits the most obvious current value inline.
- Right click opens target-specific context menus.
- Drag remains the main way to reposition geometry and furniture where supported.

### Tool Access

The redesign should reduce visible button clutter by promoting:

- keyboard shortcuts for frequent actions
- context menus for target-specific actions
- inspector actions for deliberate property editing
- optional command-palette style invocation for less common actions

Examples of shortcut-friendly actions:

- add wall
- add furniture
- rename selected item
- delete selected item
- fit view
- toggle labels
- toggle inference
- open isometric preview
- export current scope

### Scope Behavior

Scope is first-class and independent from current editing action.

- `Room`: show and inspect the selected room.
- `Selection`: show the current multi-selection, typically on the active floor.
- `Floor`: show all rooms on the active floor.
- `House`: show the active structure across floors.

Users can switch scope without satisfying workflow gates.

### Assistance Without Workflow Pressure

The app can still communicate status, but only as passive guidance:

- room-level status summaries
- preview eligibility notices
- open-vs-closed outline indicators
- contextual closure suggestions

The product should not imply “finish this room first” unless the user attempts an action that truly requires closed geometry.

## Visual Design Direction

### Tone

The redesign should feel like warm architectural drafting software rather than generic SaaS.

Qualities:

- calm, technical, intentional
- denser on desktop, but still legible
- fewer oversized floating pills
- stronger separation between global, local, and selected states

### Visual Changes

- Replace the current top-level route tabs with a denser project and scope bar.
- Reduce stacked summary cards in favor of tabbed inspector content.
- Minimize persistent canvas chrome to essentials only.
- Use clearer selection, hover, and warning hierarchies.
- Keep destructive actions visually separated from edit actions.
- Replace large equal-weight cards with stronger primary-secondary information contrast.

### UI Best Practices To Apply

- Always show the active scope.
- Make selection state clearer than hover state.
- Avoid blank panels; swap in contextual summaries or actionable empty states.
- Make destructive actions harder to trigger accidentally.
- Keep inline editing fast, but never ambiguous.
- Ensure dense desktop layouts remain scannable through consistent spacing and tab structure.

## 2D / 3D Surface Model

The current app blends editing mode and viewport behavior too tightly. The redesign should separate:

- `tool context`: what the user is editing
- `view scope`: what portion of the project is shown
- `surface mode`: whether the center stage shows the 2D plan or the isometric preview

Recommended additions to UI state:

- `viewScope`: `room | selection | floor | house`
- `surfaceMode`: `plan | isometric`

The current `editorMode` concept can likely be simplified or reworked so that furniture editing becomes part of the same unified drafting surface rather than a page-level mode metaphor.

## Isometric Preview Design

### User-Facing Behavior

The preview is read-only and explicitly opened. It should be available from:

- inspector `Preview / Export` tab
- keyboard shortcut
- context menu where relevant

When opened:

- the center stage swaps from 2D plan to isometric preview
- the right inspector remains available for scope context and preview actions
- the top bar still shows active scope and project context

When closed:

- the app returns directly to the prior 2D plan state

### Scope Support

The isometric renderer must support:

- one room
- multiple selected rooms
- entire floor
- whole house

The renderer should depict exactly the chosen scope, not silently widen or narrow it.

### Rendering Strategy

The first release should use a deterministic 2.5D projected renderer, not a full real-time 3D engine.

Recommended approach:

- derive geometry from existing room and furniture state
- use the current geometry pipeline for wall runs and bounds
- extrude walls to a fixed preview height
- render closed rooms with floor plates
- render open rooms as truthful wall runs without fake closure
- render furniture as simple isometric blocks using width, depth, position, and rotation
- stack floors using existing elevation values

Why this is preferred:

- lower implementation weight
- no extra scene-authoring model
- consistent with a clean preview goal
- easier to verify through deterministic rendering helpers

### Preview Honesty Rules

- Closed room: render floor, walls, and furniture blocks.
- Open room: render only known wall runs and furniture.
- Estimated area can be shown as metadata, but the renderer must not pretend an open room is fully enclosed.
- Invalid or degenerate geometry should show a clear preview notice instead of failing or fabricating geometry.

## Data Model And Compatibility

The existing persisted plan model remains authoritative:

- structures
- floors
- rooms
- wall segments
- furniture

New runtime state should be minimal:

- `viewScope`
- `surfaceMode`
- any inspector tab state or command-palette visibility

No parallel 3D scene storage should be introduced for the first release.

Import and export expectations:

- preserve current JSON compatibility wherever possible
- normalize legacy drafts on load
- keep existing structure/workspace export concepts, but surface them through the unified cockpit instead of a separate page

## Error Handling And Empty States

### Partial Rooms

Partial rooms are valid working states.

The UI must not frame open geometry as an error just because the outline is incomplete.

### Feature Degradation

Some outputs depend on closed geometry, but access should remain broad:

- furniture remains usable for open rooms
- isometric preview remains available for open rooms
- floor fill and exact area can degrade gracefully
- warnings should inform, not block, unless an operation is truly impossible

### Safe Failure Cases

- Shortcut or context-menu actions that do not apply should no-op safely or show a brief status notice.
- Inspector tabs should show meaningful empty states when the current selection does not support their controls.
- The preview surface should display a readable message for unsupported or degenerate derived geometry instead of crashing.

## Testing Strategy

### Unit And Geometry Tests

Continue to rely on geometry tests for correctness of:

- room outline derivation
- closure suggestions
- bounds computation
- furniture placement and snapping

Add focused tests for:

- scope derivation
- preview scene derivation from room/floor/house inputs
- open-room rendering rules

### State And Selector Tests

Add tests around:

- `viewScope`
- `surfaceMode`
- selection-to-scope behavior
- inspector content switching

### Component Tests

Add tests for:

- unified cockpit shell
- top bar scope selector
- inspector tabs
- context-dependent empty states
- preview open / close transitions

### Interaction Tests

Add tests for:

- shortcut handling
- context menu actions
- inline edit flows
- returning from preview to plan view

### End-To-End Coverage

Update Playwright flows to validate:

- selecting different scopes
- editing room geometry in the unified cockpit
- placing furniture without closing a room
- opening isometric preview from several scopes
- returning to 2D without losing context
- running import/export from the unified interface

## Delivery Strategy

The redesign should be delivered incrementally, not as a greenfield rewrite.

Suggested sequence:

1. Introduce the unified app shell and move away from multi-page routing.
2. Consolidate detail and data functions into inspector and utility surfaces.
3. Add first-class `viewScope` and `surfaceMode` state.
4. Refactor the center-stage editor to work cleanly within the new shell.
5. Build deterministic isometric scene derivation helpers.
6. Add the read-only isometric preview surface.
7. Tighten keyboard shortcuts, context menus, and testing coverage.

## Open Implementation Notes

- Existing multi-selection support should be reused for `Selection` scope instead of inventing a second selection system.
- The current state and editor abstractions likely need focused extraction, but only where needed to support the new cockpit and preview boundaries.
- The current `WorkspaceHeaderControls`, page components, and summary-card patterns are likely to be collapsed into a smaller number of shell and inspector components.
- The visual refresh should accompany the architectural consolidation rather than being deferred until after structure changes, because hierarchy and component boundaries are tightly linked here.

## Acceptance Shape

The redesign is successful when:

- users work from one continuous cockpit instead of three disconnected pages
- the 2D editor remains the primary surface
- most actions are reachable through shortcuts, context menus, or the inspector rather than through persistent button clutter
- room, selection, floor, and house scopes are explicit and switchable
- isometric preview can truthfully render those scopes without becoming a second editor
- open rooms remain usable across measurement, furniture, and preview tasks
- the UI looks more intentional, coherent, and architecturally focused than the current app
