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
import {
	type Registry,
	type DataStoreKind,
	registryLookup,
} from "@fluidframework/driver-definitions/internal";
import type {
	IFluidDataStoreContext,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions/internal";
import { DataStoreKindImplementation } from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import type {
	ISharedObjectKind,
	SharedObjectKey,
	SharedObjectKindAlpha,
} from "./sharedObject.js";
import type { ISharedObject } from "./types.js";

/**
 * A {@link @fluidframework/driver-definitions#Registry} of shared object kinds that can be created or loaded within a data store.
 * @remarks
 * Supports lazy code loading in a limited way (a single lazy load per registry).
 * @privateRemarks
 * TODO: The framework provided SharedObjects should be exposed in a way indistinguishable from custom Sub-DataStores.
 * This can be done by unifying the DataStoreKind and SharedObjectKindAlpha types.
 * For now, this would mean having DataStoreKind extend SharedObjectKindAlpha, since we can allow a DataStore in all places SharedObjects are allowed,
 * but do not allow SharedObjects at the root.
 * Fixing this, and allowing shared objects at the root (maybe use a trivial wrapper DataStore) could simplify things, allowing DataStores and Containers to share some types (like how they create detached contents, have registries, have a root etc).
 *
 * Part of this unification could be to relax the output from the factories / registries. Allowing the output to be an arbitrary type, which might be a promise, and might not be one could help.
 * Removal of the IFluidLoadable requirement, and allowing the returned type to expose handles to itself however it wants (or not at all) might be viable and simplify typing and allow for strongly typed handles at creation time at least).
 * Maybe when Registry(type) gives a promise, it could instead give a factory which outputs a promise wrapped type? The check that the provided creation key is valid for that factory can be deferred until the promise resolves.
 *
 * Idea: creation key can have an interface that subsets the factory / SharedObjectKindAlpha / DataStoreKind so they can be used, or some branded key (string, and/or object with stronger identity what knows the type string) can be used.
 * Have Key interface contain validation function to check that the factory used (or maybe the value produced from it) is valid for that key.
 * During load, validation would simply check the factory's type string matches the key's type string.
 * When using SharedObjectKindAlpha or DataStoreKind, validation can check factory object identity against key.
 *
 * Goal: Mostly unify container, datastore and shared object abstractions.
 * Maybe unify a bit with service client since it also has a way to create detached things with an initialized root then attach them.
 * SharedObjects are just built in leaf DataStores.
 *
 * @input
 * @alpha
 */
export type SharedObjectRegistry = () => Promise<
	Registry<SharedObjectKindAlpha<IFluidLoadable>>
>;

/**
 * Creates a {@link SharedObjectRegistry} from an iterable of {@link SharedObjectKindAlpha}s or async getters for them.
 * @alpha
 */
export function sharedObjectRegistryFromIterable(
	entries: Iterable<
		| SharedObjectKindAlpha<IFluidLoadable>
		| { type: string; kind: () => Promise<SharedObjectKindAlpha<IFluidLoadable>> }
	>,
): SharedObjectRegistry {
	return async () => {
		const map = new Map<string, SharedObjectKindAlpha<IFluidLoadable>>();
		for (const entry of entries) {
			if ("kind" in entry) {
				map.set(entry.type, await entry.kind());
			} else {
				map.set(asSharedObjectKind(entry).getFactory().type, entry);
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
 * Options which define how to construct a particular {@link @fluidframework/driver-definitions#DataStoreKind}.
 * @remarks
 * Use {@link createDataStoreKind} to create a {@link @fluidframework/driver-definitions#DataStoreKind} from these options.
 * @input
 * @alpha
 */
export interface DataStoreOptions<in out TRoot extends IFluidLoadable, out TOutput> {
	/**
	 * The type identifier for the data object factory.
	 * @remarks
	 * Persisted identifier which specifies which {@link @fluidframework/driver-definitions#DataStoreKind} to use when loading it.
	 * @privateRemarks
	 * Equivalent to `DataObjectFactoryProps.type`.
	 */
	readonly type: string;

	/**
	 * The registry of shared object kinds (including other DataStores) that can be loaded or created within this DataStore.
	 *
	 * TODO: actually allow this to contain datastores.
	 */
	readonly registry: SharedObjectRegistry;

	/**
	 * Create the initial content of the datastore, and return the root shared object.
	 * @privateRemarks
	 * TODO:
	 * This requires the caller to produce a single root shared object (which is keyed by {@link rootSharedObjectId}).
	 * This should be fine for new code, but code migrated from legacy APIs might need more flexibility.
	 * Such use-cases could be accommodated providing a legacy alternative to `createDataStoreKind` where `instantiateFirstTime` and `view` directly expose access to named root shared objects.
	 * This should be easy to implement, but is currently not included.
	 */
	instantiateFirstTime(
		rootCreator: SharedObjectCreator<TRoot>,
		context: DataStoreContext,
	): Promise<TRoot>;

	/**
	 * Construct a view of the datastore's root shared object.
	 *
	 * @param root - The root shared object of the datastore, created by `instantiateFirstTime` (though possibly created by another client and loaded by this one).
	 * @param context - A {@link DataStoreContext} that can be used to create additional shared objects.
	 */
	view(root: TRoot, context: DataStoreContext): Promise<TOutput>;
}

/**
 * Creates a {@link @fluidframework/driver-definitions#DataStoreKind} from {@link DataStoreOptions}.
 * @alpha
 */
export function createDataStoreKind<T, TRoot extends IFluidLoadable>(
	options: DataStoreOptions<TRoot, T>,
): DataStoreKind<T> {
	return new DataStoreKindImplementation<T>({
		type: options.type,
		async instantiateDataStore(
			context: IFluidDataStoreContext,
			existing: boolean,
		): Promise<IFluidDataStoreChannel> {
			return createDataStore(context, existing, options);
		},
	});
}

/**
 * Casts a {@link SharedObjectKindAlpha} to its encapsulated {@link ISharedObjectKind} view.
 *
 * @remarks
 * {@link SharedObjectKindAlpha} is a sealed type,
 * so we can assume it implements {@link ISharedObjectKind} and down cast to it.
 */
function asSharedObjectKind<T extends IFluidLoadable>(
	kind: SharedObjectKindAlpha<T>,
): ISharedObjectKind<T> {
	const candidate = kind as unknown as Partial<ISharedObjectKind<T>>;
	// Sanity check to help catch misuse since SharedObjectKindAlpha is typed structurally and seems implementable.
	if (typeof candidate.getFactory !== "function" || typeof candidate.create !== "function") {
		throw new UsageError(
			"Invalid SharedObjectKindAlpha: this type is sealed and may not have custom implementations.",
		);
	}
	return candidate as ISharedObjectKind<T>;
}

function convertRegistry(
	lookup: Registry<SharedObjectKindAlpha<IFluidLoadable>>,
): ISharedObjectRegistry {
	return {
		get: (type: string) => {
			const entry = lookup(type);
			return asSharedObjectKind(entry).getFactory();
		},
	};
}

/**
 * DataStores keep their shared objects inside channels which get names.
 * This is the name of the channel which we conventionally use for the root shared object of a DataStore in most cases.
 * @remarks
 * There can be other named channels, or the root could use a different name, but we are trying to migrate away from such patterns.
 * Currently the DataStoreKind pattern used in this file follows and requires this convention,
 * but we may relax that in the future for interop with legacy data if necessary.
 */
const rootSharedObjectId = "root";

async function createDataStore<T, TRoot extends IFluidLoadable>(
	context: IFluidDataStoreContext,
	existing: boolean,
	options: DataStoreOptions<TRoot, T>,
): Promise<IFluidDataStoreChannel> {
	const sharedObjectRegistry = await options.registry();
	const runtime: FluidDataStoreRuntime = new FluidDataStoreRuntime(
		context,
		convertRegistry(sharedObjectRegistry),
		existing,
		async (runtimeInner: IFluidDataStoreRuntime) => {
			const innerContext: DataStoreContext = {
				async create<T2 extends IFluidLoadable>(key: SharedObjectKey<T2>): Promise<T2> {
					const kind = registryLookup(sharedObjectRegistry, key);
					// Create detached channel.
					return asSharedObjectKind(kind).create(runtimeInner);
				},
			};

			let createdRoot: TRoot | undefined;

			const rootCreator: SharedObjectCreator<TRoot> = {
				async create<T2 extends TRoot>(key: SharedObjectKey<T2>): Promise<T2> {
					// Create named channel under the root id.
					// Error if called twice.
					if (createdRoot !== undefined) {
						throw new UsageError("Root shared object already created");
					}
					const kind = registryLookup(sharedObjectRegistry, key);
					const result = asSharedObjectKind(kind).create(runtimeInner, rootSharedObjectId);

					// Every shared object is also an ISharedObject;
					const rootSharedObject = result as IFluidLoadable as ISharedObject;
					// bind the newly created root so it becomes part of this data store.
					rootSharedObject.bindToContext();

					createdRoot = result;
					return result;
				},
			};

			let root: TRoot | undefined;
			if (existing) {
				// getChannel returns the type-erased IChannel; the registered root kind guarantees it is a TRoot.
				root = (await runtimeInner.getChannel(rootSharedObjectId)) as IFluidLoadable as TRoot;
			} else {
				root = await options.instantiateFirstTime(rootCreator, innerContext);
				if (root !== createdRoot) {
					throw new UsageError(
						"instantiateFirstTime did not return root created with rootCreator",
					);
				}
			}

			// view returns the data store's output type; the runtime only needs it as an opaque FluidObject entry point.
			return (await options.view(root, innerContext)) as unknown as FluidObject;
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
	create<T extends TConstraint>(kind: SharedObjectKey<T>): Promise<T>;
}

/**
 * Contextual information about a DataStore which is provided when instantiating or loading it.
 * @privateRemarks
 * TODO: this can expose more contextual information about the data store as needed.
 * @sealed
 * @alpha
 */
export interface DataStoreContext extends SharedObjectCreator {}
