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
	type TreeView,
	// SharedTree,
} from "@fluidframework/tree/internal";

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
export class MapAdapterRoot extends schemaFactory.map("Root", [
	schemaFactory.handle,
	schemaFactory.string,
]) {}

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

function setTreeValue<T = unknown>(value: T, key: string, root: MapAdapterRoot): void {
	const treeValue = isFluidHandle(value) ? value : JSON.stringify(value);
	root.set(key, treeValue);
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
	): { kernel: SharedKernel; view: T };
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
					setTreeValue(value, key, converted);
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
				const value = this.data.root.get(key);
				if (isFluidHandle(value)) {
					// Thats not safe, but thats how ISharedMap works.
					return value as T;
				}
				if (value === undefined) {
					return undefined;
				}
				return JSON.parse(value) as T;
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
				setTreeValue<T>(value, key, this.data.root);
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
