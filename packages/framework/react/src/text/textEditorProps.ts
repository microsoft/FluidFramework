/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { UndoRedo } from "../undoRedo.js";

/**
 * Common props shared by all text editor components that integrate with {@link UndoRedo}.
 * @input @internal
 */
export interface TextEditorProps {
	/**
	 * Optional undo/redo manager.
	 * @remarks
	 * When provided, undo/redo buttons are rendered and each user edit is wrapped in a
	 * transaction so it can be undone/redone independently of edits made by other components
	 * sharing the same manager.
	 */
	readonly undoRedo?: UndoRedo;

	/**
	 * Label used to tag edits made by this component.
	 * @remarks
	 * Only commits stamped with this label are targeted when the undo/redo buttons are clicked.
	 * If omitted, the `root` tree node is used as the label directly, giving each unique tree
	 * node its own independent undo/redo history automatically.
	 */
	readonly editLabel?: unknown;
}
