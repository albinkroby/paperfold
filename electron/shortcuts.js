// Rebindable menu shortcuts: definitions, validation and conflict checks.
// Pure functions only (no Electron imports) so they can be unit tested.

/** Actions the user may rebind. `id` doubles as the key in the store. */
const SHORTCUT_DEFS = [
  { id: 'newPage',   label: 'New page',          description: 'Create a page in the current notebook.',  default: 'CmdOrCtrl+N' },
  { id: 'save',      label: 'Save',              description: 'Save the open page immediately.',          default: 'CmdOrCtrl+S' },
  { id: 'quickOpen', label: 'Quick open page',   description: 'Jump to any page by title.',               default: 'CmdOrCtrl+P' },
  { id: 'search',    label: 'Search notebooks',  description: 'Full-text search across every page.',      default: 'CmdOrCtrl+Shift+F' },
]

// Fixed shortcuts that rebinding must not collide with (menu roles + editor).
const RESERVED = new Set([
  'CmdOrCtrl+Z', 'CmdOrCtrl+Shift+Z', 'CmdOrCtrl+Y', 'CmdOrCtrl+X', 'CmdOrCtrl+C', 'CmdOrCtrl+V',
  'CmdOrCtrl+A', 'CmdOrCtrl+Q', 'CmdOrCtrl+R', 'CmdOrCtrl+=', 'CmdOrCtrl+-', 'CmdOrCtrl+0',
  'CmdOrCtrl+B', 'CmdOrCtrl+I', 'CmdOrCtrl+U', 'F12',
].map(s => s.toLowerCase()))

const MODIFIERS = ['CmdOrCtrl', 'Alt', 'Shift']
const KEY_RE = /^([A-Z0-9]|F([1-9]|1[0-9]|2[0-4])|Space|Tab|Backspace|Delete|Insert|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|[`\-=\[\];',./\\])$/

/** Canonical form: modifiers in fixed order, key last. Returns null if invalid. */
function normalizeAccelerator(accel) {
  if (typeof accel !== 'string' || !accel) return null
  const parts = accel.split('+')
  const key = parts.pop()
  if (!KEY_RE.test(key)) return null
  const seen = new Set()
  for (const p of parts) {
    if (!MODIFIERS.includes(p) || seen.has(p)) return null
    seen.add(p)
  }
  const isFunctionKey = /^F\d+$/.test(key)
  // Plain letters/digits would hijack typing, so require Ctrl/Cmd or Alt (F-keys are exempt).
  if (!isFunctionKey && !seen.has('CmdOrCtrl') && !seen.has('Alt')) return null
  return [...MODIFIERS.filter(m => seen.has(m)), key].join('+')
}

/**
 * Check `accel` for action `id` against the current bindings.
 * Returns { ok: true, accelerator } or { ok: false, error }.
 */
function validateBinding(current, id, accel) {
  const normalized = normalizeAccelerator(accel)
  if (!normalized) {
    return { ok: false, error: 'Use Ctrl (or Alt) plus a key, for example Ctrl+Shift+K.' }
  }
  if (RESERVED.has(normalized.toLowerCase())) {
    return { ok: false, error: 'That shortcut is used by the editor or a built-in command.' }
  }
  const clash = SHORTCUT_DEFS.find(d => d.id !== id && current[d.id]?.toLowerCase() === normalized.toLowerCase())
  if (clash) return { ok: false, error: `Already used by “${clash.label}”.` }
  return { ok: true, accelerator: normalized }
}

/** Defaults overlaid with any valid saved overrides. */
function resolveShortcuts(overrides = {}) {
  const result = {}
  for (const def of SHORTCUT_DEFS) {
    const saved = normalizeAccelerator(overrides?.[def.id])
    result[def.id] = saved || def.default
  }
  return result
}

module.exports = { SHORTCUT_DEFS, normalizeAccelerator, validateBinding, resolveShortcuts }
