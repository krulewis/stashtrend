import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../nav.js'
import styles from './Sidebar.module.css'

export default function Sidebar() {
  return (
    <nav className={styles.sidebar} aria-label="Main navigation">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
          }
        >
          <span className={styles.navIcon}>{item.icon}</span>
          <span className={styles.navLabel}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
