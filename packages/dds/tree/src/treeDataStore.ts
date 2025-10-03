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
import type {
	DataStoreKind,
	IFluidDataStoreChannel,
	IFluidDataStoreContext,
	IFluidDataStoreFactory,
	Registry,
} from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base";
import { SharedTree } from "./treeFactory.js";
import type { FluidObject, IFluidLoadable } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	type ISharedObjectRegistry,
} from "@fluidframework/datastore/internal";
import type {
	IChannelFactory,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

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
	const map = new Map<string, Promise<SharedObjectKind<IFluidLoadable>>>();
	for (const entry of entries) {
		if ("kind" in entry) {
			map.set(entry.type, entry.kind());
		} else {
			map.set(
				(entry as unknown as ISharedObjectKind<IFluidLoadable>).getFactory().type,
				Promise.resolve(entry),
			);
		}
	}
	return async (type: string) => {
		const entry = await map.get(type);
		if (entry === undefined) {
			throw new UsageError(`Unknown shared object type: ${type}`);
		}
		return entry;
	};
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
	instantiateFirstTime(rootCreator: Creator<TRoot>, creator: Creator): Promise<TRoot>;
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
	const f: IFluidDataStoreFactory = {
		type: options.type,

		async instantiateDataStore(
			context: IFluidDataStoreContext,
			existing: boolean,
		): Promise<IFluidDataStoreChannel> {
			return createDataStore(context, existing, options);
		},

		get IFluidDataStoreFactory(): IFluidDataStoreFactory {
			return f;
		},
	};

	return f as IFluidDataStoreFactory & DataStoreKind<T>;
}

// TODO: we should not require a list of knowing types to prefetch for registry conversion.
const knownTypes = [SharedTree.getFactory().type];

async function convertRegistry(
	registry: SharedObjectRegistry,
): Promise<ISharedObjectRegistry> {
	const entries = knownTypes.map(
		async (type) =>
			[
				type,
				((await registry(type)) as unknown as ISharedObjectKind<IFluidLoadable>).getFactory(),
			] as const,
	);
	const resolved = await Promise.allSettled(entries);

	const registryMap = new Map<string, IChannelFactory>();
	for (const result of resolved) {
		if (result.status === "fulfilled") {
			registryMap.set(result.value[0], result.value[1]);
		} else {
			// TODO: Handle the error case? Rethrow on get from output registry?
		}
	}
	return registryMap;
}

const rootSharedObjectId = "root";

async function createDataStore<T, TRoot extends IFluidLoadable>(
	context: IFluidDataStoreContext,
	existing: boolean,
	options: DataStoreOptions<TRoot, T>,
): Promise<IFluidDataStoreChannel> {
	const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
		context,
		await convertRegistry(options.registry),
		existing,
		async (rt: IFluidDataStoreRuntime) => {
			const creator: Creator = {
				async create<T2 extends IFluidLoadable>(kind: SharedObjectKind<T2>): Promise<T2> {
					// Create detached channel.
					const sharedObject = kind as unknown as ISharedObjectKind<T2>;
					return sharedObject.create(rt);
				},
			};

			let createdRoot: TRoot | undefined;

			const rootCreator: Creator<TRoot> = {
				async create<T2 extends TRoot>(kind: SharedObjectKind<T2>): Promise<T2> {
					// Create named channel under the root id.
					// Error if called twice.
					if (createdRoot !== undefined) {
						throw new UsageError("Root shared object already created");
					}
					const sharedObject = kind as unknown as ISharedObjectKind<T2>;
					const result = sharedObject.create(rt);
					createdRoot = result;
					return result;
				},
			};

			let root: TRoot | undefined;
			if (existing) {
				root = (await rt.getChannel(rootSharedObjectId)) as unknown as TRoot;
			} else {
				root = await options.instantiateFirstTime(rootCreator, creator);
				if (root !== createdRoot) {
					throw new UsageError(
						"instantiateFirstTime did not return root created with rootCreator",
					);
				}
			}

			return options.view(root) as unknown as FluidObject;
		},
	);

	return runtime;
}

/**
 * Creates instances of SharedObjectKinds.
 * @privateRemarks
 * See IFluidContainer.create.
 * @sealed
 * @alpha
 */
export interface Creator<TConstraint = IFluidLoadable> {
	create<T extends TConstraint>(kind: SharedObjectKind<T>): Promise<T>;
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
	readonly initializer?: (creator: Creator) => InsertableTreeFieldFromImplicitField<TSchema>;

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
		async instantiateFirstTime(rootCreator: Creator, creator: Creator): Promise<ITree> {
			const treeKind = await registry(SharedTree.getFactory().type);
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
		view(tree): TreeView<TSchema> {
			const view = tree.viewWith(options.config);
			return view;
		},
	});
	return result;
}
