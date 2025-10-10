/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidLoadable, FluidObject } from "@fluidframework/core-interfaces";
import {
	type ISharedObjectRegistry,
	FluidDataStoreRuntime,
} from "@fluidframework/datastore/internal";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions/internal";
import type {
	Registry,
	DataStoreKind,
	IFluidDataStoreFactory,
	IFluidDataStoreContext,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type { ISharedObjectKind, SharedObjectKind } from "./sharedObject.js";
import type { ISharedObject } from "./types.js";

/**
 * A {@link @fluidframework/runtime-definitions#Registry} of shared object kinds that can be created or loaded within a data store.
 * @remarks
 * Supports lazy code loading in a limited way (a single lazy load per registry).
 * @privateRemarks
 * TODO: The framework provided SharedObjects should be exposed in a way indistinguishable from custom Sub-DataStores.
 * This can be done by unifying the DataStoreKind and SharedObjectKind types.
 * For now, this would mean having DataStoreKind extend SharedObjectKind, since we can allow a DataStore in all places SharedObjects are allowed,
 * but do not allow SharedObjects at the root.
 * Fixing this, and allowing shared objects at the root (maybe use a trivial wrapper DataStore) could simplifying things, allowing DataStores and Containers to share some types (like how they create detached contents, have registries, have a root etc).
 *
 * Part of this unification could be to relax the output from the factories / registries. Allowing the output to be an arbitrary type, which might be a promise, and might not be one could help.
 * Removal of the IFluidLoadable requirement, and allowing the returned type to expose handles to itself how ever it wants (or not at all) might be viable and simplify typing And allow for strongly typed handles at creation time at least).
 * Maybe when Registry(type) gives a promise, it could instead give a factory which outputs a promise wrapped type? The check that the provided creation key is valid for that factory can be deferred until the promise resolves.
 *
 * Idea: creation key can have an interface that subsets the factory / SharedObjectKind / DataStoreKind so they can be used, or some branded key (string, and/or object with stronger identity what knows the type string) can be used.
 * Have Key interface contain validation function to check that the factory used (or maybe the value produced from it) is valid for that key.
 * During load, get with validation that simply checks the factory's type string matches the key's type string.
 * When using SharedObjectKind or DataStoreKind, validation can check factory object identity against key.
 *
 * Goal: Mostly unify container, datastore and shared object abstractions.
 * Maybe unify a bit with service client since it also has a way to create detached things with an initialized root then attach them.
 * SharedObjects are just built in leaf DataStores.
 *
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
