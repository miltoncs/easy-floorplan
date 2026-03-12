import type { CanvasTarget } from '../types'

export type CanvasMenuActionId =
  | 'activate-floor'
  | 'add-floor'
  | 'add-furniture'
  | 'add-room'
  | 'add-wall'
  | 'add-wall-after'
  | 'clear-measurements'
  | 'delete-floor'
  | 'delete-furniture'
  | 'delete-room'
  | 'delete-wall'
  | 'edit-corner'
  | 'edit-furniture'
  | 'edit-wall'
  | 'export-structure'
  | 'fit-view'
  | 'measure-from-here'
  | 'open-detail'
  | 'rotate-room-180'
  | 'rotate-room-clockwise-90'
  | 'rotate-room-counterclockwise-90'
  | 'rotate-room-custom'
  | 'rename-floor'
  | 'rename-furniture'
  | 'rename-room'
  | 'rename-structure'

export type CanvasMenuActionItem = {
  kind: 'action'
  id: CanvasMenuActionId
  label: string
  destructive?: boolean
}

export type CanvasMenuSubmenuItem = {
  kind: 'submenu'
  id: string
  label: string
  items: CanvasMenuActionItem[]
}

export type CanvasMenuItem = CanvasMenuActionItem | CanvasMenuSubmenuItem

export function getCanvasMenuItems(
  target: CanvasTarget,
  options: {
    canDeleteFloor: boolean
    hasSelectedRoom: boolean
    canMeasureFromHere: boolean
    hasMeasurements: boolean
    includeMeasurementActions: boolean
  },
): CanvasMenuItem[] {
  switch (target.kind) {
    case 'structure':
      return [
        { kind: 'action', id: 'rename-structure', label: 'Rename structure' },
        { kind: 'action', id: 'add-floor', label: 'Add floor' },
        { kind: 'action', id: 'export-structure', label: 'Export structure JSON' },
        { kind: 'action', id: 'open-detail', label: 'Open detail page' },
      ]
    case 'floor': {
      const items: CanvasMenuItem[] = [
        { kind: 'action', id: 'activate-floor', label: 'Activate floor' },
        { kind: 'action', id: 'rename-floor', label: 'Rename floor' },
        { kind: 'action', id: 'add-room', label: 'Add room' },
      ]
      if (options.canDeleteFloor) {
        items.push({ kind: 'action', id: 'delete-floor', label: 'Delete floor', destructive: true })
      }
      return appendMeasurementItems(items, options)
    }
    case 'room':
      return appendMeasurementItems([
        { kind: 'action', id: 'rename-room', label: 'Rename room' },
        {
          kind: 'submenu',
          id: 'rotate-room',
          label: 'Rotate',
          items: [
            { kind: 'action', id: 'rotate-room-clockwise-90', label: '90° ↻' },
            { kind: 'action', id: 'rotate-room-counterclockwise-90', label: '90° ↺' },
            { kind: 'action', id: 'rotate-room-180', label: '180°' },
            { kind: 'action', id: 'rotate-room-custom', label: 'Custom' },
          ],
        },
        { kind: 'action', id: 'open-detail', label: 'Open detail page' },
        { kind: 'action', id: 'add-wall', label: 'Add wall' },
        { kind: 'action', id: 'delete-room', label: 'Delete room', destructive: true },
      ], options)
    case 'wall':
      return appendMeasurementItems([
        { kind: 'action', id: 'edit-wall', label: 'Edit wall measurements' },
        { kind: 'action', id: 'add-wall-after', label: 'Insert wall after' },
        { kind: 'action', id: 'delete-wall', label: 'Delete wall', destructive: true },
      ], options)
    case 'corner':
      return appendMeasurementItems([
        { kind: 'action', id: 'edit-corner', label: 'Edit corner angle' },
      ], options)
    case 'furniture':
      return appendMeasurementItems([
        { kind: 'action', id: 'edit-furniture', label: 'Edit furniture' },
        { kind: 'action', id: 'rename-furniture', label: 'Rename furniture' },
        { kind: 'action', id: 'delete-furniture', label: 'Delete furniture', destructive: true },
      ], options)
    case 'canvas': {
      const items: CanvasMenuItem[] = [
        { kind: 'action', id: 'add-room', label: 'Add room' },
        { kind: 'action', id: 'add-floor', label: 'Add floor' },
        { kind: 'action', id: 'fit-view', label: 'Fit view' },
        { kind: 'action', id: 'open-detail', label: 'Open detail page' },
      ]
      if (options.hasSelectedRoom) {
        items.splice(2, 0, { kind: 'action', id: 'add-furniture', label: 'Add furniture' })
      }
      return appendMeasurementItems(items, options)
    }
  }
}

function appendMeasurementItems(
  items: CanvasMenuItem[],
  options: {
    canMeasureFromHere: boolean
    hasMeasurements: boolean
    includeMeasurementActions: boolean
  },
) {
  if (!options.includeMeasurementActions) {
    return items
  }

  const measurementItems: CanvasMenuItem[] = []

  if (options.canMeasureFromHere) {
    measurementItems.push({ kind: 'action', id: 'measure-from-here', label: 'Measure From Here' })
  }

  if (options.hasMeasurements) {
    measurementItems.push({ kind: 'action', id: 'clear-measurements', label: 'Clear All Measurements' })
  }

  return measurementItems.length > 0 ? [...measurementItems, ...items] : items
}
