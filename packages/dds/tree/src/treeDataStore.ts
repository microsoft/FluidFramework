/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, fail } from "@fluidframework/core-utils/internal";
import type {
	ImplicitFieldSchema,
	InsertableTreeFieldFromImplicitField,
	ITree,
	TreeView,
	TreeViewConfiguration,
} from "./simple-tree/index.js";
import type { DataStoreKind, Registry } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import { SharedTree } from "./treeFactory.js";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";

// TODO: Non-tree specific content should be moved elsewhere.

/**
 * A {@link @fluidframework/runtime-definitions#Registry} of shared object kinds that can be created or loaded within a data store.
 * @remarks
 * Supports lazy code loading.
 * @input
 * @alpha
 */
export type SharedObjectRegistry = Registry<Promise<SharedObjectKind<IFluidLoadable>>>;

export function sharedObjectRegistryFromIterable(
	entries: Iterable<
		| SharedObjectKind<IFluidLoadable>
		| { type: string; kind: () => Promise<SharedObjectKind<IFluidLoadable>> }
	>,
): SharedObjectRegistry {
	throw new Error("Not implemented: registry");
}

/**
 * @input
 * @alpha
 */
export interface DataStoreOptions<in out TRoot extends IFluidLoadable, out TOutput> {
	/**
	 * The type identifier for the data object factory.
	 * @remarks
	 * Persisted identifier which specifies which {@link @fluidframework/runtime-definitions#DataStoreKind} to use when loading it.
	 * @privateRemarks
	 * Equivalent to `DataObjectFactoryProps.type`.
	 */
	readonly type: string;

	/**
	 * The registry of shared object kinds (including other DataStores) that can be loaded or created within this DataStore.
	 */
	readonly registry: SharedObjectRegistry;
	/**
	 * Create the initial content of the datastore, and return the root shared object.
	 */
	instantiateFirstTime(creator: Creator): Promise<TRoot>;
	/**
	 * Construct a view of the datastore's root shared object.
	 *
	 * @param root - The root shared object of the datastore, created by `instantiateFirstTime` (though possibly created by another client and loaded by this one).
	 */
	view(root: TRoot): TOutput;
}

/**
 * Creates a {@link @fluidframework/runtime-definitions#DataStoreFactory} from {@link DataStoreOptions}.
 * @remarks
 * Performs validation some validation of the input before bundling it up in a partially type erased form.
 * @alpha
 */
export function dataStoreKind<T, TRoot extends IFluidLoadable>(
	options: DataStoreOptions<TRoot, T>,
): DataStoreKind<T> {
	return fail("Not implemented: dataStoreKind");
}

/**
 * Creates instances of SharedObjectKinds.
 * @privateRemarks
 * See IFluidContainer.create.
 * @sealed
 * @alpha
 */
export interface Creator {
	create<T extends IFluidLoadable>(kind: SharedObjectKind<T>): Promise<T>;
}

/**
 * @input
 * @alpha
 */
export interface TreeDataStoreOptions<TSchema extends ImplicitFieldSchema> {
	/**
	 * {@inheritDoc DataStoreOptions."type"}
	 */
	readonly type: string;

	readonly config: TreeViewConfiguration<TSchema>;

	/**
	 * If provided, used to initialize the tree content when creating a new instance of the data store.
	 */
	readonly initializer?: () => InsertableTreeFieldFromImplicitField<TSchema>;

	/**
	 * If provided, must include at least a SharedTree kind in the registry.
	 * @remarks
	 * {@link configuredSharedTree} can be used to customize the SharedTree kind used in the registry.
	 */
	readonly registry?: Iterable<SharedObjectKind<IFluidLoadable>> | SharedObjectRegistry;
}

/**
 * Simple tree specific wrapper around {@link dataStoreKind}.
 * @remarks
 * Use {@link dataStoreKind} directly if more control is needed, even if still just using tree.
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
		async instantiateFirstTime(creator: Creator): Promise<ITree> {
			const treeKind = await registry(SharedTree.getFactory().type);
			const tree = await creator.create(treeKind);
			// TODO: Should this pass for customized SharedTree kinds? Should there be a different check?
			assert(SharedTree.is(tree), "Created shared tree should be a SharedTree");
			if (options.initializer !== undefined) {
				const view = tree.viewWith(options.config);
				view.initialize(options.initializer());
				view.dispose();
			}
			return tree;
		},
		view(tree): TreeView<TSchema> {
			const view = tree.viewWith(options.config);
			return view;
		},
	});
	return result;
}
