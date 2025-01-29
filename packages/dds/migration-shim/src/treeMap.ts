/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { unreachableCase } from "@fluidframework/core-utils/internal";
import type {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions/internal";
import {
	SharedMap,
	MapKernel,
	type ISharedMap,
	type ISharedMapEvents,
} from "@fluidframework/map/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import {
	createSharedObjectKind,
	SharedObjectFromKernel,
	type IFluidSerializer,
	type SharedKernel,
} from "@fluidframework/shared-object-base/internal";
import type { ImplicitFieldSchema, ITree } from "@fluidframework/tree";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type JsonCompatible,
	type TreeView,
	// SharedTree,
} from "@fluidframework/tree/internal";
import type { MigrationOptions, MigrationSet } from "./shim.js";

/**
 * TODO:
 * Factor out SharedKernel subset of Tree and Map (adjust MapKernel).
 *
 * Implement adapter like TreeMap that takes two SharedKernel factories and and adapter functions for each kernel type, then uses a proxy
 * to forward the calls to the correct adapter.
 *
 * Write a generic a SharedObject subclass which a kernel, and provide an way to have ops to migrate to a different kernel.
 * Implement desired APIs on this SHaredObject by wrapping with proxy that uses adapters.
 *
 */

/**
 *
 */
const schemaFactory = new SchemaFactory("com.fluidframework/adapters/map");

/**
 *
 */
export class Handles extends schemaFactory.map("Handles", schemaFactory.handle) {}

function tryGetHandleKey(value: unknown): undefined | string {
	if (typeof value === "object" && value !== null && "handle" in value) {
		const key = value.handle;
		if (typeof key === "string") {
			return key;
		}
	}
	return undefined;
}

/**
 *
 */
export class MapAdapterItem extends schemaFactory.object("Item", {
	json: schemaFactory.string,
	handles: Handles,
}) {
	public static encode(value: JsonCompatible<IFluidHandle>): MapAdapterItem {
		const handles = new Handles();
		const handleKeys = new Set<string>();

		// Find existing objects with a "handle" property that is a string, and add those strings to handleKeys to avoid collisions when including fluid handles.
		{
			const queue = [value];
			while (queue.length > 0) {
				const item = queue.pop();

				if (typeof item === "object" && item !== null) {
					if (Array.isArray(item)) {
						queue.push(...item);
					}
					if (isFluidHandle(item)) {
						// Skip
					} else {
						const existingKey = tryGetHandleKey(item);
						if (existingKey !== undefined) {
							handleKeys.add(existingKey);
						}
						queue.push(...(Object.values(item) as JsonCompatible<IFluidHandle>[]));
					}
				}
			}
		}

		let nextKey = 0;
		const json = JSON.stringify(
			value,
			(propertyKey, propertyValue: JsonCompatible<IFluidHandle>) => {
				if (isFluidHandle(propertyValue)) {
					let handleKey: string;
					// Generate a unique string thats not in handleKeys
					// eslint-disable-next-line no-constant-condition
					while (true) {
						handleKey = nextKey.toString(36);
						nextKey++;
						if (!handleKeys.has(handleKey)) {
							// No need to add to handleKey set here since keys generated from nextKey will not repeat.
							break;
						}
					}
					handles.set(handleKey, propertyValue);
					return { handle: handleKey };
				}
				return value;
			},
		);

		return new MapAdapterItem({ json, handles });
	}

	public static decode(value: MapAdapterItem): JsonCompatible<IFluidHandle> {
		const result = JSON.parse(
			value.json,
			(propertyKey, propertyValue: JsonCompatible<IFluidHandle>) => {
				const existingKey = tryGetHandleKey(propertyValue);
				if (existingKey !== undefined) {
					const handle = value.handles.get(existingKey);
					if (handle !== undefined) {
						return handle;
					}
				}
				return propertyValue;
			},
		) as JsonCompatible<IFluidHandle>;
		return result;
	}
}

/**
 *
 */
