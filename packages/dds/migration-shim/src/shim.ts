/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type IFluidHandle, type IFluidLoadable } from "@fluidframework/core-interfaces";
import {
	type IChannelAttributes,
	type IChannel,
	type IChannelServices,
	type IFluidDataStoreRuntime,
	type IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
	type IExperimentalIncrementalSummaryContext,
	type IGarbageCollectionData,
	type ITelemetryContext,
	type ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import { type SharedObject } from "@fluidframework/shared-object-base";
import { AttachState } from "@fluidframework/container-definitions";
import { assert } from "@fluidframework/core-utils";
import { NoDeltasChannelServices, ShimChannelServices } from "./shimChannelServices.js";
import { SharedTreeShimDeltaHandler } from "./sharedTreeDeltaHandler.js";
import { ShimHandle } from "./shimHandle.js";

/**
 * SharedTreeShim is loaded by clients that join after the migration completes, and holds the new SharedTree.
 *
 * @remarks
 *
 * Its sole responsibility should be to drop v1 &
 * migrate ops. It should not be responsible for any other migration logic. This should make the class easier to reason
 * about.
 *
 * @internal
 */
export class Shim<T extends SharedObject = SharedObject> implements IChannel {
	public constructor(
		public readonly id: string,
		public readonly runtime: IFluidDataStoreRuntime,
		public readonly factory: IChannelFactory,
	) {
		this.newTreeShimDeltaHandler = new SharedTreeShimDeltaHandler();
		this.handle = new ShimHandle<Shim<T>>(this);
	}

	private readonly newTreeShimDeltaHandler: SharedTreeShimDeltaHandler;
	private services?: ShimChannelServices;
	private _currentTree?: T;
	public get currentTree(): T {
		assert(this._currentTree !== undefined, "No current tree initialized");
		return this._currentTree;
	}

	public get attributes(): IChannelAttributes {
		// TODO: investigate if we need to add the shim attributes to denote the transition from v1 -> v2 with v1 ops -> v2 ops
		return this.currentTree.attributes;
	}

	public handle: IFluidHandle;
	public get IFluidLoadable(): IFluidLoadable {
		return this;
	}
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		return this.currentTree.getAttachSummary(fullTree, trackState, telemetryContext);
	}
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		return this.currentTree.summarize(
			fullTree,
			trackState,
			telemetryContext,
			incrementalSummaryContext,
		);
	}
	public isAttached(): boolean {
		return this.currentTree.isAttached();
	}
	public connect(services: IChannelServices): void {
		// TODO: wrap services before passing it down to currentTree with the appropriate IDeltaHandler.
		const shimServices = this.generateShimServicesOnce(services);
		return this.currentTree.connect(shimServices);
	}

	// The goal here is to mimic the SharedObject.load functionality
	public async load(services: IChannelServices): Promise<void> {
		// This weird shimServices logic is to enable rehydration of the SharedTreeShim from a snapshot in a detached
		// state.
		const shimServices =
			this.runtime.attachState === AttachState.Detached
				? new NoDeltasChannelServices(services)
				: this.generateShimServicesOnce(services);
		this._currentTree = (await this.factory.load(
			this.runtime,
			this.id,
			shimServices,
			this.factory.attributes,
		)) as T;
	}

	public create(): void {
		// TODO: Should we be allowing the creation of legacy shared trees?
		this._currentTree = this.factory.create(this.runtime, this.id) as T;
	}

	private generateShimServicesOnce(services: IChannelServices): ShimChannelServices {
		assert(this.services === undefined, "Already connected");
		this.services = new ShimChannelServices(services, this.newTreeShimDeltaHandler);
		return this.services;
	}

	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.currentTree.getGCData(fullGC);
	}
}
