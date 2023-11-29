/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeContext, FlexTreeNode } from "@fluid-experimental/tree2";
import React from "react";

/**
 * React Hook to trigger invalidation of the current component if anything in the document changes.
 */
export function useTreeContext(document: TreeContext): void {
	// This proof-of-concept implementation allocates a state variable this is modified
	// when the tree changes to trigger re-render.
	const [, setInvalidations] = React.useState(0);

	// Register for tree deltas when the component mounts
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return document.on("afterChange", () => {
			setInvalidations((invalidations) => invalidations + 1);
		});
	}, [document]);
}

/**
 * React Hook to trigger invalidation of the current component if anything in the provided subtree changes.
 * This does NOT include if this subtree is moved into a different parent!
 */
export function useSubtree(tree: FlexTreeNode): void {
	// This proof-of-concept implementation allocates a state variable this is modified
	// when the tree changes to trigger re-render.
	const [, setInvalidations] = React.useState(0);

	// Register for tree deltas when the component mounts
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return tree.on("subtreeChanging", () => {
			setInvalidations((invalidations) => invalidations + 1);
		});
	}, [tree, setInvalidations]);
}

// TODO: schematize component which shows error (with proper invalidation), or passes tree to sub component.
