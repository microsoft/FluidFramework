/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TextAsTree } from "./schema.js";

/**
 * Sync `newText` into the provided `root` tree.
 */
export function syncTextToTree(root: TextAsTree.Tree, newText: string): void {
	// TODO: we should probably either avoid depending on this, or attempt to infer a smaller delta.

	// Clear existing content and insert new text
	const length = root.characterCount();
	if (length > 0) {
		root.removeRange(0, length);
	}
	if (newText.length > 0) {
		root.insertAt(0, newText);
	}
}
