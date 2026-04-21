# Undo/Redo Manager — Design Document

## Problem Statement

The current implementation uses separate `UndoRedoStacks` and `LabeledUndoRedoStacks` classes that each subscribe independently to tree change events. Both subscribe to different events (`commitApplied` vs `changed`) but receive the same `getRevertible` factory per commit. Calling that factory more than once throws:

> "Cannot generate the same revertible more than once."

This makes it impossible to have both a global stack and a per-editor labeled stack active on the same tree view simultaneously, with the current `@fluidframework/tree` APIs.

## Goals

- One listener per tree view — eliminates the multi-subscriber crash.
- Per-editor undo/redo via commit labels, without affecting other editors.
- A well-defined global undo/redo mode (no label) that operates across all commits.
- Graceful handling of unlabeled (anonymous) commits, since labels are opt-in in the tree API.
- State-change notifications so UI components can react to external stack mutations.
- Delivered via React context so editor components do not need an `undoRedo` prop.

---

## Architecture

A single `UndoRedoManager` instance (implementing `LabeledUndoRedo`) is created per tree view (one per `UserPanel`). It subscribes to the `changed` event exactly once and calls `getRevertible()` for each incoming commit. Every commit — labeled or anonymous — is stored in a single ordered undo stack as a `StackEntry`:

```typescript
interface StackEntry {
    revertible: Revertible;
    /** Labels associated with the commit. Empty set = anonymous. */
    labels: ReadonlySet<symbol>;
}
```

The undo and redo stacks are each a `StackEntry[]`, ordered oldest-to-newest (top of stack = last element).

---

## API

`LabeledUndoRedo` extends the existing `UndoRedo` interface, adding an optional `label` parameter to each operation. The implementing class is `UndoRedoManager`.

```typescript
interface LabeledUndoRedo extends UndoRedo {
    /** Undo the most recent commit whose labels include the given label.
     *  If no label is provided, undoes the most recent commit regardless of labels.
     *  No-ops silently if there is nothing to undo matching the label policy. */
    undo(label?: symbol): void;

    /** Redo the most recent undone commit whose labels include the given label.
     *  If no label is provided, redoes the most recent undone commit regardless of labels.
     *  No-ops silently if there is nothing to redo matching the label policy. */
    redo(label?: symbol): void;

    /** Returns true if there is at least one undoable commit matching the label policy. */
    canUndo(label?: symbol): boolean;

    /** Returns true if there is at least one redoable commit matching the label policy. */
    canRedo(label?: symbol): boolean;

    /** Subscribe to stack state changes. Returns an unsubscribe function.
     *  Fires whenever any commit is pushed to or popped from either stack,
     *  regardless of label.
     *  Subscribers should re-query canUndo / canRedo in response.
     *  TODO: Consider adding an optional label parameter for per-label subscriptions
     *  to avoid unnecessary re-renders in large component trees. */
    onStateChange(callback: () => void): () => void;

    dispose(): void;
}
```

### Label semantics on `undo` / `redo` / `canUndo` / `canRedo`

| Call | Behavior |
|---|---|
| `undo()` | Pops and reverts the top of the undo stack (any labels). No-op if the undo stack is empty. |
| `undo(label)` | Finds the most recent entry whose `labels` set contains `label`, reverts it. Entries whose label sets do not contain `label` are skipped — they remain on the undo stack untouched. No-op if no matching entry exists. |
| `canUndo()` | `true` if the undo stack is non-empty. |
| `canUndo(label)` | `true` if any entry in the undo stack has `label` in its `labels` set. |
| `redo(...)` / `canRedo(...)` | Mirror of the above, operating on the redo stack. |

---

## Undo Stack Semantics

All commits are stored in a single time-ordered undo stack. Labels are metadata on each entry; they do not separate the stack into independent sub-stacks. Labeled and anonymous entries coexist and are interleaved in arrival order.

When `undo(label)` skips over entries with non-matching labels, those entries are **not** undone — they stay on the undo stack exactly where they are. Only the targeted entry is removed and its revertible invoked.

---

## Redo Invalidation Policy

