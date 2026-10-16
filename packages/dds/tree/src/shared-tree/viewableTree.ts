/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ImplicitFieldSchema,
	SimpleTreeSchema,
	TreeView,
	TreeViewAlpha,
	TreeViewConfiguration,
	ViewableTreeAlpha,
	VerboseTree,
} from "../simple-tree/index.js";

import type { TreeCheckout } from "./treeCheckout.js";

/**
 * Creates the common viewable-tree API backed by a checkout.
 */
export function createViewableTreeAlpha(
	checkout: TreeCheckout,
	exportSimpleSchema: () => SimpleTreeSchema,
): ViewableTreeAlpha {
	return {
		viewWith<TRoot extends ImplicitFieldSchema>(
			config: TreeViewConfiguration<TRoot>,
		): TreeView<TRoot> {
			const view: TreeViewAlpha<TRoot> = checkout.viewWith(config);
			return view as TreeView<TRoot>;
		},
		exportVerbose(): VerboseTree | undefined {
			return checkout.exportVerbose();
		},
		exportSimpleSchema,
	};
}
