/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
	mapKernelFactory,
	SharedMap,
	type ISharedMap,
	type ISharedMapCore,
} from "@fluidframework/map/internal";
import type {
	ISharedObjectKind,
	SharedKernelFactory,
	SharedObjectKind,
} from "@fluidframework/shared-object-base/internal";
import type { ITree } from "@fluidframework/tree";
import {
	FluidSerializableAsTree,
	SchemaFactory,
	TreeAlpha,
	treeKernelFactory,
	TreeViewConfiguration,
	typeboxValidator,
	type ConciseTree,
	type TreeView,
	// SharedTree,
} from "@fluidframework/tree/internal";

import {
	makeSharedObjectAdapter,
	unsupportedAdapter,
	type IMigrationShim,
	type MigrationOptions,
	type MigrationSet,
} from "./shim.js";

/**
 *
 */
const schemaFactory = new SchemaFactory("com.fluidframework/adapters/map");

/**
 * @alpha
 * @system
 * @sealed
 */
export const MapAdapterRoot_base = schemaFactory.map("Root", FluidSerializableAsTree.Tree);

/**
 * @alpha
 */
export class MapAdapterRoot extends MapAdapterRoot_base {
	public setRaw(key: string, value: ConciseTree | undefined): void {
		this.set(
			key,
			TreeAlpha.importConcise(SchemaFactory.optional(FluidSerializableAsTree.Tree), value),
		);
	}
	public getRaw(key: string): ConciseTree | undefined {
		const item = this.get(key);
		if (item === undefined) {
			return undefined;
		}
		return TreeAlpha.exportConcise(item);
	}
}

// TODO: enable preventAmbiguity: true : needs less strict ambiguity check option, or way to avoid map vs array ambiguity (opt map out of iterable/array?)
const config = new TreeViewConfiguration({ schema: MapAdapterRoot });

interface TreeData {
	readonly mode: "tree";
	// TODO: possible implement this with something that doesn't use an actual SharedObject instance? Determine if thats an issue.
	readonly tree: ITree;
	readonly view: TreeView<typeof MapAdapterRoot>;
}

interface ErrorData {
	readonly mode: "error";
	readonly tree?: ITree;
	readonly message: string;
}

function dataFromTree(tree: ITree): TreeData | ErrorData {
	const view = tree.viewWith(config);
	if (view.compatibility.canInitialize) {
		view.initialize(new MapAdapterRoot());
	}
	// eslint-disable-next-line unicorn/prefer-ternary
	if (view.compatibility.isEquivalent) {
		return { tree, view, mode: "tree" };
	} else {
		return { mode: "error", message: "Incompatible tree", tree };
	}
}

const treeFactory: SharedKernelFactory<ITree> = treeKernelFactory({
	jsonValidator: typeboxValidator,
});

/**
 * ISharedMapCore wrapping a SharedTree.
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

	private get root(): MapAdapterRoot {
		return this.data.view.root;
	}

	public get<T = any>(key: string): T | undefined {
		return this.root.getRaw(key) as T | undefined;
	}
	public set<T = unknown>(key: string, value: T): this {
		this.root.setRaw(key, value as ConciseTree);
		return this;
	}

	public readonly [Symbol.toStringTag]: string = "TreeMap";

	public keys(): IterableIterator<string> {
		return this.root.keys();
	}

	public entries(): IterableIterator<[string, any]> {
		return [...this.root.keys()]
			.map((key): [string, any] => [key, this.get(key)])
			[Symbol.iterator]();
	}

	public values(): IterableIterator<any> {
		return [...this.root.keys()].map((key): any => this.get(key))[Symbol.iterator]();
	}

	public [Symbol.iterator](): IterableIterator<[string, any]> {
		return this.entries();
	}

	public get size(): number {
		return this.root.size;
	}

	public forEach(callbackFn: (value: any, key: string, map: Map<string, any>) => void): void {
		// eslint-disable-next-line unicorn/no-array-for-each
		return [...this.entries()].forEach(([key, value]) => callbackFn(value, key, this));
	}

	public has(key: string): boolean {
		return this.root.has(key);
	}

	public delete(key: string): boolean {
		const had = this.has(key);
		this.root.set(key, undefined);
		return had;
	}

	public clear(): void {
		// The merge semantics of this likely differ from the original SharedMap, since concurrent clear and set will end up overwriting the set,
		// regardless of sequence order.

		// Looping over all the keys here and deleting them is also an option.
		// That would produce merge semantics where concurrent addition of a new key would survive a concurrent clear (regardless of sequence order),
		// but setting of other keys would depend on sequence order.

		// As neither of these exactly match the original SharedMap, the simpler, more consistent and more performant option was picked.
		// TODO: document this in the API and determine if it is a problem.

		this.data.view.root = new MapAdapterRoot();
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
		(adaptedTo as TreeMapAdapter).data.view.root = convert(from);
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
 * {@link @fluidframework/map#SharedMap} that can be converted internally to a {@link @fluidframework/tree#SharedTree}.
 * @remarks
 * Once all active clients are using this, switch to {@link TreeFromMap} if access to the data using tree APIs is desired.
 *
 * Note: This will get promoted to alpha+legacy (not public) once stable.
 * @alpha
 */
