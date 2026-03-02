import { useState, useEffect } from 'react'
import PropTypes from 'prop-types'
import styles from './BuilderProfileForm.module.css'

export default function BuilderProfileForm({ profile, loading, onSave }) {
  const [income, setIncome] = useState('')
  const [numChildren, setNumChildren] = useState(0)
  const [childrenAges, setChildrenAges] = useState('')
  const [location, setLocation] = useState('')
  const [housingType, setHousingType] = useState('rent')
  const [events, setEvents] = useState('')
  const [otherInfo, setOtherInfo] = useState('')

  useEffect(() => {
    if (profile) {
      setIncome(profile.expected_income ?? '')
      setNumChildren(profile.num_children ?? 0)
      setChildrenAges(Array.isArray(profile.children_ages) ? profile.children_ages.join(', ') : '')
      setLocation(profile.location ?? '')
      setHousingType(profile.housing_type ?? 'rent')
      setEvents(Array.isArray(profile.upcoming_events) ? profile.upcoming_events.join(', ') : '')
      setOtherInfo(profile.other_info ?? '')
    }
  }, [profile])

  const handleSave = () => {
    const ages = childrenAges.trim()
      ? childrenAges.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n))
      : []
    const eventList = events.trim()
      ? events.split(',').map(s => s.trim()).filter(Boolean)
      : []
    onSave({
      expected_income: income === '' ? null : Number(income),
      num_children: Number(numChildren) || 0,
      children_ages: ages,
      location,
      housing_type: housingType,
      upcoming_events: eventList,
      other_info: otherInfo,
    })
  }

  return (
    <div className={styles.form}>
      <div className={styles.rowInline}>
        <div className={styles.row}>
          <label className={styles.label} htmlFor="bb-income">Expected Monthly Income</label>
          <input id="bb-income" type="number" className={styles.inputSmall}
            value={income} onChange={e => setIncome(e.target.value)} placeholder="6000" />
        </div>
        <div className={styles.row}>
          <label className={styles.label} htmlFor="bb-location">Location</label>
          <input id="bb-location" type="text" className={styles.input}
            value={location} onChange={e => setLocation(e.target.value)} placeholder="Austin, TX" />
        </div>
      </div>

      <div className={styles.rowInline}>
        <div className={styles.row}>
          <label className={styles.label} htmlFor="bb-children">Number of Children</label>
          <input id="bb-children" type="number" className={styles.inputSmall}
            value={numChildren} onChange={e => setNumChildren(e.target.value)} min="0" />
        </div>
        <div className={styles.row}>
          <label className={styles.label} htmlFor="bb-ages">Children Ages (comma-separated)</label>
          <input id="bb-ages" type="text" className={styles.input}
            value={childrenAges} onChange={e => setChildrenAges(e.target.value)} placeholder="4, 7" />
        </div>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Housing</span>
        <div className={styles.radioGroup}>
          <label className={styles.radioLabel}>
            <input type="radio" name="housing" value="rent"
              checked={housingType === 'rent'} onChange={() => setHousingType('rent')} />
            Rent
          </label>
          <label className={styles.radioLabel}>
            <input type="radio" name="housing" value="own"
              checked={housingType === 'own'} onChange={() => setHousingType('own')} />
            Own
          </label>
        </div>
      </div>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="bb-events">Upcoming Events (comma-separated)</label>
        <input id="bb-events" type="text" className={styles.input}
          value={events} onChange={e => setEvents(e.target.value)} placeholder="Spring soccer, vacation" />
      </div>

      <div className={styles.row}>
        <label className={styles.label} htmlFor="bb-other">Other Info</label>
        <textarea id="bb-other" className={styles.textarea}
          value={otherInfo} onChange={e => setOtherInfo(e.target.value)} placeholder="Any other context..." />
      </div>

      <div className={styles.actions}>
        <button className={styles.btnPrimary} onClick={handleSave} disabled={loading}>
          {loading ? 'Saving…' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}

BuilderProfileForm.propTypes = {
  profile: PropTypes.object,
  loading: PropTypes.bool.isRequired,
  onSave: PropTypes.func.isRequired,
}
