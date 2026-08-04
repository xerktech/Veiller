/**
 * Diff two strings into what was removed then added between them. Used by the
 * Tap Strap tester to turn a TextInput onChangeText into per-edit log entries —
 * reliable regardless of whether the edit came from a HID keystroke, a paste, or
 * a backspace, unlike onKeyPress which is inconsistent for hardware keyboards on
 * Android.
 *
 * Collapses the change to a single removed/added span by trimming the common
 * prefix and suffix, so "abc" → "aXbc" reports added "X" (not a full rewrite).
 */
export function diffEdit(prev: string, next: string): {removed: string; added: string} {
  let p = 0
  while (p < prev.length && p < next.length && prev[p] === next[p]) p++
  let s = 0
  while (s < prev.length - p && s < next.length - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++
  return {removed: prev.slice(p, prev.length - s), added: next.slice(p, next.length - s)}
}