export const MapToTree = makeSharedObjectAdapter<SharedMap, ISharedMap>(mapToTree);

function convert(from: ISharedMapCore): MapAdapterRoot {
	const root = new MapAdapterRoot();
	for (const [key, value] of from.entries()) {
		root.setRaw(key, value as ConciseTree);
	}
	return root;
}

const mapToTreeOptionsPhase2: MigrationOptions<ISharedMapCore, ITree, ITree> = {
	migrationIdentifier: "defaultMapToTree",
	to: treeFactory,
	beforeAdapter: unsupportedAdapter,
	afterAdapter(from: ITree): ITree {
		return from;
	},
	migrate(from: SharedMap, to: ITree, adaptedTo: ITree) {
		const view = to.viewWith(config);
		const root = convert(from);
		view.initialize(root);
		view.dispose();
	},
	defaultMigrated: true,
};

const mapToTreePhase2: MigrationSet<ISharedMapCore, ITree, ITree> = {
	fromKernel: mapKernelFactory,
	fromSharedObject: SharedMap,
	selector(id: string) {
		return mapToTreeOptionsPhase2;
	},
};

/**
 * Entrypoint for {@link @fluidframework/tree#ITree} creation that supports legacy map data.
 * @remarks
 * This supports loading data in {@link @fluidframework/map#SharedMap} and {@link MapToTree} formats.
 * Data converted from {@link @fluidframework/map#SharedMap} uses the {@link MapAdapterRoot} schema.
 *
 * Note: This can get split into two APIs:
 *
 * 1. With ISharedKind which will get promoted to alpha+legacy (not public) once stable.
 * 2. Without ISharedKind which will get promoted to beta then public once stable.
 * @alpha
 */
export const TreeFromMap = makeSharedObjectAdapter<ISharedMapCore, ITree>(mapToTreePhase2);

function mapToTreePhase2Partial(
	filter: (id: string) => boolean,
): MigrationSet<ISharedMapCore, ITree | ISharedMapCore, ITree | ISharedMapCore> {
	return {
		...mapToTreePhase2,
		selector(id: string) {
			return filter(id)
				? mapToTreeOptionsPhase2
				: (mapToTreeOptions as MigrationOptions<ISharedMapCore, ITree, ISharedMap>);
		},
	};
}

/**
 * Entrypoint for {@link @fluidframework/tree#ITree} creation that supports legacy map data.
 * @remarks
 * This supports loading data in {@link @fluidframework/map#SharedMap} and {@link MapToTree} formats.
 * Data converted from {@link @fluidframework/map#SharedMap} uses the {@link MapAdapterRoot} schema.
 * TODO: strip off ISharedObjectKind for alpha version.
 *
 * Note: This will get promoted to alpha+legacy (not public) once stable.
 * @alpha
 */
export function treeFromMapPartial(
	filter: (id: string) => boolean,
): ISharedObjectKind<(ITree | ISharedMapCore) & IMigrationShim> &
	SharedObjectKind<(ITree | ISharedMapCore) & IMigrationShim> {
	return makeSharedObjectAdapter<ISharedMapCore, ITree | ISharedMapCore>(
		mapToTreePhase2Partial(filter),
	);
}
