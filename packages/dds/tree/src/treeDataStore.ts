/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	ITree,
	TreeView,
	TreeViewConfiguration,
} from "./simple-tree/index.js";
import type { DataStoreKind } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKey, SharedObjectKind } from "@fluidframework/shared-object-base";
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

	readonly key?: SharedObjectKey<ITree>;
}

/**
 * Simple tree specific wrapper around {@link @fluidframework/shared-object-base#dataStoreKind}.
 * @remarks
 * Use {@link @fluidframework/shared-object-base#dataStoreKind} directly if more control is needed, even if still just using tree.
 *
 * This uses {@link instantiateTreeFirstTime} to create the tree, and optionally initialize it.
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
			return instantiateTreeFirstTime(
				rootCreator,
				creator,
				options.key ?? SharedTree,
				options,
			);
		},
		async view(tree): Promise<TreeView<TSchema>> {
			const view = tree.viewWith(options.config);
			return view;
		},
	});
	return result;
}

/**
 * Simple tree instantiation helper.
 * @remarks
 * This is used by {@link treeDataStoreKind}, but can also be used in custom DataStores with {@link @fluidframework/shared-object-base#dataStoreKind}.
 * @alpha
 */
export async function instantiateTreeFirstTime<TSchema extends ImplicitFieldSchema>(
	rootCreator: SharedObjectCreator,
	creator: SharedObjectCreator,
	treeKind: SharedObjectKey<ITree>,
	options: Pick<TreeDataStoreOptions<TSchema>, "config" | "initializer">,
): Promise<ITree> {
	const tree = await rootCreator.create(treeKind);
	initializeTreeFirstTime(tree, options, creator);
	return tree;
}

function initializeTreeFirstTime<TSchema extends ImplicitFieldSchema>(
	tree: ITree,
	options: Pick<TreeDataStoreOptions<TSchema>, "config" | "initializer">,
	creator: SharedObjectCreator,
): void {
	if (options.initializer !== undefined) {
		const view = tree.viewWith(options.config);
		view.initialize(options.initializer(creator));
		view.dispose();
	}
}
