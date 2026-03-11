import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
import {
  DEFAULT_FURNITURE_CORNER_SNAP_STRENGTH,
  DEFAULT_FURNITURE_SNAP_STRENGTH,
  DEFAULT_LABEL_FONT_SIZE,
  DEFAULT_SHOW_LABEL_SHAPES,
  DEFAULT_WALL_STROKE_SCALE,
} from './blueprint'
import {
  createStructureExportEnvelope,
  createWorkspaceExportEnvelope,
  normalizeImportedJson,
  parseImportedJson,
} from './serialization'

describe('serialization', () => {
  it('creates versioned workspace and structure envelopes', () => {
    const draft = createSeedState()
    const workspaceEnvelope = createWorkspaceExportEnvelope(draft)
    const structureEnvelope = createStructureExportEnvelope(draft.structures[0])

    expect(workspaceEnvelope.kind).toBe('workspace')
    expect(workspaceEnvelope.version).toBe(2)
    expect(structureEnvelope.kind).toBe('structure')
    expect(structureEnvelope.version).toBe(2)
  })

  it('imports legacy raw workspace and structure JSON', () => {
    const draft = createSeedState()
    const legacyDraft = structuredClone(draft) as Record<string, unknown>
    delete legacyDraft.showWallLabels
    delete legacyDraft.showAngleLabels
    delete legacyDraft.wallStrokeScale
    delete legacyDraft.labelFontSize
    delete legacyDraft.showLabelShapes
    delete legacyDraft.furnitureSnapStrength
    delete legacyDraft.furnitureCornerSnapStrength
    const workspaceImport = normalizeImportedJson(legacyDraft)
    const structureImport = normalizeImportedJson(draft.structures[0])

    expect(workspaceImport.kind).toBe('workspace')
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.showWallLabels : null).toBe(true)
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.showAngleLabels : null).toBe(true)
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.wallStrokeScale : null).toBe(DEFAULT_WALL_STROKE_SCALE)
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.labelFontSize : null).toBe(DEFAULT_LABEL_FONT_SIZE)
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.showLabelShapes : null).toBe(DEFAULT_SHOW_LABEL_SHAPES)
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.furnitureSnapStrength : null).toBe(DEFAULT_FURNITURE_SNAP_STRENGTH)
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.furnitureCornerSnapStrength : null).toBe(DEFAULT_FURNITURE_CORNER_SNAP_STRENGTH)
    expect(structureImport.kind).toBe('structure')
  })

  it('defaults missing corner snap strength from the stored wall snap strength', () => {
    const draft = createSeedState()
    const legacyDraft = structuredClone(draft) as Record<string, unknown>

    legacyDraft.furnitureSnapStrength = 2.25
    delete legacyDraft.furnitureCornerSnapStrength

    const workspaceImport = normalizeImportedJson(legacyDraft)

    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.furnitureCornerSnapStrength : null).toBe(2.25)
  })

  it('parses versioned JSON text and rejects invalid over-limit names', () => {
    const draft = createSeedState()
    draft.structures[0].name = '家'.repeat(129)
    const invalidText = JSON.stringify({
      kind: 'workspace',
      version: 2,
      exportedAt: new Date().toISOString(),
      payload: draft,
    })

    expect(() => parseImportedJson(invalidText)).toThrow(/Invalid structure name/)
  })
})
