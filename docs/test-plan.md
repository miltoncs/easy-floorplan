# Incremental Blueprint Test Plan

## Coverage Matrix

| Scenario | Setup | Action | Expected Result | Automation |
| --- | --- | --- | --- | --- |
| Structure naming accepts Unicode | Open a workspace with at least one structure | Rename a structure with ASCII, CJK, RTL, combining marks, and emoji | Name saves unchanged and appears in workspace/detail/data views | Unit + manual |
| Floor naming enforces 128 visible characters | Open a structure with one floor | Rename a floor with 128 visible characters, then 129 | 128 saves, 129 is rejected with inline validation | Unit + manual |
| Room click-to-rename | Open `/workspace` | Click a room label or room shape | Rename dialog opens focused on the room name | Component + Playwright |
| Furniture naming and editing | Switch workspace to furniture mode | Click furniture, rename it, and update placement fields | Dialog saves Unicode name and geometry updates on canvas | Component + Playwright |
| Wall click-to-edit | Open a room with measurements | Click a wall chip or hit line | Wall dialog opens and saved length/turn updates the canvas | Component + Playwright |
| Right-click structure badge | Open `/workspace` | Right-click the structure badge | Structure context menu appears with rename/export actions | Component + Playwright |
| Right-click floor label | Open `/workspace` | Right-click a floor label | Floor context menu appears with activate/rename/add/delete actions | Component + Playwright |
| Right-click room target | Open `/workspace` | Right-click a room label or shape | Room context menu appears with rename/detail/wall/delete actions | Component + Playwright |
| Right-click wall target | Open `/workspace` | Right-click a wall chip | Wall context menu appears with edit/insert/delete actions | Component + Playwright |
| Right-click furniture target | Switch to furniture mode | Right-click furniture | Furniture context menu appears with edit/rename/delete actions | Component + Playwright |
| Right-click empty canvas | Open `/workspace` | Right-click empty canvas | Canvas context menu appears with add/focus actions | Component + Playwright |
| Route-based workflow | Open the app root | Navigate between Workspace, Detail, and Data | Each route loads directly and primary controls are visible without scrolling first | Playwright + manual |
| JSON workspace export/import | Open `/data` | Export workspace JSON, then import it back | File uses the versioned envelope and restores the workspace | Unit + Playwright |
| Legacy JSON import compatibility | Prepare raw `DraftState` and raw `Structure` fixtures | Import each legacy file | Import succeeds when names are valid | Unit + manual |
| Invalid imported names | Prepare JSON with a 129-character structure/floor/room/furniture name | Import the file | Import fails with a clear validation error and no silent truncation | Unit + manual |
| Local autosave | Make a visible edit in any page | Reload the browser | Draft restores from local storage | Playwright + manual |
| Suggestions and stacked mode | Use the sample workspace | Review suggestions, apply one, then switch to stacked mode | Suggestion actions update the wall chain and stacked floors remain aligned | Playwright + manual |

## Manual Regression Notes

- Run the Unicode naming cases with copy/paste and typed input.
- Verify both mouse right-click and keyboard context-menu invocation on the workspace canvas.
- Repeat the workspace route pass on a narrow mobile viewport and a desktop viewport.
