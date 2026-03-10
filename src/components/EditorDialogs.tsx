import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import type { CornerGeometry, WallSource } from '../types'
import {
  findFloorById,
  findFurnitureById,
  findRoomById,
  findSegmentById,
} from '../lib/blueprint'
import { parseDistanceInput } from '../lib/distance'
import { describeCornerAngle, formatFeet, getCornerAngleBetweenWalls, getRoomCorners, getTurnFromCornerAngle } from '../lib/geometry'
import { countVisibleCharacters, validateName } from '../lib/nameValidation'
import { useEditor } from '../context/EditorContext'

export function EditorDialogs() {
  const { draft, ui, actions } = useEditor()

  if (!ui.dialog) {
    return null
  }

  const dialog = ui.dialog

  if (dialog.kind === 'rename') {
    const value = readEntityName(dialog)

    return (
      <DialogFrame
        title={`Rename ${dialog.entityKind}`}
        subtitle="Names support any Unicode characters up to 128 visible characters."
        onClose={actions.closeDialog}
      >
        <RenameDialogBody
          key={`${dialog.entityKind}-${JSON.stringify(dialog.ids)}`}
          initialValue={value}
          onCancel={actions.closeDialog}
          onSubmit={(nextName) => actions.renameEntity(dialog.entityKind, dialog.ids, nextName)}
        />
      </DialogFrame>
    )
  }

  if (dialog.kind === 'wall') {
    const wall =
      dialog.ids.structureId &&
      dialog.ids.floorId &&
      dialog.ids.roomId &&
      dialog.ids.segmentId
        ? findSegmentById(
            draft,
            dialog.ids.structureId,
            dialog.ids.floorId,
            dialog.ids.roomId,
            dialog.ids.segmentId,
          )
        : null

    if (!wall) {
      return null
    }

    return (
      <DialogFrame
        title="Edit wall"
        subtitle="Adjust the wall label, distance, source, and notes. Corner angles are edited separately."
        onClose={actions.closeDialog}
      >
        <WallDialogBody
          key={`${dialog.ids.roomId}-${dialog.ids.segmentId}`}
          initialValue={wall}
          onCancel={actions.closeDialog}
          onSubmit={(values) => actions.updateWall(dialog.ids, values)}
        />
      </DialogFrame>
    )
  }

  if (dialog.kind === 'corner') {
    const room =
      dialog.ids.structureId &&
      dialog.ids.floorId &&
      dialog.ids.roomId
        ? findRoomById(
            draft,
            dialog.ids.structureId,
            dialog.ids.floorId,
            dialog.ids.roomId,
          )
        : null
    const corner = room && dialog.ids.segmentId
      ? getRoomCorners(room).find((item) => item.segmentId === dialog.ids.segmentId) ?? null
      : null

    if (!corner) {
      return null
    }

    const subtitle = corner.isExit
      ? `Adjust the angle between ${corner.incomingLabel} and the next wall you will trace. 180° keeps them aligned.`
      : `Adjust the angle at the corner between ${corner.incomingLabel} and ${corner.outgoingLabel}.`

    return (
      <DialogFrame
        title="Edit corner angle"
        subtitle={subtitle}
        onClose={actions.closeDialog}
      >
        <CornerDialogBody
          key={`${dialog.ids.roomId}-${dialog.ids.segmentId}`}
          corner={corner}
          onCancel={actions.closeDialog}
          onSubmit={(values) => actions.updateCorner(dialog.ids, values)}
        />
      </DialogFrame>
    )
  }

  const furniture =
    dialog.ids.structureId &&
    dialog.ids.floorId &&
    dialog.ids.roomId &&
    dialog.ids.furnitureId
      ? findFurnitureById(
          draft,
          dialog.ids.structureId,
          dialog.ids.floorId,
          dialog.ids.roomId,
          dialog.ids.furnitureId,
        )
      : null

  if (!furniture) {
    return null
  }

  return (
    <DialogFrame
      title="Edit furniture"
      subtitle="Furniture names use the same Unicode naming rules as structures, floors, and rooms."
      onClose={actions.closeDialog}
    >
      <FurnitureDialogBody
        key={`${dialog.ids.roomId}-${dialog.ids.furnitureId}`}
        initialValue={furniture}
        onCancel={actions.closeDialog}
        onSubmit={(values) => actions.updateFurniture(dialog.ids, values)}
      />
    </DialogFrame>
  )

  function readEntityName(renameDialog: Extract<typeof dialog, { kind: 'rename' }>) {
    if (renameDialog.entityKind === 'structure' && renameDialog.ids.structureId) {
      return draft.structures.find((structure) => structure.id === renameDialog.ids.structureId)?.name ?? ''
    }

    if (renameDialog.entityKind === 'floor' && renameDialog.ids.structureId && renameDialog.ids.floorId) {
      return findFloorById(draft, renameDialog.ids.structureId, renameDialog.ids.floorId)?.name ?? ''
    }

    if (
      renameDialog.entityKind === 'room' &&
      renameDialog.ids.structureId &&
      renameDialog.ids.floorId &&
      renameDialog.ids.roomId
    ) {
      return findRoomById(
        draft,
        renameDialog.ids.structureId,
        renameDialog.ids.floorId,
        renameDialog.ids.roomId,
      )?.name ?? ''
    }

    if (
      renameDialog.entityKind === 'furniture' &&
      renameDialog.ids.structureId &&
      renameDialog.ids.floorId &&
      renameDialog.ids.roomId &&
      renameDialog.ids.furnitureId
    ) {
      return (
        findFurnitureById(
          draft,
          renameDialog.ids.structureId,
          renameDialog.ids.floorId,
          renameDialog.ids.roomId,
          renameDialog.ids.furnitureId,
        )?.name ?? ''
      )
    }

    return ''
  }
}

