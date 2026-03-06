import PropTypes from 'prop-types'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import BudgetPill from './BudgetPill.jsx'
import styles from './BudgetLineItem.module.css'

export default function BudgetLineItem({
  categoryId,
  categoryName,
  actual,
  budgeted,
  isReorderMode,
  onMoveRequest,
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: categoryId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const rowClassName = [
    styles.row,
    isDragging ? styles.dragging : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={rowClassName}
      {...attributes}
    >
      {isReorderMode && (
        <div
          className={styles.dragHandle}
          {...listeners}
          aria-roledescription="sortable item"
        >
          <span aria-hidden="true">⠿</span>
        </div>
      )}

      <span className={styles.categoryName}>
        {categoryName}
      </span>

      <div className={styles.pill}>
        <BudgetPill actual={actual} budgeted={budgeted} size="standard" />
      </div>

      {isReorderMode && (
        <button
          type="button"
          className={styles.moveBtn}
          onClick={() => onMoveRequest?.(categoryId)}
          aria-label={`Move ${categoryName} to a different group`}
        >
          ›
        </button>
      )}
    </div>
  )
}

BudgetLineItem.propTypes = {
  categoryId:    PropTypes.string.isRequired,
  categoryName:  PropTypes.string.isRequired,
  actual:        PropTypes.number,
  budgeted:      PropTypes.number,
  isReorderMode: PropTypes.bool,
  onMoveRequest: PropTypes.func,
}

BudgetLineItem.defaultProps = {
  actual:        undefined,
  budgeted:      undefined,
  isReorderMode: false,
  onMoveRequest: undefined,
}
