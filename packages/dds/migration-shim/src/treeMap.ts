/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	mapKernelFactory,
	SharedMap,
	type ISharedMap,
	type ISharedMapCore,
} from "@fluidframework/map/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import type {
	KernelArgs,
	SharedKernelFactory,
} from "@fluidframework/shared-object-base/internal";
import type { ITree } from "@fluidframework/tree";
import {
	SchemaFactory,
	Tree,
	TreeViewConfiguration,
	type JsonCompatible,
	type TreeView,
	// SharedTree,
} from "@fluidframework/tree/internal";

import {
	makeSharedObjectAdapter,
	unsupportedAdapter,
	type MigrationOptions,
	type MigrationSet,
} from "./shim.js";

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
 * TODO: this approach leads to extra escaping. Consider replacing it with a the JSON (+handles) domain.
 * Concise import and export APIs should handle data conversion into tree format in that case.
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

interface ErrorData {
	readonly mode: "error";
	readonly tree?: ITree;
	readonly message: string;
}

/**
 * TODO: use this.
 */
function dataFromTree(tree: ITree): TreeData | ErrorData {
	const view = tree.viewWith(config);
	// eslint-disable-next-line unicorn/prefer-ternary
	if (view.compatibility.isEquivalent) {
		return { tree, view, root: view.root, mode: "tree" };
	} else {
		return { mode: "error", message: "Incompatible tree", tree };
	}
}

const treeFactory: SharedKernelFactory<ITree> = {
	create: (args: KernelArgs) => {
		throw new Error("Not implemented");
	},
};

/**
 * Map which can be based on a SharedMap or a SharedTree.
 *
 * Once this has been accessed as a SharedTree, the SharedMap APIs are no longer accessible.
 *
 * TODO: factor into generic adapter class, use Proxy to graft interfaces from adapters onto this.
 */
class TreeMapAdapter implements ISharedMapCore {
	public data: TreeData;
	public constructor(public readonly tree: ITree) {
		const data = dataFromTree(tree);
		if (data.mode !== "tree") {
			throw new Error(data.message);
		}
		this.data = data;
	}

	public get<T = any>(key: string): T | undefined {
		return this.data.root.getRaw(key) as T | undefined;
	}
	public set<T = unknown>(key: string, value: T): this {
		this.data.root.setRaw(key, value as JsonCompatible<IFluidHandle>);
		return this;
	}

	public readonly [Symbol.toStringTag]: string = "TreeMap";

	public keys(): IterableIterator<string> {
		return this.data.root.keys();
	}

	public entries(): IterableIterator<[string, any]> {
		return [...this.data.root.keys()]
			.map((key): [string, any] => [key, this.get(key)])
			[Symbol.iterator]();
	}

	public values(): IterableIterator<any> {
		return [...this.data.root.keys()].map((key): any => this.get(key))[Symbol.iterator]();
	}

	public [Symbol.iterator](): IterableIterator<[string, any]> {
		return this.entries();
	}

	public get size(): number {
		return this.data.root.size;
	}

	public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
		// eslint-disable-next-line unicorn/no-array-for-each
		return [...this.entries()].forEach(([key, value]) => callbackFn(value, key, this));
	}

	public has(key: string): boolean {
		return this.data.root.has(key);
	}

	public delete(key: string): boolean {
		const had = this.has(key);
		this.data.root.set(key, undefined);
		return had;
	}

	public clear(): void {
		for (const key of this.keys()) {
			this.delete(key);
		}
	}
}

const mapToTreeOptions: MigrationOptions<ISharedMapCore, ITree, ISharedMapCore> = {
	migrationIdentifier: "defaultMapToTree",
	to: treeFactory,
	beforeAdapter(from: ISharedMapCore): ISharedMapCore {
		return from;
	},
	afterAdapter(from: ITree): ISharedMapCore {
		return new TreeMapAdapter(from);
	},
	migrate(from: SharedMap, to: ITree, adaptedTo: ISharedMapCore) {
		for (const [key, value] of from.entries()) {
			adaptedTo.set(key, value);
		}
	},
	defaultMigrated: false,
};

const mapToTree: MigrationSet<ISharedMap, ISharedMap, ITree> = {
	fromKernel: mapKernelFactory as SharedKernelFactory<ISharedMap>,
	fromSharedObject: SharedMap,
	selector(id: string) {
		return mapToTreeOptions as MigrationOptions<ISharedMapCore, ITree, ISharedMap>;
	},
};

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
export const MapToTree = makeSharedObjectAdapter<SharedMap, ISharedMap>(mapToTree);

const mapToTreeOptionsPhase2: MigrationOptions<ISharedMapCore, ITree, ITree> = {
	migrationIdentifier: "defaultMapToTree",
	to: treeFactory,
	beforeAdapter: unsupportedAdapter,
	afterAdapter(from: ITree): ITree {
		return from;
	},
	migrate(from: SharedMap, to: ITree, adaptedTo: ITree) {
		const view = to.viewWith(config);
		Tree.runTransaction(view, (tx) => {
			for (const [key, value] of from.entries()) {
				view.root.set(key, MapAdapterItem.encode(value as JsonCompatible<IFluidHandle>));
			}
		});
		view.dispose();
	},
	defaultMigrated: false,
};

const mapToTreePhase2: MigrationSet<ISharedMapCore, ITree, ITree> = {
	fromKernel: mapKernelFactory,
	fromSharedObject: SharedMap,
	selector(id: string) {
		return mapToTreeOptionsPhase2;
	},
};

/**
 * Entrypoint for {@link ITree} creation that supports legacy map data.
 * @remarks
 * This supports loading data in {@link SharedMap} and {@link MapToTree} formats.
 * Data converted from {@link SharedMap} uses the {@link MapAdapterRoot} schema.
 * @legacy
 * @public
 */
export const TreeFromMap = makeSharedObjectAdapter<ISharedMapCore, ITree>(mapToTreePhase2);