The redo stack is also a single time-ordered list. When a new user commit arrives (i.e., not from the manager's own revert call), the manager clears redo entries according to the commit's label:

| New commit labels | Redo entries cleared |
|---|---|
| Non-empty set `{A, B, ...}` | All entries whose `labels` set intersects the new commit's labels (i.e. `entry.labels.has(A) || entry.labels.has(B) || ...`). |
| Empty set (anonymous) | All entries whose `labels` set is empty. |

Entries with no label overlap — including anonymous entries when a labeled commit arrives, and labeled entries when an anonymous commit arrives — are **not** cleared. This preserves redo history across independent editors.

---

## Internal: Routing Undo/Redo Commits

When the manager calls `revertible.revert()`, the tree fires a `changed` event for the resulting commit. The manager must not treat this as a new user commit. It handles this with a `#pendingOperation` field:

```typescript
#pendingOperation: { kind: "undo" | "redo"; labels: ReadonlySet<symbol> } | undefined;
```

**Undo flow:**
1. `undo(label)` locates the target entry, sets `#pendingOperation = { kind: "undo", labels: entry.labels }`.
2. Calls `entry.revertible.revert()`.
3. The `changed` event fires synchronously with a new `getRevertible` factory.
4. The handler sees `#pendingOperation.kind === "undo"`: calls `getRevertible()` to obtain the redo revertible, pushes `{ revertible, labels: entry.labels }` onto the redo stack preserving the original labels, clears `#pendingOperation`.

**Redo flow:** Mirror of the above — `#pendingOperation.kind === "redo"` routes the new revertible back onto the undo stack with the original labels.

**Normal commit flow:** `#pendingOperation` is `undefined` — the handler calls `getRevertible()`, pushes the entry onto the undo stack, and applies the redo invalidation policy for the commit's label.

---

## React Integration

### Context

A `UndoRedoContext` React context holds the single `LabeledUndoRedo` instance for a subtree:

```typescript
const UndoRedoContext = React.createContext<LabeledUndoRedo | undefined>(undefined);
```

The context is provided at the `UserPanel` level (one `UndoRedoManager` per user's tree view):

```tsx
<UndoRedoContext.Provider value={manager}>
    {/* editor components */}
</UndoRedoContext.Provider>
```

### Component labels

Each editor component defines a module-level `symbol` constant that it uses as its commit label and as the argument to `undo` / `redo` calls. A module-level singleton is safe because at most one instance of each component exists per client.

```typescript
// In plainTextView.tsx
export const plainTextViewLabel = Symbol("plain-text");
```

Components access the manager via context and call `undo` / `redo` with their own label:

```tsx
const manager = useContext(UndoRedoContext);
// ...
<button onClick={() => manager?.undo(plainTextViewLabel)} />
```

### State change subscription

Components that render undo/redo button state subscribe to `onStateChange` to trigger re-renders when the stacks change:

```typescript
useEffect(() => {
    if (!manager) return;
    return manager.onStateChange(() => forceUpdate());
}, [manager]);
```

Because `onStateChange` fires for any label's stack change, all subscribed components re-evaluate on any mutation. This is a small and acceptable overhead.

### Migration in the app

`UserPanel` currently creates separate `LabeledUndoRedoStacks` instances per editor and passes them as `undoRedo` props. After this change:

- `UserPanel` creates one `UndoRedoManager` and provides it via context.
- Editor components remove their `undoRedo` prop.
- Editor components read the manager from context and call `undo(myLabel)` directly.
- Module-level label symbols remain in each component file; `UserPanel` no longer needs to import or manage them.

---

## Classes Affected

| Class / file | Change |
|---|---|
| `UndoRedoStacks` | Replaced by `UndoRedoManager`. |
| `LabeledUndoRedoStacks` | Replaced by `UndoRedoManager`. |
| `UndoRedo` interface | Retained as the base interface. |
| `LabeledUndoRedo` interface | New interface extending `UndoRedo` with optional `label` parameters. |
| `UndoRedoManager` class | New class implementing `LabeledUndoRedo`. |
| `plainTextView.tsx` | Reads `LabeledUndoRedo` from context; removes `undoRedo` prop; calls `undo(myLabel)`. |
| `quillView.tsx` | Same as above. |
| `quillFormattedView.tsx` | Same as above. |
| `app.tsx` (`UserPanel`) | Creates `UndoRedoManager`, wraps children in `UndoRedoContext.Provider`; removes per-editor stack creation. |

---

## Resolved Decisions

1. **Interface hierarchy**: `LabeledUndoRedo` extends `UndoRedo`. `UndoRedoManager` implements `LabeledUndoRedo`. This keeps the existing `UndoRedo` interface intact for any code that doesn't need label-awareness.

2. **Per-label `onStateChange`**: Not added for now. A TODO comment in the implementation notes this as a future optimization. Subscribers simply re-query `canUndo` / `canRedo` on any state change.

3. **No-op on empty stack**: `undo(label?)` and `redo(label?)` are silent no-ops when there is nothing matching the label policy to revert. This is documented in the API and the label semantics table above.
