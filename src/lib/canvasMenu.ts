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
      return items
    }
    case 'room':
      return [
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
      ]
    case 'wall':
      return [
        { kind: 'action', id: 'edit-wall', label: 'Edit wall measurements' },
        { kind: 'action', id: 'add-wall-after', label: 'Insert wall after' },
        { kind: 'action', id: 'delete-wall', label: 'Delete wall', destructive: true },
      ]
    case 'corner':
      return [
        { kind: 'action', id: 'edit-corner', label: 'Edit corner angle' },
      ]
    case 'furniture':
      return [
        { kind: 'action', id: 'edit-furniture', label: 'Edit furniture' },
        { kind: 'action', id: 'rename-furniture', label: 'Rename furniture' },
        { kind: 'action', id: 'delete-furniture', label: 'Delete furniture', destructive: true },
      ]
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
      return items
    }
  }
}
