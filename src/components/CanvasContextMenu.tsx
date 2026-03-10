import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEditor } from '../context/EditorContext'
import { getCanvasMenuItems, type CanvasMenuActionId } from '../lib/canvasMenu'

export function CanvasContextMenu() {
  const navigate = useNavigate()
  const { activeStructure, selectedRoom, ui, actions } = useEditor()
  const menuRef = useRef<HTMLDivElement | null>(null)

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

  if (!ui.contextMenu) {
    return null
  }

  const { target, x, y } = ui.contextMenu
  const canDeleteFloor =
    target.kind === 'floor'
      ? (activeStructure?.floors.length ?? 0) > 1
      : (activeStructure?.floors.length ?? 0) > 1
  const items = getCanvasMenuItems(target, {
    canDeleteFloor,
    hasSelectedRoom: Boolean(selectedRoom),
  })

  return (
    <div
      ref={menuRef}
      aria-label="Canvas context menu"
      className="canvas-context-menu"
      role="menu"
      style={{ left: x, top: y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.id}
          className={item.destructive ? 'context-menu-item danger' : 'context-menu-item'}
          role="menuitem"
          type="button"
          onClick={() => {
            runMenuAction(item.id)
            actions.closeContextMenu()
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  )

  function runMenuAction(actionId: CanvasMenuActionId) {
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
      if (target.kind === 'floor') {
        actions.selectFloor(target.structureId, target.floorId)
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

    if (actionId === 'activate-floor' && target.kind === 'floor') {
      actions.selectFloor(target.structureId, target.floorId)
      return
    }

    if (actionId === 'rename-structure' && target.kind === 'structure') {
      actions.openRenameDialog('structure', { structureId: target.structureId })
      return
    }

    if (actionId === 'rename-floor' && target.kind === 'floor') {
      actions.openRenameDialog('floor', {
        structureId: target.structureId,
        floorId: target.floorId,
      })
      return
    }

    if (actionId === 'rename-room' && target.kind === 'room') {
      actions.selectRoom(target.structureId, target.floorId, target.roomId)
      actions.openRenameDialog('room', {
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
      })
      return
    }

    if (actionId === 'rename-furniture' && target.kind === 'furniture') {
      actions.selectFurniture(target.structureId, target.floorId, target.roomId, target.furnitureId)
      actions.openRenameDialog('furniture', {
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        furnitureId: target.furnitureId,
      })
      return
    }

    if (actionId === 'add-wall' && target.kind === 'room') {
      actions.selectRoom(target.structureId, target.floorId, target.roomId)
      actions.addWall()
      return
    }

    if (actionId === 'edit-wall' && target.kind === 'wall') {
      actions.selectTarget(target)
      actions.openWallDialog({
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        segmentId: target.segmentId,
      })
      return
    }

    if (actionId === 'edit-corner' && target.kind === 'corner') {
      actions.selectTarget(target)
      actions.openCornerDialog({
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        segmentId: target.segmentId,
      })
      return
    }

    if (actionId === 'add-wall-after' && target.kind === 'wall') {
      actions.insertWallAfter(target.structureId, target.floorId, target.roomId, target.segmentId)
      return
    }

    if (actionId === 'edit-furniture' && target.kind === 'furniture') {
      actions.selectFurniture(target.structureId, target.floorId, target.roomId, target.furnitureId)
      actions.openFurnitureDialog({
        structureId: target.structureId,
        floorId: target.floorId,
        roomId: target.roomId,
        furnitureId: target.furnitureId,
      })
      return
    }

    if (actionId === 'delete-room' && target.kind === 'room') {
      actions.deleteRoom(target.structureId, target.floorId, target.roomId)
      return
    }

    if (actionId === 'delete-floor' && target.kind === 'floor') {
      actions.deleteFloor(target.structureId, target.floorId)
      return
    }

    if (actionId === 'delete-wall' && target.kind === 'wall') {
      actions.deleteWall(target.structureId, target.floorId, target.roomId, target.segmentId)
      return
    }

    if (actionId === 'delete-furniture' && target.kind === 'furniture') {
      actions.deleteFurniture(target.structureId, target.floorId, target.roomId, target.furnitureId)
    }
  }
}
