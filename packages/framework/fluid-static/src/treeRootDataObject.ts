/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BaseContainerRuntimeFactory,
	TreeDataObject,
} from "@fluidframework/aqueduct/internal";
import type { PureDataObjectFactory } from "@fluidframework/aqueduct/internal";
import type {
	IContainerRuntimeOptions,
	MinimumVersionForCollab,
} from "@fluidframework/container-runtime/internal";
import type {
	IContainerRuntime,
	IContainerRuntimeInternal,
} from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import type { NamedFluidDataStoreRegistryEntry } from "@fluidframework/runtime-definitions/internal";
import type { SharedObjectKind } from "@fluidframework/shared-object-base/internal";
import type { ITree } from "@fluidframework/tree/internal";
import { SharedTreeFactoryType } from "@fluidframework/tree/internal";

import { compatibilityModeRuntimeOptions } from "./compatibilityConfiguration.js";
import type {
	CompatibilityMode,
	ContainerSchema,
	IRootDataObject,
	IStaticEntryPoint,
	LoadableObjectKindRecord,
	LoadableObjectRecord,
} from "./types.js";
import { compatibilityModeToMinVersionForCollab, makeFluidObject } from "./utils.js";

interface IProvideTreeRootDataObject {
	readonly TreeRootDataObject: TreeRootDataObject;
}

/**
 * The entry-point/root collaborative object of the {@link IFluidContainer | Fluid Container}.
 * Abstracts the dynamic code required to build a Fluid Container into a static representation for end customers.
 */
export class TreeRootDataObject
	extends TreeDataObject<ITree>
	implements IRootDataObject, IProvideTreeRootDataObject
{
	readonly #initialObjects: LoadableObjectRecord = {};
	readonly #initialObjectsKey = "tree";

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
		Object.assign(this.#initialObjects, { [this.#initialObjectsKey]: this.treeView });
	}

	public get initialObjects(): LoadableObjectRecord {
		if (Object.keys(this.#initialObjects).length === 0) {
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
	readonly #treeRootDataObjectFactory: PureDataObjectFactory<TreeRootDataObject>;
	readonly #initialObjects: LoadableObjectKindRecord;

	public constructor(
		schema: ContainerSchema,
		compatibilityMode: CompatibilityMode,
		treeRootDataObjectFactory: PureDataObjectFactory<TreeRootDataObject>,
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
		this.#initialObjects = schema.initialObjects;
	}

	protected async containerInitializingFirstTime(runtime: IContainerRuntime): Promise<void> {
		// The first time we create the container we create the RootDataObject
		await this.#treeRootDataObjectFactory.createRootInstance(treeRootDataStoreId, runtime, {
			initialObjects: this.#initialObjects,
		});
	}
}

/**
 * Validates the container schema and extracts the factory for the tree-based data object.
 * Throws an error if the schema is invalid or does not contain a valid SharedTree.
 */
export function validateAndExtractTreeFactory(
	registryEntries: NamedFluidDataStoreRegistryEntry[],
	sharedObjects: IChannelFactory[],
): IChannelFactory<ITree> {
	if (registryEntries.length > 0) {
		throw new Error(
			"Container schema must not have any data store registry entries for tree-based data object.",
		);
	}
	if (sharedObjects.length !== 1) {
		throw new Error(
			"Container schema must have exactly one entry for tree-based data object.",
		);
	}
	const factory = sharedObjects[0];
	if (!factory || factory.type !== SharedTreeFactoryType) {
		throw new Error("Container schema must contain a shared tree for tree-based data object.");
	}
	return factory as IChannelFactory<ITree>;
}
