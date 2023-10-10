/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TreeContext,
	TreeNode,
	FieldSchema,
	ISharedTreeView,
	InitializeAndSchematizeConfiguration,
	SchemaAware,
} from "@fluid-experimental/tree2";
import React from "react";

/**
 * Returns the root of the given ISharedTree instance.
 * The returned object tree may be mutated and passed as properties to sub-components.
 *
 * Be aware that object retained between render passes will mutate.
 * Use deep clone if saving a copy for comparison.
 *
 * Not currently compatible with 'React.memo'.
 *
 * @deprecated Prefer using the new TypedTree entry point and tree types, and the hooks for them, {@link useTreeContext} and {@link useSubtree}.
 */
export function useTree<TRoot extends FieldSchema>(
	tree: ISharedTreeView,
	config: InitializeAndSchematizeConfiguration<TRoot>,
): SchemaAware.TypedField<TRoot> {
	// TODO: reconsider where this belongs. Consider error handling from schema changes.
	const typedTree = React.useMemo<ISharedTreeView>(() => tree.schematize(config), [tree]);

	// This proof-of-concept implementation allocates a state variable this is modified
	// when the tree changes to trigger re-render.
	const [invalidations, setInvalidations] = React.useState(0);

	// Register for tree deltas when the component mounts
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return typedTree.events.on("afterBatch", () => {
			setInvalidations(invalidations + 1);
		});
	});

	return typedTree.context.root as unknown as SchemaAware.TypedField<TRoot>;
}

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
export function useSubtree(tree: TreeNode): void {
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

// TODO: schematize component which shows error (with proper invalidation), or passes tree to sub componet.
