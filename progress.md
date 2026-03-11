Original prompt: If I right click on a position occupied by an angle and a wall, the right click menu should have options for both

- 2026-03-11: Investigated context menu behavior. The menu currently binds to a single `CanvasTarget`, so corner overlaps only surface corner actions.
- 2026-03-11: Plan is to expand corner context menus to include the associated wall actions, then verify the combined menu routes clicks to the correct dialog.
- 2026-03-11: Updated `CanvasContextMenu` so a corner context menu also includes actions for the wall attached to that corner, with each menu item carrying its own target for correct action routing.
- 2026-03-11: Added a workspace interaction test that opens a corner context menu, verifies both corner and wall actions are present, and confirms the wall editor opens from that combined menu.
- 2026-03-11: Installed local dependencies in this worktree (`node_modules` was missing), then verified with `npm run test:unit`, `npm run lint`, and `npm run build`.
- TODO: If overlap handling expands beyond corner+wall cases later, move target expansion into a shared hit-testing helper instead of growing `CanvasContextMenu`.
