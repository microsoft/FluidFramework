/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable, FluidObject } from "@fluidframework/core-interfaces";
import {
	type ISharedObjectRegistry,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type {
	Registry,
	DataStoreKind,
	IFluidDataStoreFactory,
	IFluidDataStoreContext,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions/internal";
import type {
	SharedObjectKind,
	ISharedObjectKind,
	ISharedObject,
} from "@fluidframework/shared-object-base/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";

// TODO: Non-tree specific content should be moved to another package.

/**
 * A {@link @fluidframework/runtime-definitions#Registry} of shared object kinds that can be created or loaded within a data store.
 * @remarks
 * Supports lazy code loading.
 * @input
 * @alpha
 */
export type SharedObjectRegistry = () => Promise<Registry<SharedObjectKind<IFluidLoadable>>>;

/**
 * Creates a {@link SharedObjectRegistry} from an iterable of {@link SharedObjectKind}s or async getters for them.
 * @alpha
 */
export function sharedObjectRegistryFromIterable(
	entries: Iterable<
		| SharedObjectKind<IFluidLoadable>
		| { type: string; kind: () => Promise<SharedObjectKind<IFluidLoadable>> }
	>,
): SharedObjectRegistry {
	return async () => {
		const map = new Map<string, SharedObjectKind<IFluidLoadable>>();
		for (const entry of entries) {
			if ("kind" in entry) {
				map.set(entry.type, await entry.kind());
			} else {
				map.set(
					(entry as unknown as ISharedObjectKind<IFluidLoadable>).getFactory().type,
					entry,
				);
			}
		}
		return (type: string) => {
			const entry = map.get(type);
			if (entry === undefined) {
				throw new UsageError(`Unknown shared object type: ${type}`);
			}
			return entry;
		};
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
	instantiateFirstTime(
		rootCreator: SharedObjectCreator<TRoot>,
		creator: SharedObjectCreator,
	): Promise<TRoot>;
	/**
	 * Construct a view of the datastore's root shared object.
	 *
	 * @param root - The root shared object of the datastore, created by `instantiateFirstTime` (though possibly created by another client and loaded by this one).
	 */
	view(root: TRoot): Promise<TOutput>;
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

async function convertRegistry(
	registry: SharedObjectRegistry,
): Promise<ISharedObjectRegistry> {
	const lookup = await registry();

	const converted: ISharedObjectRegistry = {
		get: (type: string) => {
			const entry = lookup(type);
			return (entry as unknown as ISharedObjectKind<IFluidLoadable>)?.getFactory();
		},
	};
	return converted;
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
			const creator: SharedObjectCreator = {
				async create<T2 extends IFluidLoadable>(kind: SharedObjectKind<T2>): Promise<T2> {
					// Create detached channel.
					const sharedObject = kind as unknown as ISharedObjectKind<T2>;
					return sharedObject.create(rt);
				},
			};

			let createdRoot: TRoot | undefined;

			const rootCreator: SharedObjectCreator<TRoot> = {
				async create<T2 extends TRoot>(kind: SharedObjectKind<T2>): Promise<T2> {
					// Create named channel under the root id.
					// Error if called twice.
					if (createdRoot !== undefined) {
						throw new UsageError("Root shared object already created");
					}
					const sharedObject = kind as unknown as ISharedObjectKind<T2>;
					const result = sharedObject.create(rt, rootSharedObjectId);

					const result2 = result as unknown as ISharedObject;
					result2.bindToContext();

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

			return (await options.view(root)) as unknown as FluidObject;
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
export interface SharedObjectCreator<TConstraint = IFluidLoadable> {
	/**
	 * Create an instance of `kind`, which must be registered in the registry of the surrounding data store.
	 */
	create<T extends TConstraint>(kind: SharedObjectKind<T>): Promise<T>;
}