function DialogFrame({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string
  subtitle: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="dialog-backdrop" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div aria-modal="true" className="dialog-card" role="dialog">
        <div className="dialog-header">
          <div>
            <p className="panel-kicker">Editor dialog</p>
            <h2>{title}</h2>
            <p className="dialog-copy">{subtitle}</p>
          </div>
          <button className="ghost-button small" onClick={onClose} type="button">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function RenameDialogBody({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: string
  onCancel: () => void
  onSubmit: (nextName: string) => ReturnType<typeof validateName>
}) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const visibleLength = countVisibleCharacters(value)

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    const result = onSubmit(value)
    if (!result.valid) {
      setError(result.error)
      return
    }
  }

  return (
    <form className="dialog-form" onSubmit={handleSubmit}>
      <label>
        <span>Name</span>
        <input
          ref={inputRef}
          className="text-input"
          maxLength={512}
          type="text"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
        />
      </label>
      <div className="dialog-meta">
        <span>{visibleLength} / 128 visible characters</span>
        {error ? <span className="validation-error">{error}</span> : null}
      </div>
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary-button" type="submit">
          Save name
        </button>
      </div>
    </form>
  )
}

function WallDialogBody({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: {
    label: string
    length: number
    notes: string
    source: WallSource
  }
  onCancel: () => void
  onSubmit: (values: {
    label: string
    length: number
    notes: string
    source: WallSource
  }) => {
    valid: boolean
    error: string | null
  }
}) {
  const [label, setLabel] = useState(initialValue.label)
  const [length, setLength] = useState(String(initialValue.length))
  const [notes, setNotes] = useState(initialValue.notes)
  const [source, setSource] = useState<WallSource>(initialValue.source)
  const [error, setError] = useState<string | null>(null)
  const lengthInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    lengthInputRef.current?.focus()
    lengthInputRef.current?.select()
  }, [])

  return (
    <form
      className="dialog-form"
      onSubmit={(event) => {
        event.preventDefault()
        const parsedLength = parseDistanceInput(length)

        if (parsedLength === null) {
          setError('Enter a distance in feet, or feet and inches such as 10\'6".')
          return
        }

        const result = onSubmit({
          label,
          length: parsedLength,
          notes,
          source,
        })

        if (!result.valid) {
          setError(result.error)
        }
      }}
    >
      <label>
        <span>Label</span>
        <input
          className="text-input"
          type="text"
          value={label}
          onChange={(event) => {
            setLabel(event.target.value)
            setError(null)
          }}
        />
      </label>
      <div className="field-grid compact">
        <label>
          <span>Length (ft)</span>
          <input
            ref={lengthInputRef}
            className="number-input"
            inputMode="decimal"
            type="text"
            value={length}
            onChange={(event) => {
              setLength(event.target.value)
              setError(null)
            }}
          />
        </label>
      </div>
      <label>
        <span>Notes</span>
        <textarea
          className="text-area"
          rows={3}
          value={notes}
          onChange={(event) => {
            setNotes(event.target.value)
            setError(null)
          }}
        />
      </label>
      <label>
        <span>Measurement source</span>
        <select
          className="text-input"
          value={source}
          onChange={(event) => {
            setSource(event.target.value === 'inferred' ? 'inferred' : 'measured')
            setError(null)
          }}
        >
          <option value="measured">Measured on site</option>
          <option value="inferred">Inferred from geometry</option>
        </select>
      </label>
      {error ? <div className="dialog-meta"><span className="validation-error">{error}</span></div> : null}
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary-button" type="submit">
          Save wall
        </button>
      </div>
    </form>
  )
}

