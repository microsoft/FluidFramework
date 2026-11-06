/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	type ISharedObjectRegistryInternal,
} from "@fluidframework/datastore/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import {
	type DataStoreCreator,
	type DataStoreKey,
	type DataStoreKind,
	type DataStoreRegistry,
	lookupInRegistry,
} from "@fluidframework/driver-definitions/internal";
import type {
	FluidDataStoreContextInternal,
	IFluidDataStoreContext,
	IFluidDataStoreChannel,
} from "@fluidframework/runtime-definitions/internal";
import {
	convertRegistry,
	DataStoreKindImplementation,
	getConfigForMinVersionForCollab,
} from "@fluidframework/runtime-utils/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type { ISharedObject } from "./types.js";

/**
 * Creates a registry from kinds or lazy getters for kinds.
 * @param entries - Kinds, or type identifiers and their lazy loaders.
 * @returns A registry that loads each lazy entry at most once.
 * @alpha
 */
export function dataStoreRegistryFromIterable(
	entries: Iterable<DataStoreKind | { type: string; kind: () => Promise<DataStoreKind> }>,
): DataStoreRegistry {
	const map = new Map<string, () => Promise<DataStoreKind>>();
	for (const entry of entries) {
		if (map.has(entry.type)) {
			throw new UsageError(`Duplicate data store type: ${entry.type}`);
		}
		let loaded: Promise<DataStoreKind> | undefined;
		map.set(
			entry.type,
			async () =>
				(loaded ??=
					"kind" in entry
						? Promise.resolve().then(async () => entry.kind())
						: Promise.resolve(entry)),
		);
	}
	return async (type) => {
		const load = map.get(type);
		if (load === undefined) {
			throw new UsageError(`Unknown data store type: ${type}`);
		}
		const kind = await load();
		if (kind.type !== type) {
			throw new UsageError(`Mismatched data store type. Expected: ${type}, got: ${kind.type}`);
		}
		return kind;
	};
}

/**
 * Defines a data store's initialization and application-facing view.
 * @typeParam TRoot - The value exposed by the root kind.
 * @typeParam TOutput - The value exposed by this data store.
 * @input
 * @alpha
 */
export interface DataStoreOptions<in out TRoot, out TOutput> {
	/**
	 * Persisted identifier for this kind.
	 */
	readonly type: string;

	/**
	 * The kinds that can be created or loaded within this data store.
	 */
	readonly registry: DataStoreRegistry;

	/**
	 * Creates and initializes the root using `rootCreator`.
	 * @param rootCreator - Creates exactly one root.
	 * @param context - Creates additional contents.
	 * @returns The value created by `rootCreator`.
	 */
	instantiateFirstTime(
		rootCreator: DataStoreCreator<TRoot>,
		context: DataStoreContext,
	): Promise<TRoot>;

	/**
	 * Constructs the application-facing value from the root.
	 * @param root - The created or loaded root value.
	 * @param context - Creates additional contents.
	 * @returns The application-facing value.
	 */
	view(root: TRoot, context: DataStoreContext): Promise<TOutput>;
}

/**
 * Defines a data store whose root and additional contents can be leaf or composite kinds.
 * @remarks
 * Nested data stores require an oldest supported client version of at least 3.12.0.
 * Older targets support shared-object children using the existing DDS representation.
 * Loading an existing DDS-based data store preserves that representation.
 * Use the legacy factory bridge for application-defined legacy layouts.
 * @param options - Initialization, registry, and view definition.
 * @returns The data store kind.
 * @alpha
 */
export function defineDataStore<T, TRoot>(
	options: DataStoreOptions<TRoot, T>,
): DataStoreKind<T> {
	return new DataStoreKindImplementation<T>({
		type: options.type,
		IFluidDataStoreRegistry: convertRegistry(options.registry),
		async instantiateDataStore(context, existing) {
			const native = existing
				? context.baseSnapshot?.blobs[".aliases"] !== undefined
				: getConfigForMinVersionForCollab(context.oldestSupportedClient, {
						"2.0.0": false,
						"3.12.0": true,
					});
			return native
				? createNativeDataStore(context, existing, options)
				: createLegacyLayoutDataStore(context, existing, options);
		},
	});
}

async function lookupKind<T>(
	registry: DataStoreRegistry,
	key: DataStoreKey<T>,
): Promise<DataStoreKindImplementation<T>> {
	const kind = await lookupInRegistry(registry, key);
	DataStoreKindImplementation.narrowGeneric(kind);
	return kind;
}

