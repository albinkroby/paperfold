const path = require('path')

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/**
 * Turn user input into a safe single file/folder name.
 * - strips path separators and characters illegal on Windows
 * - keeps Unicode letters, case and spaces (so titles round-trip losslessly)
 * - never returns an empty string, a dot-name, or a Windows reserved name
 */
function sanitizeName(name, fallback = 'Untitled') {
  let s = String(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')       // no hidden files / ".."
    .replace(/[. ]+$/, '')     // Windows disallows trailing dots/spaces
  if (!s) s = fallback
  if (RESERVED_NAMES.test(s)) s += '_'
  return s.slice(0, 120)
}

/** True only when `target` is strictly inside `root` (not root itself). */
function isInside(root, target) {
  if (typeof root !== 'string' || typeof target !== 'string' || !root || !target) return false
  const rel = path.relative(path.resolve(root), path.resolve(target))
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** "name.ext", then "name (1).ext", "name (2).ext"… using the supplied exists() check. */
function uniquePath(dir, base, ext, exists) {
  let candidate = path.join(dir, base + ext)
  for (let n = 1; exists(candidate); n++) {
    candidate = path.join(dir, `${base} (${n})${ext}`)
  }
  return candidate
}

/** Short one-line excerpt of `text` around the first match of `query`. */
function makeSnippet(text, query, radius = 60) {
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return ''
  const start = Math.max(0, idx - radius)
  const end = Math.min(text.length, idx + query.length + radius)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
}

module.exports = { sanitizeName, isInside, uniquePath, makeSnippet }
