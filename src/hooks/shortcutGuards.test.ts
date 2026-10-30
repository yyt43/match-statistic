import { describe, expect, it } from 'vitest';
import {
  OVERLAY_SELECTOR,
  classifyHomeShortcut,
  hasOpenOverlay,
  isEditableShortcutTarget,
  resolveHomeShortcut,
} from './shortcutGuards';

describe('hasOpenOverlay', () => {
  it('detects an open modal through the shared overlay selector', () => {
    const queried: string[] = [];
    const doc = {
      querySelector: (selector: string) => {
        queried.push(selector);
        return {};
      },
    };

    expect(hasOpenOverlay(doc)).toBe(true);
    expect(queried).toEqual([OVERLAY_SELECTOR]);
  });

  it('returns false when no overlay matches or the document is missing', () => {
    expect(hasOpenOverlay({ querySelector: () => null })).toBe(false);
    expect(hasOpenOverlay(null)).toBe(false);
    expect(hasOpenOverlay(undefined)).toBe(false);
  });
});

describe('isEditableShortcutTarget', () => {
  it('treats form controls and contentEditable as editable', () => {
    expect(isEditableShortcutTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableShortcutTarget({ tagName: 'textarea' })).toBe(true);
    expect(isEditableShortcutTarget({ tagName: 'SELECT' })).toBe(true);
    expect(isEditableShortcutTarget({ tagName: 'div', isContentEditable: true })).toBe(true);
  });

  it('does not treat regular elements or missing targets as editable', () => {
    expect(isEditableShortcutTarget({ tagName: 'button' })).toBe(false);
    expect(isEditableShortcutTarget({ tagName: 'div', isContentEditable: false })).toBe(false);
    expect(isEditableShortcutTarget(null)).toBe(false);
    expect(isEditableShortcutTarget(undefined)).toBe(false);
  });
});

describe('classifyHomeShortcut', () => {
  const base = { ctrlKey: false, metaKey: false, shiftKey: false };

  it('classifies undo/redo/command-palette shortcuts', () => {
    expect(classifyHomeShortcut({ ...base, key: 'z', ctrlKey: true })).toBe('undo');
    expect(classifyHomeShortcut({ ...base, key: 'Z', metaKey: true })).toBe('undo');
    expect(classifyHomeShortcut({ ...base, key: 'z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(classifyHomeShortcut({ ...base, key: 'y', ctrlKey: true })).toBe('redo');
    expect(classifyHomeShortcut({ ...base, key: 'k', ctrlKey: true })).toBe('open-command-palette');
    expect(classifyHomeShortcut({ ...base, key: 'K', metaKey: true })).toBe('open-command-palette');
  });

  it('ignores shortcuts without a modifier or unrelated keys', () => {
    expect(classifyHomeShortcut({ ...base, key: 'z' })).toBeNull();
    expect(classifyHomeShortcut({ ...base, key: 'a', ctrlKey: true })).toBeNull();
  });
});

describe('resolveHomeShortcut', () => {
  it('swallows every global shortcut while an overlay is open', () => {
    const options = { hasOpenOverlay: true, targetEditable: false };
    expect(resolveHomeShortcut('undo', options)).toBeNull();
    expect(resolveHomeShortcut('redo', options)).toBeNull();
    expect(resolveHomeShortcut('open-command-palette', options)).toBeNull();
  });

  it('keeps undo/redo out of editable fields but allows the command palette', () => {
    const options = { hasOpenOverlay: false, targetEditable: true };
    expect(resolveHomeShortcut('undo', options)).toBeNull();
    expect(resolveHomeShortcut('redo', options)).toBeNull();
    expect(resolveHomeShortcut('open-command-palette', options)).toBe('open-command-palette');
  });

  it('passes shortcuts through on normal page targets', () => {
    const options = { hasOpenOverlay: false, targetEditable: false };
    expect(resolveHomeShortcut('undo', options)).toBe('undo');
    expect(resolveHomeShortcut('redo', options)).toBe('redo');
    expect(resolveHomeShortcut('open-command-palette', options)).toBe('open-command-palette');
    expect(resolveHomeShortcut(null, options)).toBeNull();
  });
});
