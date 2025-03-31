/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Tree, type TreeNode } from "@fluidframework/tree/legacy";
import { useState, useEffect } from "react";

/**
 * Custom hook which invalidates a React Component when there is a change in the subtree defined by `subtreeRoot`.
 * This includes changes to the tree's content, but not changes to its parentage.
 * See {@link @fluidframework/tree#TreeChangeEvents.treeChanged} for details.
 * @privateRemarks
 * Without a way to get invalidation callbacks for specific fields,
 * it's impractical to implement an ergonomic and efficient more fine-grained invalidation hook.
 * @public
 */
export function useTree(subtreeRoot: TreeNode): void {
	// Use a React effect hook to invalidate this component when the subtreeRoot changes.
	// We do this by incrementing a counter, which is passed as a dependency to the effect hook.
	const [invalidations, setInvalidations] = useState(0);

	// React effect hook that increments the 'invalidation' counter whenever subtreeRoot or any of its children change.
	useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return Tree.on(subtreeRoot, "treeChanged", () => {
			setInvalidations((i) => i + 1);
		});
	}, [invalidations, subtreeRoot]);
}