export class MapAdapterRoot extends schemaFactory.map("Root", [MapAdapterItem]) {
	public setRaw(key: string, value: JsonCompatible<IFluidHandle>): void {
		this.set(key, MapAdapterItem.encode(value));
	}
	public getRaw(key: string): JsonCompatible<IFluidHandle> | undefined {
		const item = this.get(key);
		if (item === undefined) {
			return undefined;
		}
		return MapAdapterItem.decode(item);
	}
}

const config = new TreeViewConfiguration({ schema: MapAdapterRoot, preventAmbiguity: true });

interface TreeData {
	readonly mode: "tree";
	// TODO: possible implement this with something that doesn't use an actual SharedObject instance? Determine if thats an issue.
	readonly tree: ITree;
	readonly view: TreeView<typeof MapAdapterRoot>;
	readonly root: MapAdapterRoot;
}

interface MapData {
	readonly mode: "map";
	// TODO: factor summary save and load out of SharedMap class, then use MapKernel here.
	readonly map: MapKernel;
}

interface ErrorData {
	readonly mode: "error";
	readonly tree?: ITree;
	readonly message: string;
}

/**
 * TODO: use this.
 */
export function dataFromTree(tree: ITree): TreeData | ErrorData {
	const view = tree.viewWith(config);
	// eslint-disable-next-line unicorn/prefer-ternary
	if (view.compatibility.isEquivalent) {
		return { tree, view, root: view.root, mode: "tree" };
	} else {
		return { mode: "error", message: "Incompatible tree", tree };
	}
}

interface IntoTree {
	intoTree(): void;
}

/**
 * TODO: provide a way to select preferred format.
 */
export enum Compatability {
	SupportSharedMap,
	PreferTree,
}

interface FactoryOut<T> {
	readonly kernel: SharedKernel;
	readonly view: T;
}

/**
 * TODO: use this. Maybe move loadCore here.
 */
export interface SharedKernelFactory<T> {
	create(
		serializer: IFluidSerializer,
		handle: IFluidHandle,
		submitMessage: (op: unknown, localOpMetadata: unknown) => void,
		isAttached: () => boolean,
		eventEmitter: TypedEventEmitter<ISharedMapEvents>,
	): FactoryOut<T>;
}

/**
 * Map which can be based on a SharedMap or a SharedTree.
 *
 * Once this has been accessed as a SharedTree, the SharedMap APIs are no longer accessible.
 *
 * TODO: factor into generic adapter class, use Proxy to graft interfaces from adapters onto this.
 */
