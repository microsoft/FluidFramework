/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from '@fluidframework/container-definitions';
import { type IFluidHandle, type IFluidLoadable } from '@fluidframework/core-interfaces';
import { assert } from '@fluidframework/core-utils/internal';
import {
	type IChannel,
	type IChannelAttributes,
	type IChannelFactory,
	type IFluidDataStoreRuntime,
	type IChannelServices,
} from '@fluidframework/datastore-definitions/internal';
import {
	type IExperimentalIncrementalSummaryContext,
	type IGarbageCollectionData,
	type ISummaryTreeWithStats,
	type ITelemetryContext,
} from '@fluidframework/runtime-definitions/internal';
import { type ITree } from '@fluidframework/tree';

import { SharedTreeShimDeltaHandler } from './sharedTreeDeltaHandler.js';
import { type IShimChannelServices, NoDeltasChannelServices } from './shimChannelServices.js';
import { StampDeltaConnection } from './shimDeltaConnection.js';
import { ShimHandle } from './shimHandle.js';
import { type IShim } from './types.js';

/**
 * SharedTreeShim is loaded by clients that join after the migration completes, and holds the new SharedTree.
 *
 * @remarks
 *
 * Its sole responsibility should be to drop v1 & migrate ops. It should not be responsible for any other migration
 * logic. This should make the classes easier to reason about.
 * about.
 *
 * @internal
 */
export class SharedTreeShim implements IShim {
	public constructor(
		public readonly id: string,
		public readonly runtime: IFluidDataStoreRuntime,
		public readonly sharedTreeFactory: IChannelFactory<ITree>
	) {
		this.newTreeShimDeltaHandler = new SharedTreeShimDeltaHandler(sharedTreeFactory.attributes);
		this.handle = new ShimHandle<SharedTreeShim>(this);
	}

	private readonly newTreeShimDeltaHandler: SharedTreeShimDeltaHandler;
	private services?: IChannelServices;
	private _currentTree?: ITree & IChannel;
	public get currentTree(): ITree & IChannel {
		assert(this._currentTree !== undefined, 0x7ed /* No current tree initialized */);
		return this._currentTree;
	}

	public get attributes(): IChannelAttributes {
		return this.currentTree.attributes;
	}

	public handle: IFluidHandle<SharedTreeShim>;
	public get IFluidLoadable(): IFluidLoadable {
		return this;
	}
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined
	): ISummaryTreeWithStats {
		return this.currentTree.getAttachSummary(fullTree, trackState, telemetryContext);
	}
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined
	): Promise<ISummaryTreeWithStats> {
		return this.currentTree.summarize(fullTree, trackState, telemetryContext, incrementalSummaryContext);
	}
	public isAttached(): boolean {
		return this.currentTree.isAttached();
	}
	public connect(services: IChannelServices): void {
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
		this._currentTree = await this.sharedTreeFactory.load(
			this.runtime,
			this.id,
			shimServices,
			this.sharedTreeFactory.attributes
		);
	}

	public create(): void {
		this._currentTree = this.sharedTreeFactory.create(this.runtime, this.id);
	}

	private generateShimServicesOnce(services: IChannelServices): IShimChannelServices {
		assert(this.services === undefined, 0x7ee /* Already connected */);
		this.services = services;
		const shimServices = {
			objectStorage: this.services.objectStorage,
			deltaConnection: new StampDeltaConnection(
				this.services.deltaConnection,
				this.newTreeShimDeltaHandler,
				this.sharedTreeFactory.attributes
			),
		};
		return shimServices;
	}

	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.currentTree.getGCData(fullGC);
	}
}
