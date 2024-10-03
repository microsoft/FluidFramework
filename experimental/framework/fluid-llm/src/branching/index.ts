/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeView, ImplicitFieldSchema } from "@fluidframework/tree";
import {
	getViewForForkedBranch,
	type SchematizingSimpleTreeView,
	type ITreeCheckoutFork,
} from "@fluidframework/tree/internal";

const viewToCheckoutMap = new Map<TreeView<ImplicitFieldSchema>, ITreeCheckoutFork>();

/**
 * Creates a branch from the given tree view.
 * @param treeView - The tree view to branch from
 *
 * @remarks Right now it only supports
 *
 * @public
 */
export function branch<T extends ImplicitFieldSchema>(treeView: TreeView<T>): TreeView<T> {
	const { forkView, forkCheckout } = getViewForForkedBranch(
		treeView as SchematizingSimpleTreeView<T>,
	);

	// NOTE: this currently has the limitation that a given tree view can only have one fork at a time.
	// How would we allow users to discard a fork they don't want anymore but still tell us, so we can clean up here?
	if (viewToCheckoutMap.has(forkView)) {
		throw new Error(
			"A fork already exists for this tree view. Merge it before creating a new one.",
		);
	}
	viewToCheckoutMap.set(forkView, forkCheckout);
	return forkView;
}

/**
 * Merges the changes from a forked tree view into the original tree view that the fork came from.
 * @param forkedTreeView - The tree view with the changes to be merged.
 * This must be the same view that was returned by {@link branch}.
 * @param originalTreeView - The tree view to merge into.
 * This must be the same view that was passed to {@link branch} to create the fork.
 *
 * @public
 */
export function merge<T extends ImplicitFieldSchema>(
	forkedTreeView: TreeView<T>,
	originalTreeView: TreeView<T>,
): void {
	const forkCheckout = viewToCheckoutMap.get(forkedTreeView);
	if (forkCheckout === undefined) {
		throw new Error("The forked tree view was not passed to the branch() function first.");
	}
	(originalTreeView as unknown as SchematizingSimpleTreeView<T>).checkout.merge(forkCheckout);
	// TODO: should we delete the map entry here? Probably yes?
	viewToCheckoutMap.delete(forkedTreeView);
}
