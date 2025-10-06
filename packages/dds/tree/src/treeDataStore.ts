/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	ITree,
	TreeView,
	TreeViewConfiguration,
} from "./simple-tree/index.js";
import type { DataStoreKind } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import { SharedTree } from "./treeFactory.js";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import {
	type SharedObjectCreator,
	type SharedObjectRegistry,
	sharedObjectRegistryFromIterable,
	dataStoreKind,
	type DataStoreOptions,
} from "@fluidframework/shared-object-base/internal";

/**
 * Options for {@link treeDataStoreKind}.
 * @input
 * @alpha
 */
export interface TreeDataStoreOptions<TSchema extends ImplicitFieldSchema>
	extends Pick<DataStoreOptions<never, never>, "type"> {
	/**
	 * Configuration for the tree view to be used in this data store.
	 */
	readonly config: TreeViewConfiguration<TSchema>;

	/**
	 * If provided, used to initialize the tree content when creating a new instance of the data store.
	 */
	readonly initializer?: (
		creator: SharedObjectCreator,
	) => InsertableTreeFieldFromImplicitField<TSchema>;

	/**
	 * If provided, must include at least a SharedTree kind in the registry.
	 * @remarks
	 * {@link configuredSharedTree} can be used to customize the SharedTree kind used in the registry.
	 */
	readonly registry?: Iterable<SharedObjectKind<IFluidLoadable>> | SharedObjectRegistry;
}

/**
 * Simple tree specific wrapper around {@link @fluidframework/shared-object-base#dataStoreKind}.
 * @remarks
 * Use {@link @fluidframework/shared-object-base#dataStoreKind} directly if more control is needed, even if still just using tree.
 * @alpha
 */
export function treeDataStoreKind<const TSchema extends ImplicitFieldSchema>(
	options: TreeDataStoreOptions<TSchema>,
): DataStoreKind<TreeView<TSchema>> {
	const registry: SharedObjectRegistry =
		typeof options.registry === "function"
			? options.registry
			: sharedObjectRegistryFromIterable([...(options.registry ?? [SharedTree])]);

	const result = dataStoreKind<TreeView<TSchema>, ITree>({
		type: options.type,
		registry,
		async instantiateFirstTime(
			rootCreator: SharedObjectCreator,
			creator: SharedObjectCreator,
		): Promise<ITree> {
			const lookup = await registry();
			const treeKind = lookup(SharedTree.getFactory().type);
			const tree = await rootCreator.create(treeKind);
			// TODO: Should this pass for customized SharedTree kinds? Should there be a different check?
			assert(SharedTree.is(tree), "Created shared tree should be a SharedTree");
			if (options.initializer !== undefined) {
				const view = tree.viewWith(options.config);
				view.initialize(options.initializer(creator));
				view.dispose();
			}
			return tree;
		},
		async view(tree): Promise<TreeView<TSchema>> {
			const view = tree.viewWith(options.config);
			return view;
		},
	});
	return result;
}
