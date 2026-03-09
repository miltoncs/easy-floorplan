# Incremental Blueprint

Incremental Blueprint is a local-first React webapp for building floorplans from partial measurements. Rooms are modeled as ordered wall segments, so a user can enter one distance and turn at a time, see the geometry update immediately, and apply inferred closure suggestions without fully surveying the entire structure first.

## What it does

- Organizes measurements by structure, floor, and room
- Persists the workspace in `localStorage` so surveys survive reloads
- Exports and imports structure snapshots as JSON files
- Shows inferred next walls and likely inter-room wall cavity gaps
- Supports stacked multi-floor viewing with shared alignment
- Includes an auxiliary furniture mode for interior layout outlines

## Development

```bash
npm install
npm run dev
```

The app runs on Vite's default local URL, usually `http://localhost:5173`.

## Validation

```bash
npm run lint
npm run build
```

Both commands pass in the current project state.
