/**
 * Whether the visit memory form has something to write.
 *
 * A note or a mood is enough. A photo-only memory has neither, so a change
 * to its sharing choice is enough on its own: the photographs are already
 * stored, and sharing is the only field left. A checkbox on a form that has
 * no row yet does not count — that would create an empty memory.
 */
export function memoryCanSave(input: {
  note: string
  mood: string | null
  shared: boolean
  storedVisibility: 'public' | 'private' | null
}): boolean {
  if (input.note.trim() || input.mood) return true
  if (input.storedVisibility == null) return false
  return input.shared !== (input.storedVisibility === 'public')
}
