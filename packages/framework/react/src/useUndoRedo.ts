/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { useContext, useEffect, useReducer } from "react";

import type { LabeledUndoRedo } from "./undoRedo.js";
import { UndoRedoContext } from "./undoRedoContext.js";

/**
 * React hook that provides the {@link LabeledUndoRedo} manager from context and
 * automatically re-renders the calling component whenever the undo/redo stack state
 * changes (i.e. when {@link LabeledUndoRedo.canUndo} or {@link LabeledUndoRedo.canRedo}
 * may have changed).
 *
 * @remarks
 * Must be used inside a component tree wrapped with a {@link UndoRedoContext} provider.
 * Returns `undefined` when no provider is present.
 *
 * Use the returned manager to call `canUndo`, `canRedo`, `undo`, and `redo` directly;
 * the hook ensures the component re-renders after each state change so button disabled
 * states stay in sync without manual subscription boilerplate.
 *
 * @example
 * ```tsx
 * const editorLabel = Symbol("my-editor");
 *
 * function MyEditor() {
 *     const manager = useUndoRedo();
 *     return (
 *         <>
 *             <button
 *                 disabled={manager?.canUndo(editorLabel) !== true}
 *                 onClick={() => manager?.undo(editorLabel)}
 *             >
 *                 Undo
 *             </button>
 *             <button
 *                 disabled={manager?.canRedo(editorLabel) !== true}
 *                 onClick={() => manager?.redo(editorLabel)}
 *             >
 *                 Redo
 *             </button>
 *         </>
 *     );
 * }
 * ```
 *
 * @internal
 */
export function useUndoRedo(): LabeledUndoRedo | undefined {
	const manager = useContext(UndoRedoContext);
	const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
	useEffect(() => {
		return manager?.onStateChange(() => forceUpdate());
	}, [manager]);
	return manager;
}
