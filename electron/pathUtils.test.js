const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const { sanitizeName, isInside, uniquePath, makeSnippet } = require('./pathUtils')

test('sanitizeName strips separators and illegal characters', () => {
  assert.equal(sanitizeName('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij')
  assert.equal(sanitizeName('../../etc/passwd'), 'etcpasswd')
})

test('sanitizeName keeps case, spaces and Unicode', () => {
  assert.equal(sanitizeName('Q3  Results — 日本語'), 'Q3 Results — 日本語')
})

test('sanitizeName never returns empty, dotted or reserved names', () => {
  assert.equal(sanitizeName('', 'Fallback'), 'Fallback')
  assert.equal(sanitizeName('...', 'Fallback'), 'Fallback')
  assert.equal(sanitizeName('trailing. . '), 'trailing')
  assert.equal(sanitizeName('CON'), 'CON_')
  assert.equal(sanitizeName(null, 'X'), 'X')
})

test('isInside accepts children and rejects escapes', () => {
  const root = path.resolve('/notes')
  assert.equal(isInside(root, path.join(root, 'a', 'b.md')), true)
  assert.equal(isInside(root, root), false)                        // root itself is not deletable
  assert.equal(isInside(root, path.join(root, '..', 'other')), false)
  assert.equal(isInside(root, path.resolve('/notes-evil/x.md')), false) // prefix trick
  assert.equal(isInside(root, undefined), false)
})

test('uniquePath appends (n) until free', () => {
  const taken = new Set([path.join('d', 'a.md'), path.join('d', 'a (1).md')])
  assert.equal(uniquePath('d', 'a', '.md', p => taken.has(p)), path.join('d', 'a (2).md'))
  assert.equal(uniquePath('d', 'b', '.md', p => taken.has(p)), path.join('d', 'b.md'))
})

test('makeSnippet returns context around the match', () => {
  const s = makeSnippet('x'.repeat(100) + ' needle ' + 'y'.repeat(100), 'NEEDLE', 10)
  assert.match(s, /needle/)
  assert.ok(s.startsWith('…') && s.endsWith('…'))
  assert.equal(makeSnippet('nothing here', 'zzz'), '')
})
