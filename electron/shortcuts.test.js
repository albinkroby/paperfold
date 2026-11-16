const test = require('node:test')
const assert = require('node:assert/strict')
const { SHORTCUT_DEFS, normalizeAccelerator, validateBinding, resolveShortcuts } = require('./shortcuts')

const defaults = resolveShortcuts()

test('defaults resolve for every action', () => {
  for (const d of SHORTCUT_DEFS) assert.equal(defaults[d.id], d.default)
})

test('normalizeAccelerator canonicalises modifier order', () => {
  assert.equal(normalizeAccelerator('Shift+CmdOrCtrl+K'), 'CmdOrCtrl+Shift+K')
  assert.equal(normalizeAccelerator('Alt+CmdOrCtrl+F5'), 'CmdOrCtrl+Alt+F5')
})

test('normalizeAccelerator rejects unsafe or malformed input', () => {
  assert.equal(normalizeAccelerator('K'), null)             // bare letter would hijack typing
  assert.equal(normalizeAccelerator('Shift+K'), null)       // Shift alone is not enough
  assert.equal(normalizeAccelerator('CmdOrCtrl+'), null)
  assert.equal(normalizeAccelerator('CmdOrCtrl+CmdOrCtrl+K'), null)
  assert.equal(normalizeAccelerator('Super+K'), null)
  assert.equal(normalizeAccelerator(undefined), null)
  assert.equal(normalizeAccelerator('F5'), 'F5')            // F-keys need no modifier
})

test('validateBinding rejects reserved and duplicate shortcuts', () => {
  assert.equal(validateBinding(defaults, 'save', 'CmdOrCtrl+B').ok, false)       // editor bold
  assert.equal(validateBinding(defaults, 'save', 'CmdOrCtrl+P').ok, false)       // quickOpen already
  assert.match(validateBinding(defaults, 'save', 'CmdOrCtrl+P').error, /Quick open/)
})

test('validateBinding allows keeping or changing to a free shortcut', () => {
  assert.deepEqual(validateBinding(defaults, 'save', 'CmdOrCtrl+S'), { ok: true, accelerator: 'CmdOrCtrl+S' })
  assert.equal(validateBinding(defaults, 'save', 'CmdOrCtrl+Alt+S').ok, true)
})

test('resolveShortcuts ignores invalid saved overrides', () => {
  const r = resolveShortcuts({ save: 'nonsense', newPage: 'CmdOrCtrl+Alt+N' })
  assert.equal(r.save, 'CmdOrCtrl+S')
  assert.equal(r.newPage, 'CmdOrCtrl+Alt+N')
})
