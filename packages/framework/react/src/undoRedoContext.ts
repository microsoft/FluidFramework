/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createContext } from "react";

import type { LabeledUndoRedo } from "./undoRedo.js";

/**
 * React context that provides a {@link LabeledUndoRedo} manager to editor components.
 *
 * @remarks
 * Provide an {@link UndoRedoManager} instance at the appropriate level of the component tree
 * (typically one per user's tree view). Editor components consume this context to perform
 * labeled undo/redo without needing an explicit prop.
 *
 * @example
 * ```tsx
 * // In a parent component, create and provide the manager:
 * function UserPanel({ treeView }) {
 *     const manager = useMemo(() => new UndoRedoManager(treeView), [treeView]);
 *     useEffect(() => () => manager.dispose(), [manager]);
 *     return (
 *         <UndoRedoContext.Provider value={manager}>
 *             <MyEditor />
 *         </UndoRedoContext.Provider>
 *     );
 * }
 *
 * // In a child editor, consume the context via the useUndoRedo hook:
 * function MyEditor() {
 *     const manager = useUndoRedo(); // subscribes + re-renders on state change
 *     return (
 *         <button
 *             disabled={manager?.canUndo(myLabel) !== true}
 *             onClick={() => manager?.undo(myLabel)}
 *         >
 *             Undo
 *         </button>
 *     );
 * }
 * ```
 *
 * @internal
 */
export const UndoRedoContext = createContext<LabeledUndoRedo | undefined>(undefined);