const rootId = "root";

async function createNativeDataStore<T, TRoot>(
	context: IFluidDataStoreContext,
	existing: boolean,
	options: DataStoreOptions<TRoot, T>,
): Promise<IFluidDataStoreChannel> {
	const native = context as FluidDataStoreContextInternal;
	if (native.createChannelCollection === undefined) {
		throw new UsageError("This runtime does not support native channel collections");
	}
	return native.createChannelCollection(async (collection) => {
		const inner: DataStoreContext = {
			async createDataStore<TChild>(key: DataStoreKey<TChild>): Promise<TChild> {
				const kind = await lookupKind(options.registry, key);
				const store = await collection.createDataStore(kind.IFluidDataStoreFactory);
				return (await store.entryPoint.get()) as TChild;
			},
		};
		let root: TRoot;
		if (existing) {
			const handle = await collection.getDataStoreEntryPoint(rootId);
			root = (await handle.get()) as TRoot;
		} else {
			root = await initializeRoot(options, inner, async (key) => {
				const kind = await lookupKind(options.registry, key);
				const store = await collection.createDataStore(kind.IFluidDataStoreFactory, rootId);
				collection.bind(store.entryPoint);
				return (await store.entryPoint.get()) as TRoot;
			});
		}
		return (await options.view(root, inner)) as FluidObject;
	});
}

async function initializeRoot<T, TRoot>(
	options: DataStoreOptions<TRoot, T>,
	context: DataStoreContext,
	create: (key: DataStoreKey<TRoot>) => Promise<TRoot>,
): Promise<TRoot> {
	let started = false;
	let created: { value: TRoot } | undefined;
	const root = await options.instantiateFirstTime(
		{
			async createDataStore<TChild extends TRoot>(key: DataStoreKey<TChild>): Promise<TChild> {
				if (started) {
					throw new UsageError("Root already created");
				}
				started = true;
				const value = await create(key);
				created = { value };
				return value as TChild;
			},
		},
		context,
	);
	if (created === undefined || !Object.is(root, created.value)) {
		throw new UsageError(
			"instantiateFirstTime did not return the root created with rootCreator",
		);
	}
	return root;
}

async function createLegacyLayoutDataStore<T, TRoot>(
	context: IFluidDataStoreContext,
	existing: boolean,
	options: DataStoreOptions<TRoot, T>,
): Promise<IFluidDataStoreChannel> {
	const factories = new Map<string, IChannelFactory>();
	function registerFactory(kind: DataStoreKindImplementation<unknown>): IChannelFactory {
		const factory = kind.channelFactory;
		if (factory === undefined) {
			throw new UsageError(
				"Nested data stores require a native collection and oldestSupportedClient >= 3.12.0",
			);
		}
		factories.set(kind.type, factory);
		return factory;
	}
	async function loadFactory(type: string): Promise<IChannelFactory> {
		const cached = factories.get(type);
		if (cached !== undefined) {
			return cached;
		}
		const kind = await options.registry(type);
		DataStoreKindImplementation.narrowGeneric(kind);
		return registerFactory(kind);
	}
	const registry: ISharedObjectRegistryInternal = {
		get: (type) => factories.get(type),
		getAsync: loadFactory,
	};
	return new FluidDataStoreRuntime(context, registry, existing, async (runtime) => {
		async function create<TChild>(key: DataStoreKey<TChild>, id?: string): Promise<TChild> {
			const kind = await lookupKind(options.registry, key);
			registerFactory(kind);
			const channel = runtime.createChannel(id, kind.type);
			// Named roots must be bound through the shared object so its own state stays in sync.
			if (id !== undefined) {
				const rootChannel = channel as ISharedObject;
				if (typeof rootChannel.bindToContext !== "function") {
					throw new UsageError("The root shared object does not support binding");
				}
				rootChannel.bindToContext();
			}
			return channel as TChild;
		}
		const inner: DataStoreContext = { createDataStore: create };
		const root = existing
			? ((await runtime.getChannel(rootId)) as TRoot)
			: await initializeRoot(options, inner, async (key) => create(key, rootId));
		return (await options.view(root, inner)) as FluidObject;
	});
}

/**
 * Context provided when creating or loading a data store.
 * @sealed
 * @alpha
 */
export interface DataStoreContext extends DataStoreCreator {}
