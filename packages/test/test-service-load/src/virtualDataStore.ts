/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { SharedCounter, type ISharedCounter } from "@fluidframework/counter/internal";
import type {
	IContainerRuntimeBase,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";

const counterKey = "counter";
export class VirtualDataStore extends DataObject {
	public static DataStoreName = "StressTestDataStore";
	private _counter: ISharedCounter | undefined;
	public get counter(): ISharedCounter {
		assert(this._counter !== undefined, "counter must be defined");
		return this._counter;
	}

	public get loadingGroupId(): string {
		const groupId = this.context.loadingGroupId;
		assert(groupId !== undefined, "loadingGroupId must be provided");
		return groupId;
	}

	protected async initializingFirstTime(): Promise<void> {
		const sharedCounter = SharedCounter.create(this.runtime);
		this.root.set(counterKey, sharedCounter.handle);
	}

	protected async hasInitialized(): Promise<void> {
		const counterHandle = this.root.get(counterKey);
		this._counter = await counterHandle.get();
		// Might be cool to send telemetry here as this is when we've just loaded from the snapshot and haven't sent any ops.
	}
}

/**
 * A DataObjectFactory for creating virtualized data objects
 */
export class VirtualDataObjectFactory extends DataObjectFactory<VirtualDataStore> {
	constructor() {
		super("virtual-service-load", VirtualDataStore, [SharedCounter.getFactory()], {});
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
		_initialState?: any,
		loadingGroupId?: string,
	): Promise<VirtualDataStore> {
		assert(loadingGroupId !== undefined, "loadingGroupId must be provided");
		return super.createInstance(runtime, undefined, loadingGroupId);
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