type CornerDirection = 'left' | 'right' | 'straight'

function CornerDialogBody({
  corner,
  onCancel,
  onSubmit,
}: {
  corner: CornerGeometry
  onCancel: () => void
  onSubmit: (values: { turn: number }) => {
    valid: boolean
    error: string | null
  }
}) {
  const initialDirection: CornerDirection =
    Math.abs(corner.turn) < 0.5 ? 'straight' : corner.turn > 0 ? 'left' : 'right'
  const [direction, setDirection] = useState<CornerDirection>(initialDirection)
  const [degrees, setDegrees] = useState(String(getCornerAngleBetweenWalls(corner.turn)))
  const [error, setError] = useState<string | null>(null)
  const angleInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    angleInputRef.current?.focus()
    angleInputRef.current?.select()
  }, [])

  return (
    <form
      className="dialog-form"
      onSubmit={(event) => {
        event.preventDefault()
        const angleBetweenWalls = Math.max(0, Math.min(180, readNumber(degrees, getCornerAngleBetweenWalls(corner.turn))))
        const turn = getTurnFromCornerAngle(angleBetweenWalls, direction)
        const result = onSubmit({ turn })

        if (!result.valid) {
          setError(result.error)
        }
      }}
    >
      <div className="dialog-reference">
        <div>
          <span className="dialog-reference__label">Incoming wall</span>
          <strong>{corner.incomingLabel}</strong>
        </div>
        <div>
          <span className="dialog-reference__label">{corner.isExit ? 'Next wall' : 'Outgoing wall'}</span>
          <strong>{corner.outgoingLabel ?? 'The next wall you add'}</strong>
        </div>
      </div>
      <div className="field-grid compact">
        <label>
          <span>Turn direction</span>
          <select
            className="text-input"
            value={direction}
            onChange={(event) => {
              const nextDirection = event.target.value === 'left' || event.target.value === 'right' ? event.target.value : 'straight'
              setDirection(nextDirection)
              setError(null)
            }}
          >
            <option value="straight">Straight</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
        </label>
        <label>
          <span>Angle (deg)</span>
          <input
            ref={angleInputRef}
            className="number-input"
            max="180"
            min="0"
            step="1"
            type="number"
            value={degrees}
            onChange={(event) => {
              setDegrees(event.target.value)
              setError(null)
            }}
          />
        </label>
      </div>
      <div className="dialog-meta">
        <span>{describeCornerAngle(getTurnFromCornerAngle(readNumber(degrees, getCornerAngleBetweenWalls(corner.turn)), direction))}</span>
        {error ? <span className="validation-error">{error}</span> : null}
      </div>
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary-button" type="submit">
          Save angle
        </button>
      </div>
    </form>
  )
}

