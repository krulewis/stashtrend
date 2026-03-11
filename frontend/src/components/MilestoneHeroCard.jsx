/**
 * MilestoneHeroCard — Full-width card with two views:
 *   0 = Dashboard Cards (MilestoneCardsView)
 *   1 = Mountain Skyline (MilestoneSkylineView)
 *
 * Toggle uses aria-pressed buttons (not tablist) per architecture decision.
 * View container uses role="region". Conditional rendering (not display:none).
 */
import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { useMilestoneData } from '../hooks/useMilestoneData.js'
import MilestoneCardsView from './MilestoneCardsView.jsx'
import MilestoneSkylineView from './MilestoneSkylineView.jsx'
import styles from './MilestoneHeroCard.module.css'

export default function MilestoneHeroCard({ typeData, retirement }) {
  const [activeView, setActiveView] = useState(0) // 0=cards, 1=chart
  const btn0Ref = useRef(null)
  const btn1Ref = useRef(null)

  const milestoneData = useMilestoneData(typeData, retirement)

  // EC-1, EC-2, EC-12: guard — do not render when data not ready
  if (!milestoneData.shouldRender) return null

  const { milestones, achievedCount, totalCount, mergedSeries, projectionSeries, investableCapital } = milestoneData

  function handleToggleKeyDown(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = activeView === 0 ? 1 : 0
      setActiveView(next)
      // Move focus to the newly activated button
      if (next === 0) btn0Ref.current?.focus()
      else btn1Ref.current?.focus()
    }
  }

  return (
    <section
      aria-labelledby="milestone-hero-title"
      className={styles.container}
      data-testid="milestone-hero-card"
    >
      <div className={styles.header}>
        {/* Title group: eyebrow + title + count badge */}
        <div className={styles.titleGroup}>
          <p className={styles.eyebrow}>Investable Capital</p>
          <h2 className={styles.title} id="milestone-hero-title">Milestones</h2>
          <span className={styles.countBadge}>{achievedCount} of {totalCount} achieved</span>
        </div>

        {/* Header right: view toggle */}
        <div className={styles.headerRight}>
          <div className={styles.viewToggle} aria-label="Milestone view">
            <button
              ref={btn0Ref}
              aria-pressed={activeView === 0}
              className={`${styles.viewBtn} ${activeView === 0 ? styles.viewBtnActive : ''}`}
              onClick={() => setActiveView(0)}
              onKeyDown={handleToggleKeyDown}
            >
              Cards
            </button>
            <button
              ref={btn1Ref}
              aria-pressed={activeView === 1}
              className={`${styles.viewBtn} ${activeView === 1 ? styles.viewBtnActive : ''}`}
              onClick={() => setActiveView(1)}
              onKeyDown={handleToggleKeyDown}
            >
              Chart
            </button>
          </div>
        </div>
      </div>

      {/* View panels — conditional rendering (not display:none) per final plan finding #7 */}
      {activeView === 0 && (
        <div role="region" aria-label="Milestone cards" className={styles.viewPanel}>
          <MilestoneCardsView milestones={milestones} />
        </div>
      )}

      {activeView === 1 && (
        <div role="region" aria-label="Milestone skyline chart" className={styles.viewPanel}>
          <div
            role="img"
            aria-label={`Investable capital history with ${milestones.length} milestone${milestones.length !== 1 ? 's' : ''} shown as reference lines.`}
          >
            <MilestoneSkylineView
              mergedSeries={mergedSeries}
              milestones={milestones}
              investableCapital={investableCapital}
              hasProjection={projectionSeries != null}
            />
          </div>
        </div>
      )}
    </section>
  )
}

MilestoneHeroCard.propTypes = {
  typeData: PropTypes.shape({ series: PropTypes.array }),
  retirement: PropTypes.object,
}
