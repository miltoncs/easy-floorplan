import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditor } from '../context/EditorContext'
import { getCanvasMenuItems, type CanvasMenuActionId, type CanvasMenuItem } from '../lib/canvasMenu'
import type { CanvasTarget } from '../types'

type MenuEntry = {
  item: CanvasMenuItem
  target: CanvasTarget
}

export function CanvasContextMenu() {
  const navigate = useNavigate()
  const { activeStructure, selectedRoom, ui, actions } = useEditor()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [openSubmenuKey, setOpenSubmenuKey] = useState<string | null>(null)

  useEffect(() => {
    if (!ui.contextMenu) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        actions.closeContextMenu()
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [actions, ui.contextMenu])

  useEffect(() => {
    setOpenSubmenuKey(null)
  }, [ui.contextMenu])

  if (!ui.contextMenu) {
    return null
  }

  const { target, x, y } = ui.contextMenu
  const canDeleteFloor =
    target.kind === 'floor'
      ? (activeStructure?.floors.length ?? 0) > 1
      : (activeStructure?.floors.length ?? 0) > 1
  const items: MenuEntry[] = getContextMenuTargets(target).flatMap((menuTarget) =>
    getCanvasMenuItems(menuTarget, {
      canDeleteFloor,
      hasSelectedRoom: Boolean(selectedRoom),
      canMeasureFromHere: target.kind !== 'structure' && Boolean(ui.contextMenu?.canvasPoint),
      hasMeasurements: ui.measurements.length > 0 || ui.pendingMeasurementStart !== null,
      includeMeasurementActions: menuTarget.kind === target.kind && target.kind !== 'structure',
    }).map((item) => ({
      item,
      target: menuTarget,
    })),
  )

  return (
    <div
      ref={menuRef}
      aria-label="Canvas context menu"
      className="canvas-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((entry) => {
        if (entry.item.kind === 'submenu') {
          const key = getMenuEntryKey(entry.target, entry.item.id)
          const submenuOpen = openSubmenuKey === key

          return (
            <div
              className="context-menu-submenu"
              key={key}
              onMouseEnter={() => setOpenSubmenuKey(key)}
            >
              <button
                aria-expanded={submenuOpen}
                aria-haspopup="menu"
                className="context-menu-item context-menu-item--submenu"
                role="menuitem"
                type="button"
                onClick={() => setOpenSubmenuKey(key)}
              >
                <span>{entry.item.label}</span>
                <span aria-hidden="true" className="context-menu-item__caret">
                  ▸
                </span>
              </button>
              {submenuOpen ? (
                <div aria-label={`${entry.item.label} submenu`} className="canvas-context-submenu" role="menu">
                  {entry.item.items.map((submenuItem) => (
                    <button
                      key={getMenuEntryKey(entry.target, submenuItem.id)}
                      className={submenuItem.destructive ? 'context-menu-item danger' : 'context-menu-item'}
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        runMenuAction(submenuItem.id, entry.target)
                        actions.closeContextMenu()
                      }}
                    >
                      {submenuItem.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }

        const actionItem = entry.item
        const key = getMenuEntryKey(entry.target, actionItem.id)

        return (
          <button
            key={key}
            className={actionItem.destructive ? 'context-menu-item danger' : 'context-menu-item'}
            role="menuitem"
            type="button"
            onClick={() => {
              runMenuAction(actionItem.id, entry.target)
              actions.closeContextMenu()
            }}
          >
            {actionItem.label}
          </button>
        )
      })}
    </div>
  )

  function runMenuAction(actionId: CanvasMenuActionId, actionTarget: CanvasTarget) {
    if (actionId === 'measure-from-here') {
      if (ui.contextMenu?.canvasPoint) {
        actions.startMeasurement(ui.contextMenu.canvasPoint)
      }
      return
    }

    if (actionId === 'clear-measurements') {
      actions.clearMeasurements()
      return
    }

    if (actionId === 'fit-view') {
      actions.resetCamera()
      return
    }

    if (actionId === 'open-detail') {
      navigate('/detail')
      return
    }

    if (actionId === 'add-floor') {
      actions.addFloor()
      return
    }

    if (actionId === 'add-room') {
      if (actionTarget.kind === 'floor') {
        actions.selectFloor(actionTarget.structureId, actionTarget.floorId)
      }
      actions.addRoom()
      return
    }

    if (actionId === 'add-furniture') {
      actions.addFurniture()
      return
    }

    if (actionId === 'export-structure') {
      actions.exportActiveStructure()
      return
    }

    if (actionId === 'activate-floor' && actionTarget.kind === 'floor') {
      actions.selectFloor(actionTarget.structureId, actionTarget.floorId)
      return
    }

    if (actionId === 'rename-structure' && actionTarget.kind === 'structure') {
      actions.openRenameDialog('structure', { structureId: actionTarget.structureId })
      return
    }

    if (actionId === 'rename-floor' && actionTarget.kind === 'floor') {
      actions.openRenameDialog('floor', {
        structureId: actionTarget.structureId,
        floorId: actionTarget.floorId,
      })
      return
    }

    if (actionId === 'rename-room' && actionTarget.kind === 'room') {
      actions.selectRoom(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId)
      actions.openRenameDialog('room', {
        structureId: actionTarget.structureId,
        floorId: actionTarget.floorId,
        roomId: actionTarget.roomId,
      })
      return
    }

    if (actionTarget.kind === 'room' && actionId === 'rotate-room-clockwise-90') {
      actions.selectRoom(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId)
      actions.rotateRoom(
        {
          structureId: actionTarget.structureId,
          floorId: actionTarget.floorId,
          roomId: actionTarget.roomId,
        },
        {
          degrees: 90,
          direction: 'clockwise',
        },
      )
      return
    }

    if (actionTarget.kind === 'room' && actionId === 'rotate-room-counterclockwise-90') {
      actions.selectRoom(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId)
      actions.rotateRoom(
        {
          structureId: actionTarget.structureId,
          floorId: actionTarget.floorId,
          roomId: actionTarget.roomId,
        },
        {
          degrees: 90,
          direction: 'counterclockwise',
        },
      )
      return
    }

    if (actionTarget.kind === 'room' && actionId === 'rotate-room-180') {
      actions.selectRoom(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId)
      actions.rotateRoom(
        {
          structureId: actionTarget.structureId,
          floorId: actionTarget.floorId,
          roomId: actionTarget.roomId,
        },
        {
          degrees: 180,
          direction: 'clockwise',
        },
      )
      return
    }

    if (actionTarget.kind === 'room' && actionId === 'rotate-room-custom') {
      actions.selectRoom(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId)
      actions.openRoomRotationDialog({
        structureId: actionTarget.structureId,
        floorId: actionTarget.floorId,
        roomId: actionTarget.roomId,
      })
      return
    }

    if (actionId === 'rename-furniture' && actionTarget.kind === 'furniture') {
      actions.selectFurniture(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId, actionTarget.furnitureId)
      actions.openRenameDialog('furniture', {
        structureId: actionTarget.structureId,
        floorId: actionTarget.floorId,
        roomId: actionTarget.roomId,
        furnitureId: actionTarget.furnitureId,
      })
      return
    }

    if (actionId === 'add-wall' && actionTarget.kind === 'room') {
      actions.selectRoom(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId)
      actions.addWall()
      return
    }

    if (actionId === 'edit-wall' && actionTarget.kind === 'wall') {
      actions.selectTarget(actionTarget)
      actions.openWallDialog({
        structureId: actionTarget.structureId,
        floorId: actionTarget.floorId,
        roomId: actionTarget.roomId,
        segmentId: actionTarget.segmentId,
      })
      return
    }

    if (actionId === 'edit-corner' && actionTarget.kind === 'corner') {
      actions.selectTarget(actionTarget)
      actions.openCornerDialog({
        structureId: actionTarget.structureId,
        floorId: actionTarget.floorId,
        roomId: actionTarget.roomId,
        segmentId: actionTarget.segmentId,
      })
      return
    }

    if (actionId === 'add-wall-after' && actionTarget.kind === 'wall') {
      actions.insertWallAfter(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId, actionTarget.segmentId)
      return
    }

    if (actionId === 'edit-furniture' && actionTarget.kind === 'furniture') {
      actions.selectFurniture(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId, actionTarget.furnitureId)
      actions.openFurnitureDialog({
        structureId: actionTarget.structureId,
        floorId: actionTarget.floorId,
        roomId: actionTarget.roomId,
        furnitureId: actionTarget.furnitureId,
      })
      return
    }

    if (actionId === 'delete-room' && actionTarget.kind === 'room') {
      actions.deleteRoom(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId)
      return
    }

    if (actionId === 'delete-floor' && actionTarget.kind === 'floor') {
      actions.deleteFloor(actionTarget.structureId, actionTarget.floorId)
      return
    }

    if (actionId === 'delete-wall' && actionTarget.kind === 'wall') {
      actions.deleteWall(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId, actionTarget.segmentId)
      return
    }

    if (actionId === 'delete-furniture' && actionTarget.kind === 'furniture') {
      actions.deleteFurniture(actionTarget.structureId, actionTarget.floorId, actionTarget.roomId, actionTarget.furnitureId)
    }
  }
}

function getContextMenuTargets(target: CanvasTarget): CanvasTarget[] {
  if (target.kind !== 'corner') {
    return [target]
  }

  const wallTarget: CanvasTarget = {
    kind: 'wall',
    structureId: target.structureId,
    floorId: target.floorId,
    roomId: target.roomId,
    segmentId: target.segmentId,
  }

  return [
    target,
    wallTarget,
  ]
}

function getMenuEntryKey(target: CanvasTarget, actionId: string) {
  return `${target.kind}:${JSON.stringify(target)}:${actionId}`
}
