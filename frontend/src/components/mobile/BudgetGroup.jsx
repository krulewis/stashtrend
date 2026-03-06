import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import {
  DndContext,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import BudgetPill from './BudgetPill.jsx'
import BudgetLineItem from './BudgetLineItem.jsx'
import styles from './BudgetGroup.module.css'

export default function BudgetGroup({
  groupName,
  categories,
  isReorderMode,
  onReorder,
  onMoveRequest,
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Force expanded when entering reorder mode
  useEffect(() => {
    if (isReorderMode) {
      setIsExpanded(true)
    }
  }, [isReorderMode])

  const sensors = useSensors(
    useSensor(TouchSensor, {
      activationConstraint: { distance: 8 },
    })
  )

  const groupActual   = categories.reduce((s, c) => s + (c.actual   ?? 0), 0)
  const groupBudgeted = categories.reduce((s, c) => s + (c.budgeted ?? 0), 0)

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex(c => c.category_id === active.id)
    const newIndex = categories.findIndex(c => c.category_id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(categories, oldIndex, newIndex).map(c => c.category_id)
    onReorder?.(groupName, newOrder)
  }

  const contentId = `group-${groupName}-content`
  const headerId  = `group-${groupName}-header`

  return (
    <div className={styles.card}>
      <div
        id={headerId}
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className={styles.groupHeader}
        onClick={isReorderMode ? undefined : () => setIsExpanded(prev => !prev)}
        onKeyDown={(e) => {
          if (isReorderMode) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            setIsExpanded(prev => !prev)
          }
        }}
      >
        <span
          className={`${styles.chevron} ${isExpanded ? styles.chevronExpanded : ''}`}
          aria-hidden="true"
        >
          ›
        </span>
        <span className={styles.groupName}>{groupName}</span>
        <BudgetPill actual={groupActual} budgeted={groupBudgeted} size="standard" />
      </div>

      <div
        className={`${styles.groupContent} ${isExpanded ? styles.groupContentExpanded : ''}`}
      >
        <div
          id={contentId}
          className={styles.groupContentInner}
          role="region"
          aria-labelledby={headerId}
        >
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={categories.map(c => c.category_id)}
              strategy={verticalListSortingStrategy}
            >
              {categories.map(cat => (
                <BudgetLineItem
                  key={cat.category_id}
                  categoryId={cat.category_id}
                  categoryName={cat.category_name}
                  actual={cat.actual}
                  budgeted={cat.budgeted}
                  isReorderMode={isReorderMode}
                  onMoveRequest={onMoveRequest}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  )
}

BudgetGroup.propTypes = {
  groupName: PropTypes.string.isRequired,
  categories: PropTypes.arrayOf(
    PropTypes.shape({
      category_id:   PropTypes.string.isRequired,
      category_name: PropTypes.string.isRequired,
      actual:        PropTypes.number,
      budgeted:      PropTypes.number,
    })
  ).isRequired,
  isReorderMode: PropTypes.bool,
  onReorder:     PropTypes.func,
  onMoveRequest: PropTypes.func,
}

BudgetGroup.defaultProps = {
  isReorderMode: false,
  onReorder:     undefined,
  onMoveRequest: undefined,
}
