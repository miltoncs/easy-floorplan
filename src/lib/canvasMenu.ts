import type { CanvasTarget } from '../types'

export type CanvasMenuActionId =
  | 'activate-floor'
  | 'add-floor'
  | 'add-furniture'
  | 'add-room'
  | 'add-wall'
  | 'add-wall-after'
  | 'delete-floor'
  | 'delete-furniture'
  | 'delete-room'
  | 'delete-wall'
  | 'edit-corner'
  | 'edit-furniture'
  | 'edit-wall'
  | 'export-structure'
  | 'fit-view'
  | 'open-detail'
  | 'rename-floor'
  | 'rename-furniture'
  | 'rename-room'
  | 'rename-structure'

export type CanvasMenuItem = {
  id: CanvasMenuActionId
  label: string
  destructive?: boolean
}

export function getCanvasMenuItems(
  target: CanvasTarget,
  options: {
    canDeleteFloor: boolean
    hasSelectedRoom: boolean
  },
): CanvasMenuItem[] {
  switch (target.kind) {
    case 'structure':
      return [
        { id: 'rename-structure', label: 'Rename structure' },
        { id: 'add-floor', label: 'Add floor' },
        { id: 'export-structure', label: 'Export structure JSON' },
        { id: 'open-detail', label: 'Open detail page' },
      ]
    case 'floor': {
      const items: CanvasMenuItem[] = [
        { id: 'activate-floor', label: 'Activate floor' },
        { id: 'rename-floor', label: 'Rename floor' },
        { id: 'add-room', label: 'Add room' },
      ]
      if (options.canDeleteFloor) {
        items.push({ id: 'delete-floor', label: 'Delete floor', destructive: true })
      }
      return items
    }
    case 'room':
      return [
        { id: 'rename-room', label: 'Rename room' },
        { id: 'open-detail', label: 'Open detail page' },
        { id: 'add-wall', label: 'Add wall' },
        { id: 'delete-room', label: 'Delete room', destructive: true },
      ]
    case 'wall':
      return [
        { id: 'edit-wall', label: 'Edit wall measurements' },
        { id: 'add-wall-after', label: 'Insert wall after' },
        { id: 'delete-wall', label: 'Delete wall', destructive: true },
      ]
    case 'corner':
      return [
        { id: 'edit-corner', label: 'Edit corner angle' },
      ]
    case 'furniture':
      return [
        { id: 'edit-furniture', label: 'Edit furniture' },
        { id: 'rename-furniture', label: 'Rename furniture' },
        { id: 'delete-furniture', label: 'Delete furniture', destructive: true },
      ]
    case 'canvas': {
      const items: CanvasMenuItem[] = [
        { id: 'add-room', label: 'Add room' },
        { id: 'add-floor', label: 'Add floor' },
        { id: 'fit-view', label: 'Fit view' },
        { id: 'open-detail', label: 'Open detail page' },
      ]
      if (options.hasSelectedRoom) {
        items.splice(2, 0, { id: 'add-furniture', label: 'Add furniture' })
      }
      return items
    }
  }
}
