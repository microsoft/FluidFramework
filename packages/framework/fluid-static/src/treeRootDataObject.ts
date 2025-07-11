/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BaseContainerRuntimeFactory,
	TreeDataObject,
	TreeDataObjectFactory,
} from "@fluidframework/aqueduct/internal";
import type { IDataObjectProps } from "@fluidframework/aqueduct/internal";
import type {
	IContainerRuntimeOptions,
	MinimumVersionForCollab,
} from "@fluidframework/container-runtime/internal";
import type {
	IContainerRuntime,
	IContainerRuntimeInternal,
} from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, fail } from "@fluidframework/core-utils/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { IFluidDataStoreRegistry } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base/internal";
import type { ITree } from "@fluidframework/tree/internal";
import { SharedTreeFactoryType } from "@fluidframework/tree/internal";

import { compatibilityModeRuntimeOptions } from "./compatibilityConfiguration.js";
import type {
	CompatibilityMode,
	ContainerSchema,
	IRootDataObject,
	IStaticEntryPoint,
	LoadableObjectKind,
	LoadableObjectRecord,
} from "./types.js";
import {
	compatibilityModeToMinVersionForCollab,
	isSharedObjectKind,
	makeFluidObject,
} from "./utils.js";

interface IProvideTreeRootDataObject {
	readonly TreeRootDataObject: TreeRootDataObject;
}

interface TreeRootDataObjectExtraProps {
	readonly treeKey: string;
}

/**
 * The entry-point/root collaborative object of the {@link IFluidContainer | Fluid Container}.
 * Abstracts the dynamic code required to build a Fluid Container into a static representation for end customers.
 */
export class TreeRootDataObject
	extends TreeDataObject<ITree>
	implements IRootDataObject, IProvideTreeRootDataObject
{
	readonly #treeKey: string;
	#initialObjects: LoadableObjectRecord | undefined;

	public constructor(props: IDataObjectProps & TreeRootDataObjectExtraProps) {
		super({
			...props,
		});
		this.#treeKey = props.treeKey ?? fail("Tree key must be provided in initProps");
	}

	public get TreeRootDataObject(): TreeRootDataObject {
		return this;
	}

	protected generateView(tree: ITree): ITree {
		// Return the tree directly as the view
		// This provides direct access to the tree for the consumer
		return tree;
	}

	protected async initializingFirstTime(): Promise<void> {
		// No-op, because the tree is initialized in the TreeDataObject base class.
		return;
	}

	protected async hasInitialized(): Promise<void> {
		this.#initialObjects = { [this.#treeKey]: this.treeView };
	}

	public get initialObjects(): LoadableObjectRecord {
		if (this.#initialObjects === undefined || Object.keys(this.#initialObjects).length === 0) {
			throw new Error("Initial Objects were not correctly initialized");
		}
		return this.#initialObjects;
	}

	public async create<T>(objectClass: SharedObjectKind<T>): Promise<T> {
		// TODO: Implement dynamic object creation
		throw new Error("Method not implemented.");
	}

	public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
		return this.runtime.uploadBlob(blob);
	}
}

const treeRootDataStoreId = "treeRootDOId";

/**
 * Type of the {@link TreeRootDataObject}.
 * Used in the PureDataObjectFactory to create the root data object.
 */
export const treeRootDataObjectType = "treeRootDO";

async function provideEntryPoint(
	containerRuntime: IContainerRuntime,
): Promise<IStaticEntryPoint> {
	const entryPoint = await containerRuntime.getAliasedDataStoreEntryPoint(treeRootDataStoreId);
	if (entryPoint === undefined) {
		throw new Error(`default dataStore [${treeRootDataStoreId}] must exist`);
	}
	const treeRootDataObject = ((await entryPoint.get()) as FluidObject<TreeRootDataObject>)
		.TreeRootDataObject;
	assert(treeRootDataObject !== undefined, "entryPoint must be of type TreeRootDataObject");
	return makeFluidObject<IStaticEntryPoint>(
		{
			rootDataObject: treeRootDataObject,
			extensionStore: containerRuntime as IContainerRuntimeInternal,
		},
		"IStaticEntryPoint",
	);
}

/**
 * Factory for Container Runtime instances that provide a {@link IStaticEntryPoint}
 * (containing single {@link IRootDataObject}) as their entry point.
 */
export class TreeDOProviderContainerRuntimeFactory extends BaseContainerRuntimeFactory {
	// TODO: use for runtime factory.
	readonly #treeRootDataObjectFactory: TreeDataObjectFactory<TreeRootDataObject, ITree>;

	public constructor(
		compatibilityMode: CompatibilityMode,
		treeRootDataObjectFactory: TreeDataObjectFactory<TreeRootDataObject, ITree>,
		overrides?: Partial<{
			runtimeOptions: Partial<IContainerRuntimeOptions>;
			minVersionForCollab: MinimumVersionForCollab;
		}>,
	) {
		super({
			registryEntries: [treeRootDataObjectFactory.registryEntry],
			runtimeOptions: {
				...compatibilityModeRuntimeOptions[compatibilityMode],
				...overrides?.runtimeOptions,
			},
			provideEntryPoint,
			minVersionForCollab:
				overrides?.minVersionForCollab ??
				compatibilityModeToMinVersionForCollab[compatibilityMode],
		});
		this.#treeRootDataObjectFactory = treeRootDataObjectFactory;
	}

	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		// The first time we create the container we create the RootDataObject
		await this.#treeRootDataObjectFactory.createRootInstance(treeRootDataStoreId, runtime);
	}
}

/**
 * Factory that creates instances of a tree-based root data object.
 */
export class TreeRootDataObjectFactory extends TreeDataObjectFactory<
	TreeRootDataObject,
	ITree
> {
	public constructor(
		treeKey: string,
		sharedObjects: readonly IChannelFactory[] = [],
		private readonly dataStoreRegistry: IFluidDataStoreRegistry,
	) {
		type Ctor = new (props: IDataObjectProps) => TreeRootDataObject;
		const ctor: Ctor = function (_props) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			return new TreeRootDataObject({
				..._props,
				treeKey,
				// Add any additional injected properties here
			});
		} as unknown as Ctor;

		// Note: we're passing `undefined` registry entries to the base class so it won't create a registry itself,
		// and instead we override the necessary methods in this class to use the registry received in the constructor.
		super({
			type: treeRootDataObjectType,
			ctor,
			sharedObjects,
		});
	}

	public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry {
		return this.dataStoreRegistry;
	}
}

/**
 * Validates the container schema and extracts the factory for the tree-based data object.
 * Throws an error if the schema is invalid or does not contain a valid SharedTree.
 */
export function validateAndExtractTreeKey(schema: ContainerSchema): string {
	const schemaKeys = Object.keys(schema.initialObjects);
	if (schemaKeys.length !== 1 || !schemaKeys[0]) {
		throw new Error(
			"Container schema must have exactly one initial object for tree-based data object.",
		);
	}
	const singleSchemaKind = Object.values(
		schema.initialObjects,
	)[0] as unknown as LoadableObjectKind;
	if (
		!singleSchemaKind ||
		!isSharedObjectKind(singleSchemaKind) ||
		singleSchemaKind.getFactory().type !== SharedTreeFactoryType
	) {
		throw new Error(
			"Container schema must have a single initial object of type SharedTree for tree-based data object.",
		);
	}
	return schemaKeys[0];
}
