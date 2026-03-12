import type {
  DraftState,
  ExportEnvelope,
  Structure,
  StructureExportEnvelope,
  WorkspaceExportEnvelope,
} from '../types'
import { createStructure, normalizeDraftCanvasSettings, nowIso } from './blueprint'
import { validateName } from './nameValidation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function createStructureExportEnvelope(structure: Structure): StructureExportEnvelope {
  return {
    kind: 'structure',
    version: 2,
    exportedAt: nowIso(),
    payload: structure,
  }
}

export function createWorkspaceExportEnvelope(draft: DraftState): WorkspaceExportEnvelope {
  return {
    kind: 'workspace',
    version: 2,
    exportedAt: nowIso(),
    payload: draft,
  }
}

export function serializeExportEnvelope(envelope: ExportEnvelope) {
  return JSON.stringify(envelope, null, 2)
}

export function downloadJsonFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  link.click()

  URL.revokeObjectURL(url)
}

function slugifyName(value: string) {
  const slug = value
    .normalize('NFKD')
    .replace(/[^\w\s-]+/g, '')
    .trim()
    .replace(/[-\s]+/g, '-')
    .toLowerCase()

  return slug || 'blueprint'
}

export function makeStructureExportFilename(structure: Structure) {
  return `${slugifyName(structure.name)}.structure.json`
}

export function makeWorkspaceExportFilename(structureName?: string) {
  const base = structureName ? slugifyName(structureName) : 'workspace'
  return `${base}.workspace.json`
}

type ImportPayload =
  | {
      kind: 'structure'
      structure: Structure
    }
  | {
      kind: 'workspace'
      draft: DraftState
    }

export function parseImportedJson(text: string): ImportPayload {
  const parsed = JSON.parse(text) as unknown
  return normalizeImportedJson(parsed)
}

export function normalizeImportedJson(value: unknown): ImportPayload {
  if (looksLikeExportEnvelope(value)) {
    if (value.kind === 'workspace' && isDraftStateLike(value.payload)) {
      normalizeDraftDisplayOptions(value.payload)
      validateDraftNames(value.payload)
      return {
        kind: 'workspace',
        draft: value.payload,
      }
    }

    if (value.kind === 'structure' && isStructureLike(value.payload)) {
      const structure = createStructure(value.payload)
      validateStructureNames(structure)
      return {
        kind: 'structure',
        structure,
      }
    }
  }

  if (isDraftStateLike(value)) {
    normalizeDraftDisplayOptions(value)
    validateDraftNames(value)
    return {
      kind: 'workspace',
      draft: value,
    }
  }

  if (isStructureLike(value)) {
    const structure = createStructure(value)
    validateStructureNames(structure)
    return {
      kind: 'structure',
      structure,
    }
  }

  throw new Error('File format not recognized. Load a structure or workspace JSON export.')
}

function looksLikeExportEnvelope(value: unknown): value is ExportEnvelope {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.kind === 'string' &&
    typeof value.version === 'number' &&
    typeof value.exportedAt === 'string' &&
    'payload' in value
  )
}

function isDraftStateLike(value: unknown): value is DraftState {
  if (!isRecord(value)) {
    return false
  }

  return (
    Array.isArray(value.structures) &&
    typeof value.activeStructureId === 'string' &&
    typeof value.activeFloorId === 'string' &&
    typeof value.showGrid === 'boolean' &&
    typeof value.showInferred === 'boolean' &&
    (!('showRoomFloorLabels' in value) || typeof value.showRoomFloorLabels === 'boolean') &&
    (!('showWallLabels' in value) || typeof value.showWallLabels === 'boolean') &&
    (!('showAngleLabels' in value) || typeof value.showAngleLabels === 'boolean') &&
    (!('wallStrokeWidthPx' in value) || typeof value.wallStrokeWidthPx === 'number') &&
    (!('wallStrokeScale' in value) || typeof value.wallStrokeScale === 'number') &&
    (!('labelFontSize' in value) || typeof value.labelFontSize === 'number') &&
    (!('showLabelShapes' in value) || typeof value.showLabelShapes === 'boolean') &&
    (!('furnitureSnapStrength' in value) || typeof value.furnitureSnapStrength === 'number') &&
    (!('furnitureCornerSnapStrength' in value) || typeof value.furnitureCornerSnapStrength === 'number')
  )
}

function normalizeDraftDisplayOptions(draft: DraftState) {
  normalizeDraftCanvasSettings(draft)
}

function isStructureLike(value: unknown): value is Structure {
  if (!isRecord(value)) {
    return false
  }

  return Array.isArray(value.floors) && typeof value.name === 'string'
}

function validateEntityName(name: string, label: string) {
  const result = validateName(name)

  if (!result.valid) {
    throw new Error(`${label}: ${result.error}`)
  }
}

export function validateStructureNames(structure: Structure) {
  validateEntityName(structure.name, 'Invalid structure name')
  structure.floors.forEach((floor, floorIndex) => {
    validateEntityName(floor.name, `Invalid floor name at index ${floorIndex}`)
    floor.rooms.forEach((room, roomIndex) => {
      validateEntityName(room.name, `Invalid room name at index ${roomIndex}`)
      room.furniture.forEach((item, furnitureIndex) => {
        validateEntityName(item.name, `Invalid furniture name at index ${furnitureIndex}`)
      })
    })
  })
}

export function validateDraftNames(draft: DraftState) {
  draft.structures.forEach((structure) => validateStructureNames(structure))
}
