// A photo-only memory can be saved when its sharing choice differs from the
// stored row, in either direction. Note and mood stay optional for that case.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { memoryCanSave } from '../../src/features/memories/canSave.ts'

const photoOnly = { note: '', mood: null }

test('a photo-only memory can be shared, and can be made private again', () => {
  assert.equal(memoryCanSave({ ...photoOnly, shared: true, storedVisibility: 'private' }), true)
  assert.equal(memoryCanSave({ ...photoOnly, shared: false, storedVisibility: 'public' }), true)
})

test('a photo-only memory whose sharing choice already matches cannot be saved', () => {
  assert.equal(memoryCanSave({ ...photoOnly, shared: false, storedVisibility: 'private' }), false)
  assert.equal(memoryCanSave({ ...photoOnly, shared: true, storedVisibility: 'public' }), false)
})

test('a sharing checkbox with no memory yet does not enable save', () => {
  assert.equal(memoryCanSave({ ...photoOnly, shared: true, storedVisibility: null }), false)
  assert.equal(memoryCanSave({ ...photoOnly, shared: false, storedVisibility: null }), false)
})

test('a note or a mood enables save with or without a stored memory', () => {
  assert.equal(memoryCanSave({ note: 'the gate', mood: null, shared: false, storedVisibility: null }), true)
  assert.equal(memoryCanSave({ note: '   ', mood: 'calm', shared: false, storedVisibility: null }), true)
  assert.equal(memoryCanSave({ note: '', mood: null, shared: false, storedVisibility: null }), false)
})