class TreeMap
	extends SharedObjectFromKernel<ISharedMapEvents>
	implements ISharedMap, ITree, IntoTree
{
	// TODO: consider lazy init here so correct kernel constructed in loadCore when loading from existing data.
	private data: TreeData | MapData | ErrorData;

	/**
	 * @param id - String identifier.
	 * @param runtime - Data store runtime.
	 * @param attributes - The attributes for the map.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
	) {
		super(id, runtime, attributes, "fluid_treeMap_");
		this.data = {
			map: new MapKernel(
				this.serializer,
				this.handle,
				(op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
				() => this.isAttached(),
				this,
			),
			mode: "map",
		};

		// if (SharedTree.is(inner)) {
		// 	dataFromTree(inner);
		// } else {
		// }
	}

	public viewWith<TRoot extends ImplicitFieldSchema>(
		viewConfig: TreeViewConfiguration<TRoot>,
	): TreeView<TRoot> {
		this.intoTree();
		switch (this.data.mode) {
			case "tree": {
				this.data.view.dispose();
				const view = this.data.tree.viewWith(viewConfig);
				this.data = {
					mode: "error",
					message: "Used as tree: map APIs not available",
					tree: this.data.tree,
				};
				return view;
			}
			case "map": {
				throw new Error("Should have been converted.");
			}
			case "error": {
				if (this.data.tree === undefined) {
					throw new Error(this.data.message);
				}
				return this.data.tree?.viewWith(viewConfig);
			}
			default: {
				unreachableCase(this.data);
			}
		}
	}

	/**
	 * Convert the underling data structure into a tree.
	 * @remarks
	 * This does not prevent the map APIs from being available:
	 * until `viewWith` is called, the map APIs are still available and will be implemented on-top of the tree structure.
	 */
	public intoTree(): void {
		switch (this.data.mode) {
			case "tree": {
				break;
			}
			case "map": {
				const converted = new MapAdapterRoot();
				for (const [key, value] of this.data.map.entries()) {
					converted.setRaw(key, value as JsonCompatible<IFluidHandle>);
				}
				// TODO:
				// if read+write: send conversion op
				// if readonly: convert locally then use resubmit op to rebase conversion over remote edits?

				// Conversion op must be an op that crashes old map code since it has no protocol versioning and skips ops it doesn't understand.
				// An op of a new type would simply be ignored by old code leading to the client de-syncing and possible summarizing old data.

				// TODO: convert existing event registrations to trigger from tree.

				throw new Error("Method not implemented.");
			}
			case "error": {
				if (this.data.tree === undefined) {
					throw new Error(this.data.message);
				}
				break;
			}
			default: {
				unreachableCase(this.data);
			}
		}
	}

	// #region ISharedMap
	public get<T = any>(key: string): T | undefined {
		switch (this.data.mode) {
			case "tree": {
				return this.data.root.getRaw(key) as T | undefined;
			}
			case "map": {
				return this.data.map.get(key);
			}
			default: {
				throw new Error(this.data.message);
			}
		}
	}
	public set<T = unknown>(key: string, value: T): this {
		switch (this.data.mode) {
			case "tree": {
				this.data.root.setRaw(key, value as JsonCompatible<IFluidHandle>);
				break;
			}
			case "map": {
				this.data.map.set(key, value);
				break;
			}
			default: {
				throw new Error(this.data.message);
			}
		}
		return this;
	}

	/**
	 * String representation for the class.
	 */
	public readonly [Symbol.toStringTag]: string = "TreeMap";

	private get readonlyMap(): ReadonlyMap<string, unknown> {
		switch (this.data.mode) {
			case "tree": {
				return this.data.root;
			}
			case "map": {
				return this.data.map;
			}
			default: {
				throw new Error(this.data.message);
			}
		}
	}

	/**
	 * Get an iterator over the keys in this map.
	 * @returns The iterator
	 */
	public keys(): IterableIterator<string> {
		return this.readonlyMap.keys();
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	public entries(): IterableIterator<[string, any]> {
		switch (this.data.mode) {
			case "tree": {
				return [...this.data.root.keys()]
					.map((key): [string, any] => [key, this.get(key)])
					[Symbol.iterator]();
			}
			case "map": {
				return this.data.map.entries();
			}
			default: {
				throw new Error(this.data.message);
			}
		}
	}

	/**
	 * Get an iterator over the values in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	public values(): IterableIterator<any> {
		switch (this.data.mode) {
			case "tree": {
				return [...this.data.root.keys()].map((key): any => this.get(key))[Symbol.iterator]();
			}
			case "map": {
				return this.data.map.values();
			}
			default: {
				throw new Error(this.data.message);
			}
		}
	}

	/**
	 * Get an iterator over the entries in this map.
	 * @returns The iterator
	 */
	// TODO: Use `unknown` instead (breaking change).
	public [Symbol.iterator](): IterableIterator<[string, any]> {
		return this.entries();
	}

	/**
	 * The number of key/value pairs stored in the map.
	 */
	public get size(): number {
		return this.readonlyMap.size;
	}

	/**
	 * Executes the given callback on each entry in the map.
	 * @param callbackFn - Callback function
	 */
	// TODO: Use `unknown` instead (breaking change).
	public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
		switch (this.data.mode) {
			case "tree": {
				// eslint-disable-next-line unicorn/no-array-for-each
				return [...this.entries()].forEach(([key, value]) => callbackFn(value, key, this));
			}
			case "map": {
				// eslint-disable-next-line unicorn/no-array-for-each, unicorn/no-array-callback-reference
				return this.data.map.forEach(callbackFn);
			}
			default: {
				throw new Error(this.data.message);
			}
		}
	}

	/**
	 * Check if a key exists in the map.
	 * @param key - The key to check
	 * @returns True if the key exists, false otherwise
	 */
	public has(key: string): boolean {
		return this.readonlyMap.has(key);
	}

	/**
	 * Delete a key from the map.
	 * @param key - Key to delete
	 * @returns True if the key existed and was deleted, false if it did not exist
	 */
	public delete(key: string): boolean {
		switch (this.data.mode) {
			case "tree": {
				const had = this.has(key);
				this.data.root.set(key, undefined);
				return had;
			}
			case "map": {
				return this.data.map.delete(key);
			}
			default: {
				throw new Error(this.data.message);
			}
		}
	}

	/**
	 * Clear all data from the map.
	 */
	public clear(): void {
		switch (this.data.mode) {
			case "tree": {
				for (const key of this.keys()) {
					this.delete(key);
				}
				break;
			}
			case "map": {
				return this.data.map.clear();
			}
			default: {
				throw new Error(this.data.message);
			}
		}
	}

	// #endregion

	protected override get kernel(): SharedKernel {
		switch (this.data.mode) {
			case "tree": {
				return this.data.tree as unknown as SharedKernel; // TODO: safety
			}
			case "map": {
				return this.data.map as unknown as SharedKernel; // TODO: safety
			}
			default: {
				if (this.data.tree) {
					return this.data.tree as unknown as SharedKernel; // TODO: safety/correctness
				}
				throw new Error(this.data.message);
			}
		}
	}
}

