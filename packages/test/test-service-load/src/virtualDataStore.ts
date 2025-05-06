/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { SharedCounter } from "@fluidframework/counter/internal";
import type {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";

export class VirtualDataStore extends DataObject {
	public get loadingGroupId(): string | undefined {
		return this.context.loadingGroupId;
	}
}

/**
 * A DataObjectFactory for creating virtualized data objects
 */
export class VirtualDataObjectFactory extends DataObjectFactory<VirtualDataStore> {
	constructor() {
		super({
			type: "virtual-service-load",
			ctor: VirtualDataStore,
			sharedObjects: [SharedCounter.getFactory()],
		});
	}

	/**
	 *
	 * @param runtime - the container runtime
	 * @param _initialState - any state
	 * @param loadingGroupId - the loading group id used to create a basic data object
	 * @returns a new instance of the data object
	 */
	public async createInstance(
		runtime: IContainerRuntimeBase,
		initialState: any,
		loadingGroupId: string,
	): Promise<VirtualDataStore> {
		return super.createInstance(runtime, initialState, loadingGroupId);
	}

	public async createChildInstance(
		_parentContext: IFluidDataStoreContext,
		_initialState?: any,
		_loadingGroupId?: string | undefined,
	): Promise<VirtualDataStore> {
		assert(false, "Not implemented");
	}

	public async createPeerInstance(
		_peerContext: IFluidDataStoreContext,
		_initialState?: any,
		_loadingGroupId?: string | undefined,
	): Promise<VirtualDataStore> {
		assert(false, "Not implemented");
	}

	public async createRootInstance(
		_rootDataStoreId: string,
		_runtime,
		_initialState?: any,
	): Promise<VirtualDataStore> {
		assert(false, "Not implemented");
	}
}

export const VirtualDataStoreFactory = new VirtualDataObjectFactory();
