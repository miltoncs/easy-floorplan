import { describe, expect, it } from 'vitest'
import { createSeedState } from '../data/seed'
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
    const workspaceImport = normalizeImportedJson(legacyDraft)
    const structureImport = normalizeImportedJson(draft.structures[0])

    expect(workspaceImport.kind).toBe('workspace')
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.showWallLabels : null).toBe(true)
    expect(workspaceImport.kind === 'workspace' ? workspaceImport.draft.showAngleLabels : null).toBe(true)
    expect(structureImport.kind).toBe('structure')
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