/**
 *
 */
class TreeMapFactory implements IChannelFactory<TreeMap> {
	public static readonly Type = SharedMap.getFactory().type;

	// TODO: is this good? Maybe it should do something here which will prevent non adapter factories from opening it later?
	public static readonly Attributes: IChannelAttributes = SharedMap.getFactory().attributes;

	public get type(): string {
		return TreeMapFactory.Type;
	}

	public get attributes(): IChannelAttributes {
		return TreeMapFactory.Attributes;
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.load}
	 */
	public async load<Id extends string>(
		runtime: IFluidDataStoreRuntime,
		id: Id,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<TreeMap & IChannel> {
		throw new Error("Method not implemented.");
	}

	/**
	 * {@inheritDoc @fluidframework/datastore-definitions#IChannelFactory.create}
	 */
	public create<Id extends string>(
		runtime: IFluidDataStoreRuntime,
		id: Id,
	): TreeMap & IChannel {
		throw new Error("Method not implemented.");
	}
}

/**
 * Entrypoint for {@link ISharedMap} creation, supporting migration to {@link ITree}.
 * @remarks
 * This supports loading data in {@link SharedMap} and {@link MapToTree} formats.
 * Data converted from {@link SharedMap} uses the {@link MapAdapterRoot} schema.
 *
 * Until {@link IntoTree.intoTree} is called (or a client uses {@link TreeFromMap}),
 * can collaborate with clients using {@link ISharedMap}.
 *
 * Migration process from Map to Tree is as follows:
 * 1. Replace use of {@link SharedMap} with `MapToTree`.
 * 2. Wait for active sessions to update to the new code.
 * 3. Optionally call {@link IntoTree.intoTree} to convert the data to a tree:
 * this can be used to test that the conversion works before commit to the migration,
 * or to perform the conversion at a controlled time.
 * 4. Replace `MapToTree` with {@link TreeFromMap} to gain access to {@link ITree} APIs.
 * 5. Optionally create new data using {@link SharedTree} directly to avoid using the adapter.
 *
 * Using {@link TreeFromMap} will result in errors in clients still using {@link SharedMap}.
 *
 * @legacy
 * @alpha
 */
export const MapToTree = createSharedObjectKind<ISharedMap & IntoTree>(TreeMapFactory);

/**
 * Entrypoint for {@link ITree} creation that supports legacy map data.
 * @remarks
 * This supports loading data in {@link SharedMap} and {@link MapToTree} formats.
 * Data converted from {@link SharedMap} uses the {@link MapAdapterRoot} schema.
 * @legacy
 * @public
 */
export const TreeFromMap = createSharedObjectKind<ITree>(TreeMapFactory);

interface ShimData<TOut> extends FactoryOut<unknown> {
	readonly adapter: TOut;
	migrated?: MigrationOptions;
}

/**
 * Map which can be based on a SharedMap or a SharedTree.
 *
 * Once this has been accessed as a SharedTree, the SharedMap APIs are no longer accessible.
 *
 * TODO: events
 */
class MigrationShim<TFrom, TOut> extends SharedObjectFromKernel<ISharedMapEvents> {
	/**
	 * If a migration is in progress (locally migrated, but migration not sequenced),
	 * this will hold the data in the format before migration.
	 *
	 * TODO: use this.
	 */
	#preMigrationData: ShimData<TOut> | undefined;

