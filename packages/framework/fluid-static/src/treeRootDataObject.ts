/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseContainerRuntimeFactory, PureDataObjectFactory, TreeDataObject } from "@fluidframework/aqueduct/internal";
import type { IContainerRuntime, IContainerRuntimeInternal } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject, FluidObjectKeys, IFluidHandle, IFluidLoadable } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import type { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions/internal";
import type { ISharedObjectKind, SharedObjectKind } from "@fluidframework/shared-object-base/internal";
import type { ITree } from "@fluidframework/tree/internal";

import type { CompatibilityMode, ContainerSchema, IRootDataObject, IStaticEntryPoint, LoadableObjectRecord } from "./types.js";

/**
 * The entry-point/root collaborative object of the {@link IFluidContainer | Fluid Container}.
 * Abstracts the dynamic code required to build a Fluid Container into a static representation for end customers.
 */
export class TreeRootDataObject extends TreeDataObject<ITree> implements IRootDataObject {

	protected generateView(tree: ITree): ITree {
		// Return the tree directly as the view
		// This provides direct access to the tree for the consumer
		return tree;
	}

	protected async initializingFirstTime(): Promise<void> {
		// TODO: Implement initialization logic for first time creation
		throw new Error("Method not implemented.");
	}

	protected async hasInitialized(): Promise<void> {
		// TODO: Implement post-initialization logic
		throw new Error("Method not implemented.");
	}

	public get initialObjects(): LoadableObjectRecord {
		// Return an empty object as there are no initial collaborative objects
		// TODO: Add initial collaborative objects when needed
		return {};
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

function makeFluidObject<T extends object, K extends FluidObjectKeys<T> = FluidObjectKeys<T>>(
	object: Omit<T, K>,
	providerKey: K,
): T {
	return Object.defineProperty(object, providerKey, { value: object }) as T;
}

async function provideEntryPoint(
	containerRuntime: IContainerRuntime,
): Promise<IStaticEntryPoint> {
	const entryPoint = await containerRuntime.getAliasedDataStoreEntryPoint(treeRootDataStoreId);
	if (entryPoint === undefined) {
		throw new Error(`default dataStore [${treeRootDataStoreId}] must exist`);
	}
	const treeRootDataObject = ((await entryPoint.get()) as FluidObject<TreeRootDataObject>)
		.TreeRootDataObject;
	assert(treeRootDataObject !== undefined, 0xb9f /* entryPoint must be of type RootDataObject */);
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
	readonly #treeRootDataObjectFactory: PureDataObjectFactory<TreeRootDataObject>;

	public constructor(
		schema: ContainerSchema,
		compatibilityMode: CompatibilityMode,
		treeKind: ISharedObjectKind<IFluidLoadable>,
		registryEntries: NamedFluidDataStoreRegistryEntries
	) {
		super({
			registryEntries,
			provideEntryPoint
		});
		this.#treeRootDataObjectFactory = new PureDataObjectFactory<TreeRootDataObject>(
			`TreeRootDataObject`,
			TreeRootDataObject,
			[treeKind.getFactory()],
			{},
		);
	}

}
