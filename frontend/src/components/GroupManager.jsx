import { useState, useMemo } from 'react'
import styles from './GroupManager.module.css'
import { fmtFull } from './chartUtils.jsx'
import { createGroup, updateGroup, deleteGroup } from '../api.js'

const PRESET_COLORS = [
  '#6366f1', // indigo
  '#34d399', // emerald
  '#f59e0b', // amber
  '#f87171', // red
  '#38bdf8', // sky
  '#a78bfa', // violet
  '#fb923c', // orange
  '#4ade80', // green
]

function groupAccountsByType(accounts) {
  const groups = {}
  for (const acct of accounts) {
    const key = acct.type || 'Other'
    if (!groups[key]) groups[key] = []
    groups[key].push(acct)
  }
  return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
}

// ─── Inline editor panel ─────────────────────────────────────────────────────
function GroupForm({ initial, accounts, onSave, onCancel, saving, error }) {
  const [name, setName]         = useState(initial?.name || '')
  const [color, setColor]       = useState(initial?.color || PRESET_COLORS[0])
  const [selected, setSelected] = useState(new Set(initial?.account_ids || []))
  const [search, setSearch]     = useState('')

  const byType = useMemo(() => groupAccountsByType(accounts), [accounts])

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleType = (typeAccounts) => {
    const ids = typeAccounts.map((a) => a.id)
    const allSelected = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) ids.forEach((id) => next.delete(id))
      else ids.forEach((id) => next.add(id))
      return next
    })
  }

  const filteredByType = useMemo(() => {
    if (!search.trim()) return byType
    const q = search.toLowerCase()
    return byType
      .map(([type, accts]) => [
        type,
        accts.filter(
          (a) =>
            a.name.toLowerCase().includes(q) ||
            (a.institution || '').toLowerCase().includes(q)
        ),
      ])
      .filter(([, accts]) => accts.length > 0)
  }, [byType, search])

  const handleSubmit = () => {
    onSave({ name, color, account_ids: [...selected] })
  }

  return (
    <div className={styles.form}>
      <div className={styles.formTitle}>{initial ? 'Edit Group' : 'New Group'}</div>

      {error && <div className={styles.formError}>{error}</div>}

      <label className={styles.label}>Group Name</label>
      <input
        className={styles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Liquid Assets"
        autoFocus
      />

      <label className={styles.label}>Color</label>
      <div className={styles.colorRow}>
        {PRESET_COLORS.map((c) => (
          <div
            key={c}
            onClick={() => setColor(c)}
            className={styles.colorSwatch}
            style={{
              background: c,
              outline: color === c ? '3px solid white' : '3px solid transparent',
            }}
          />
        ))}
      </div>

      <label className={styles.label}>
        Accounts
        <span className={styles.labelCount}>{selected.size} selected</span>
      </label>
      <input
        className={styles.input}
        style={{ marginBottom: 8 }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search accounts…"
      />

      <div className={styles.accountPicker}>
        {filteredByType.length === 0 && (
          <div className={styles.emptySearch}>No accounts match "{search}"</div>
        )}
        {filteredByType.map(([type, typeAccounts]) => {
          const allSel  = typeAccounts.every((a) => selected.has(a.id))
          const someSel = typeAccounts.some((a) => selected.has(a.id))
          return (
            <div key={type} className={styles.typeGroup}>
              <div className={styles.typeHeader} onClick={() => toggleType(typeAccounts)}>
                <input
                  type="checkbox"
                  readOnly
                  checked={allSel}
                  ref={(el) => el && (el.indeterminate = someSel && !allSel)}
                  style={{ cursor: 'pointer' }}
                />
                <span className={styles.typeLabel}>{type}</span>
                <span className={styles.typeCount}>{typeAccounts.length}</span>
              </div>
              {typeAccounts.map((acct) => (
                <div
                  key={acct.id}
                  className={styles.accountRow}
                  style={{ background: selected.has(acct.id) ? '#252a3d' : 'transparent' }}
                  onClick={() => toggle(acct.id)}
                >
                  <input
                    type="checkbox"
                    readOnly
                    checked={selected.has(acct.id)}
                    style={{ cursor: 'pointer', flexShrink: 0 }}
                  />
                  <div className={styles.accountInfo}>
                    <div className={styles.accountName}>{acct.name}</div>
                    {acct.institution && (
                      <div className={styles.accountInst}>{acct.institution}</div>
                    )}
                  </div>
                  <div className={styles.accountBal}>{fmtFull(acct.current_balance)}</div>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className={styles.formActions}>
        <button className={styles.btnCancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          className={styles.btnSave}
          style={{ opacity: saving || !name.trim() ? 0.5 : 1 }}
          onClick={handleSubmit}
          disabled={saving || !name.trim()}
        >
          {saving ? 'Saving…' : initial ? 'Save Changes' : 'Create Group'}
        </button>
      </div>
    </div>
  )
}

// ─── Group list panel ─────────────────────────────────────────────────────────
function GroupList({ groups, editingGroupId, showingNewForm, onNew, onEdit, onDelete }) {
  return (
    <div className={styles.listPanel}>
      <div className={styles.listHeader}>
        <span className={styles.listTitle}>Groups</span>
        <button className={styles.btnNew} onClick={onNew}>+ New Group</button>
      </div>

      {groups.length === 0 && !showingNewForm && (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>⬡</div>
          <div className={styles.emptyTitle}>No groups yet</div>
          <div className={styles.emptyMsg}>Create a group to start tracking custom account buckets.</div>
          <button className={styles.btnNewLarge} onClick={onNew}>Create your first group</button>
        </div>
      )}

      {groups.map((g) => {
        const isEditing = editingGroupId === g.id
        return (
          <div
            key={g.id}
            className={styles.groupCard}
            style={{
              background:  isEditing ? 'var(--bg-hover)' : '#1a1f30',
              borderColor: isEditing ? g.color           : 'var(--border)',
            }}
          >
            <div className={styles.groupCardLeft}>
              <div className={styles.groupDot} style={{ background: g.color }} />
              <div>
                <div className={styles.groupName}>{g.name}</div>
                <div className={styles.groupMeta}>{g.account_ids.length} accounts</div>
              </div>
            </div>
            <div className={styles.groupCardActions}>
              <button className={styles.iconBtn} onClick={() => onEdit(g)} title="Edit">✎</button>
              <button
                className={styles.iconBtn}
                style={{ color: 'var(--color-negative)' }}
                onClick={() => onDelete(g)}
                title="Delete"
              >
                ✕
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main GroupManager ────────────────────────────────────────────────────────
export default function GroupManager({ groups, accounts, onGroupsChanged }) {
  const [mode,      setMode]      = useState(null)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState(null)
  const [listError, setListError] = useState(null)

  const openNew   = () => { setMode({ type: 'new' }); setFormError(null) }
  const openEdit  = (g) => { setMode({ type: 'edit', group: g }); setFormError(null) }
  const closeForm = () => { setMode(null); setFormError(null) }

  const handleSave = async (data) => {
    setSaving(true)
    setFormError(null)
    try {
      if (mode.type === 'edit') {
        await updateGroup(mode.group.id, data)
      } else {
        await createGroup(data)
      }
      onGroupsChanged()
      closeForm()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (group) => {
    if (!window.confirm(`Delete group "${group.name}"?`)) return
    setListError(null)
    try {
      await deleteGroup(group.id)
      onGroupsChanged()
    } catch (err) {
      setListError(err.message)
    }
  }

  return (
    <div className={styles.root}>
      <div>
        {listError && <div className={styles.listError}>{listError}</div>}
        <GroupList
          groups={groups}
          editingGroupId={mode?.type === 'edit' ? mode.group.id : null}
          showingNewForm={mode?.type === 'new'}
          onNew={openNew}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </div>

      {/* Right: form panel */}
      {mode && (
        <div className={styles.formPanel}>
          <GroupForm
            key={mode.type === 'edit' ? mode.group.id : 'new'}
            initial={mode.type === 'edit' ? mode.group : null}
            accounts={accounts}
            onSave={handleSave}
            onCancel={closeForm}
            saving={saving}
            error={formError}
          />
        </div>
      )}
    </div>
  )
}
