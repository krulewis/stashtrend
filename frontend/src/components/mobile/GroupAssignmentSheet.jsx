import { useEffect, useRef, useState, useCallback } from 'react'
import PropTypes from 'prop-types'
import styles from './GroupAssignmentSheet.module.css'

/** Stable ID prefix for the sheet heading, used by aria-labelledby. */
const TITLE_ID = 'group-assignment-sheet-title'

/**
 * GroupAssignmentSheet
 *
 * Bottom sheet for moving a budget category to a different group.
 * Uses a native <dialog> element for built-in focus trapping and
 * Escape-key handling via the browser's cancel event.
 *
 * Props:
 *   isOpen          — controls whether the sheet is visible
 *   onClose         — called when the sheet should close (Cancel, Escape, backdrop, swipe)
 *   categoryName    — display name of the category being moved
 *   currentGroup    — the group the category currently belongs to
 *   availableGroups — array of all group name strings to display as radio options
 *   onMove          — called with the chosen group name string when Move is tapped
 *   triggerRef      — ref to the element that opened the sheet (for focus return on close)
 */
export default function GroupAssignmentSheet({
  isOpen,
  onClose,
  categoryName,
  currentGroup,
  availableGroups,
  onMove,
  triggerRef,
}) {
  const dialogRef = useRef(null)

  // Track what element had focus before the sheet opened so we can restore it.
  const previousFocusRef = useRef(null)

  const [selectedGroup, setSelectedGroup]   = useState(currentGroup ?? null)
  const [isCreatingNew, setIsCreatingNew]   = useState(false)
  const [newGroupName, setNewGroupName]     = useState('')
  const newGroupInputRef                    = useRef(null)

  // ── Swipe-to-dismiss tracking ────────────────────────────────────────────

  const swipeStartYRef = useRef(null)

  const handleIndicatorTouchStart = (e) => {
    swipeStartYRef.current = e.touches[0].clientY
  }

  const handleIndicatorTouchEnd = (e) => {
    if (swipeStartYRef.current === null) return
    const delta = e.changedTouches[0].clientY - swipeStartYRef.current
    swipeStartYRef.current = null
    if (delta > 80) {
      onClose()
    }
  }

  // ── Open / close synchronisation with <dialog> ───────────────────────────

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen) {
      // Save focus before opening so we can restore it on close.
      previousFocusRef.current = document.activeElement

      // Reset local state each time the sheet opens.
      setSelectedGroup(currentGroup ?? null)
      setIsCreatingNew(false)
      setNewGroupName('')

      // Open as modal — provides focus trap + Escape via 'cancel' event.
      if (!dialog.open) {
        dialog.showModal()
      }

      // Lock body scroll while sheet is open.
      document.body.style.overflow = 'hidden'

      // Move focus to the sheet heading so screen readers announce the title.
      const heading = dialog.querySelector(`#${TITLE_ID}`)
      heading?.focus()
    } else {
      if (dialog.open) {
        dialog.close()
      }

      // Restore body scroll.
      document.body.style.overflow = ''

      // Return focus to the element that opened the sheet.
      const target = triggerRef?.current ?? previousFocusRef.current
      target?.focus()
    }

    // Cleanup: restore body scroll if the component unmounts while open.
    return () => { document.body.style.overflow = '' }
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps
  // Intentional: currentGroup is intentionally excluded — we only reset state
  // on open/close transitions, not on every currentGroup prop change.

  // ── Native 'cancel' event from <dialog> (Escape key) ────────────────────

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const handleCancel = (e) => {
      // Prevent the browser from closing the dialog on its own so our
      // onClose handler (which controls isOpen) drives the lifecycle.
      e.preventDefault()
      onClose()
    }

    dialog.addEventListener('cancel', handleCancel)
    return () => dialog.removeEventListener('cancel', handleCancel)
  }, [onClose])

  // ── Backdrop click to close ──────────────────────────────────────────────

  const handleDialogClick = (e) => {
    // The <dialog> element's bounding rect is the sheet itself.
    // Clicks on the ::backdrop area land on the <dialog> element but outside
    // the sheet's rendered area — detect by checking if the click target is
    // the dialog element itself (not a child).
    if (e.target === dialogRef.current) {
      onClose()
    }
  }

  // ── Auto-focus the new-group input when it appears ───────────────────────

  useEffect(() => {
    if (isCreatingNew) {
      newGroupInputRef.current?.focus()
    }
  }, [isCreatingNew])

  // ── Move action ──────────────────────────────────────────────────────────

  const isMoveDisabled = isCreatingNew
    ? newGroupName.trim() === ''
    : selectedGroup === currentGroup

  const handleMove = useCallback(() => {
    const target = isCreatingNew ? newGroupName.trim() : selectedGroup
    if (!target) return
    onMove(target)
    // onClose is NOT called here — the parent's onMove handler owns the close lifecycle.
  }, [isCreatingNew, newGroupName, selectedGroup, onMove])

  // Allow submitting the new-group input with Enter.
  const handleNewGroupKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleMove()
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-labelledby={TITLE_ID}
      onClick={handleDialogClick}
    >
      {/* Drag indicator — also the swipe-to-dismiss handle */}
      <div
        className={styles.indicator}
        onTouchStart={handleIndicatorTouchStart}
        onTouchEnd={handleIndicatorTouchEnd}
        aria-hidden="true"
      />

      {/* Sheet heading — receives focus on open for screen reader announcement */}
      <h2
        id={TITLE_ID}
        className={styles.title}
        tabIndex={-1}
      >
        Move &ldquo;{categoryName}&rdquo; to:
      </h2>

      {/* Radio group list */}
      <ul
        className={styles.groupList}
        role="radiogroup"
        aria-label="Select group"
      >
        {availableGroups.map((groupName) => {
          const isSelected = selectedGroup === groupName
          const isCurrent  = groupName === currentGroup

          return (
            <li
              key={groupName}
              className={styles.groupItem}
              role="radio"
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => {
                setSelectedGroup(groupName)
                setIsCreatingNew(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSelectedGroup(groupName)
                  setIsCreatingNew(false)
                }
                // Arrow key navigation between radio items.
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const items = dialogRef.current?.querySelectorAll('[role="radio"]')
                  if (!items) return
                  const arr    = Array.from(items)
                  const idx    = arr.indexOf(e.currentTarget)
                  const next   = e.key === 'ArrowDown'
                    ? arr[Math.min(idx + 1, arr.length - 1)]
                    : arr[Math.max(idx - 1, 0)]
                  next?.focus()
                }
              }}
            >
              {/* Visual radio circle */}
              <span
                className={`${styles.radio} ${isSelected ? styles.radioSelected : ''}`}
                aria-hidden="true"
              />

              <span className={styles.groupName}>
                {groupName}
                {isCurrent && (
                  <span className={styles.groupNameCurrent}> (current)</span>
                )}
              </span>
            </li>
          )
        })}

        {/* Divider + "Create new group" row */}
        <li className={styles.createRowWrapper}>
          {isCreatingNew ? (
            <input
              ref={newGroupInputRef}
              type="text"
              className={styles.createInput}
              placeholder="Group name"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={handleNewGroupKeyDown}
              aria-label="New group name"
            />
          ) : (
            <button
              type="button"
              className={styles.createRow}
              onClick={() => {
                setIsCreatingNew(true)
                setSelectedGroup(null)
              }}
            >
              <span className={styles.createIcon} aria-hidden="true">+</span>
              Create new group&hellip;
            </button>
          )}
        </li>
      </ul>

      {/* Action buttons */}
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={onClose}
        >
          Cancel
        </button>

        <button
          type="button"
          className={styles.moveBtn}
          onClick={handleMove}
          disabled={isMoveDisabled}
        >
          Move
        </button>
      </div>
    </dialog>
  )
}

GroupAssignmentSheet.propTypes = {
  isOpen:          PropTypes.bool.isRequired,
  onClose:         PropTypes.func.isRequired,
  categoryName:    PropTypes.string,
  currentGroup:    PropTypes.string,
  availableGroups: PropTypes.arrayOf(PropTypes.string).isRequired,
  onMove:          PropTypes.func.isRequired,
  triggerRef:      PropTypes.object,
}

GroupAssignmentSheet.defaultProps = {
  categoryName: '',
  currentGroup: null,
  triggerRef:   null,
}