	// Lazy init here so correct kernel constructed in loadCore when loading from existing data.
	#data: ShimData<TOut> | undefined;

	private readonly kernelArgs: Parameters<SharedKernelFactory<TFrom>["create"]>;

	/**
	 * @param id - String identifier.
	 * @param runtime - Data store runtime.
	 * @param attributes - The attributes for the map.
	 */
	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		private readonly migrationSet: MigrationSet<TFrom>,
	) {
		super(id, runtime, attributes, "fluid_treeMap_");
		this.kernelArgs = [
			this.serializer,
			this.handle,
			(op, localOpMetadata) => this.submitLocalMessage(op, localOpMetadata),
			() => this.isAttached(),
			this,
		];

		// Proxy which grafts the adapter's APIs onto this object.
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				const adapter = target.data.adapter;
				if (Reflect.has(adapter as object, prop)) {
					return Reflect.get(adapter as object, prop, adapter) as unknown;
				}
				return Reflect.get(target, prop, target);
			},
		});
	}

	/**
	 * Convert the underling data structure into a tree.
	 * @remarks
	 * This does not prevent the map APIs from being available:
	 * until `viewWith` is called, the map APIs are still available and will be implemented on-top of the tree structure.
	 */
	public upgrade(): void {
		// TODO: upgrade op, upgrade rebasing etc.

		const data = this.data;
		if (data.migrated !== undefined) {
			return;
		}
		const options: MigrationOptions<TFrom, unknown, TOut> = this.migrationSet.selector(
			this.id,
		) as MigrationOptions<TFrom, unknown, TOut>;
		const { kernel, view } = options.to.create(...this.kernelArgs);

		options.migrate(data.view as TFrom, view);
		const adapter = options.afterAdapter(view);
		this.#data = {
			view,
			kernel: this.wrapKernel(kernel),
			adapter,
			migrated: options,
		};
	}

	private get data(): FactoryOut<unknown> & {
		readonly adapter: TOut;
		migrated?: MigrationOptions;
	} {
		if (this.#data === undefined) {
			// initialize to default format
			const options: MigrationOptions<TFrom, unknown, TOut> = this.migrationSet.selector(
				this.id,
			) as MigrationOptions<TFrom, unknown, TOut>;
			if (options.defaultMigrated) {
				// Create post migration
				const { kernel, view } = options.to.create(...this.kernelArgs);
				const adapter = options.afterAdapter(view);
				this.#data = {
					view,
					kernel: this.wrapKernel(kernel),
					adapter,
					migrated: options,
				};
			} else {
				// Create pre migration
				const { kernel, view } = this.migrationSet.from.create(...this.kernelArgs);
				const adapter = options.beforeAdapter(view);
				this.#data = {
					view,
					kernel: this.wrapKernel(kernel),
					adapter,
					migrated: options,
				};
			}
		}
		return this.#data;
	}

	private wrapKernel(kernel: SharedKernel): SharedKernel {
		return {
			...kernel,
			// TODO: intercept ops to handle migration cases.
		};
	}

	protected override get kernel(): SharedKernel {
		return this.data.kernel;
	}
}
