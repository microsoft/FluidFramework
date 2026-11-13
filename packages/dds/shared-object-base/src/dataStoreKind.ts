/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	legacySharedObjectTypeAliases,
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
		/**
		 * Shared in-flight promise, including rejection, so concurrent lookups cannot load different kinds.
		 */
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
		let resolvedType = type;
		let load = map.get(type);
		if (load === undefined) {
			for (const candidate of legacySharedObjectTypeAliases(type)) {
				const aliasLoad = map.get(candidate);
				if (aliasLoad !== undefined) {
					const aliasKind = await aliasLoad();
					DataStoreKindImplementation.narrowGeneric(aliasKind);
					// Historical URL aliases apply only to DDS factories, not application-defined composite types.
					if (aliasKind.channelFactory !== undefined) {
						resolvedType = candidate;
						load = aliasLoad;
						break;
					}
				}
			}
		}
		if (load === undefined) {
			throw new UsageError(`Unknown data store type: ${type}`);
		}
		const kind = await load();
		if (kind.type !== resolvedType) {
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
	 * Neither the root nor the returned value needs to expose a handle or implement IFluidLoadable.
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
 * Loading an existing DDS-based data store preserves its DDS children and operation format.
 * The framework-version target does not check application readiness; applications must coordinate use of new capabilities.
 * Nested data stores share the garbage-collection lifetime of their container-level ancestor.
 * A reachable descendant retains its ancestors and their attached children.
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
			// Select by runtime capability, not the document's version target.
			// Native collections also preserve legacy DDS layouts and gate new capabilities separately.
			const native =
				(context as FluidDataStoreContextInternal).createChannelCollection !== undefined;
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

/**
 * Persisted child name used by defineDataStore in both native and legacy layouts.
 * The root is bound at creation; additional children attach when referenced.
 * Application-selected root names belong to the legacy factory bridge, not this convention.
 */
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
				// The key validates the kind's output type; the runtime entry point erases it.
				return (await store.entryPoint.get()) as TChild;
			},
		};
		let root: TRoot;
		if (existing) {
			const handle = await collection.getDataStoreEntryPoint(rootId);
			// Loading erases the root type; the application's registered root kind must still produce TRoot.
			root = (await handle.get()) as TRoot;
		} else {
			root = await initializeRoot(options, inner, async (key) => {
				const kind = await lookupKind(options.registry, key);
				const store = await collection.createDataStore(kind.IFluidDataStoreFactory, rootId);
				// Bind the channel identity, not its application value, which need not expose a handle.
				collection.bind(store.entryPoint);
				return (await store.entryPoint.get()) as TRoot;
			});
		}
		// The runtime treats the view as an opaque entry point; it need not implement FluidObject.
		return (await options.view(root, inner)) as FluidObject;
	});
}

async function initializeRoot<T, TRoot>(
	options: DataStoreOptions<TRoot, T>,
	context: DataStoreContext,
	create: (key: DataStoreKey<TRoot>) => Promise<TRoot>,
): Promise<TRoot> {
	let started = false;
	/**
	 * Records completion separately from the value, since a completed creation may expose undefined.
	 */
	let created: { value: TRoot } | undefined;
	const root = await options.instantiateFirstTime(
		{
			async createDataStore<TChild extends TRoot>(key: DataStoreKey<TChild>): Promise<TChild> {
				if (started) {
					throw new UsageError("Root already created");
				}
				// Reserve the root before awaiting factory loading to reject concurrent creation attempts.
				started = true;
				const value = await create(key);
				created = { value };
				return value as TChild;
			},
		},
		context,
	);
	// Roots can be primitives: Object.is accepts NaN while distinguishing positive and negative zero.
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
			// Resolve lazy kinds before entering the legacy runtime's synchronous factory lookup.
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
		// As in the native path, the registered root kind supplies the type erased by channel loading.
		const root = existing
			? ((await runtime.getChannel(rootId)) as TRoot)
			: await initializeRoot(options, inner, async (key) => create(key, rootId));
		// The runtime only needs the application view as an opaque entry point.
		return (await options.view(root, inner)) as FluidObject;
	});
}

/**
 * Context provided when creating or loading a data store.
 * Creates physically nested contents, not container-level peers selected through a hierarchical factory registry.
 * @sealed
 * @alpha
 */
export interface DataStoreContext extends DataStoreCreator {}
