// Display helpers for Electron-style accelerators such as "CmdOrCtrl+Shift+F".

export const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)

const LABELS = {
  CmdOrCtrl: IS_MAC ? '⌘' : 'Ctrl',
  Alt:       IS_MAC ? '⌥' : 'Alt',
  Shift:     IS_MAC ? '⇧' : 'Shift',
}

/** "CmdOrCtrl+Shift+F" → ['Ctrl', 'Shift', 'F'] (platform-aware). */
export function accelParts(accelerator) {
  return accelerator ? accelerator.split('+').map(p => LABELS[p] || p) : []
}