function FurnitureDialogBody({
  initialValue,
  onCancel,
  onSubmit,
}: {
  initialValue: {
    name: string
    x: number
    y: number
    width: number
    depth: number
    rotation: number
  }
  onCancel: () => void
  onSubmit: (values: {
    name: string
    x: number
    y: number
    width: number
    depth: number
    rotation: number
  }) => ReturnType<typeof validateName>
}) {
  const [name, setName] = useState(initialValue.name)
  const [x, setX] = useState(formatDistanceFieldValue(initialValue.x))
  const [y, setY] = useState(formatDistanceFieldValue(initialValue.y))
  const [width, setWidth] = useState(formatDistanceFieldValue(initialValue.width))
  const [depth, setDepth] = useState(formatDistanceFieldValue(initialValue.depth))
  const [rotation, setRotation] = useState(String(initialValue.rotation))
  const [error, setError] = useState<string | null>(null)

  const visibleLength = countVisibleCharacters(name)

  return (
    <form
      className="dialog-form"
      onSubmit={(event) => {
        event.preventDefault()
        const parsedX = parseDistanceInput(x)
        const parsedY = parseDistanceInput(y)
        const parsedWidth = parseDistanceInput(width)
        const parsedDepth = parseDistanceInput(depth)

        if (
          parsedX === null ||
          parsedY === null ||
          parsedWidth === null ||
          parsedDepth === null
        ) {
          setError('Distances accept feet or feet-and-inches, such as 10\'6".')
          return
        }

        const result = onSubmit({
          name,
          x: parsedX,
          y: parsedY,
          width: parsedWidth,
          depth: parsedDepth,
          rotation: readNumber(rotation, initialValue.rotation),
        })

        if (!result.valid) {
          setError(result.error)
        }
      }}
    >
      <label>
        <span>Name</span>
        <input
          className="text-input"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
        />
      </label>
      <div className="dialog-meta">
        <span>{visibleLength} / 128 visible characters</span>
        {error ? <span className="validation-error">{error}</span> : null}
      </div>
      <div className="field-grid compact">
        <label>
          <span>X (ft)</span>
          <input
            className="number-input"
            inputMode="decimal"
            type="text"
            value={x}
            onChange={(event) => {
              setX(event.target.value)
              setError(null)
            }}
          />
        </label>
        <label>
          <span>Y (ft)</span>
          <input
            className="number-input"
            inputMode="decimal"
            type="text"
            value={y}
            onChange={(event) => {
              setY(event.target.value)
              setError(null)
            }}
          />
        </label>
        <label>
          <span>Width (ft)</span>
          <input
            className="number-input"
            inputMode="decimal"
            type="text"
            value={width}
            onChange={(event) => {
              setWidth(event.target.value)
              setError(null)
            }}
          />
        </label>
        <label>
          <span>Depth (ft)</span>
          <input
            className="number-input"
            inputMode="decimal"
            type="text"
            value={depth}
            onChange={(event) => {
              setDepth(event.target.value)
              setError(null)
            }}
          />
        </label>
        <label>
          <span>Rotation</span>
          <input
            className="number-input"
            type="number"
            step="1"
            value={rotation}
            onChange={(event) => setRotation(event.target.value)}
          />
        </label>
      </div>
      {error ? <div className="dialog-meta"><span className="validation-error">{error}</span></div> : null}
      <div className="dialog-actions">
        <button className="ghost-button" onClick={onCancel} type="button">
          Cancel
        </button>
        <button className="primary-button" type="submit">
          Save furniture
        </button>
      </div>
    </form>
  )
}

function readNumber(value: string, fallback: number) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function formatDistanceFieldValue(value: number) {
  return formatFeet(value).replace(/\s/g, '')
}
