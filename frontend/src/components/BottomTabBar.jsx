import { NavLink } from 'react-router-dom'
import { NAV_ITEMS } from '../nav.js'
import styles from './BottomTabBar.module.css'

export default function BottomTabBar() {
  return (
    <nav className={styles.bottomBar} aria-label="Mobile navigation">
      {NAV_ITEMS.map(item => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `${styles.tabItem} ${isActive ? styles.tabItemActive : ''}`
          }
        >
          <span className={styles.tabIcon}>{item.icon}</span>
          <span className={styles.tabLabel}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
