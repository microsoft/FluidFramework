/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { type IFluidHandle, type IFluidLoadable } from "@fluidframework/core-interfaces";
import {
	type IChannelAttributes,
	type IChannel,
	type IChannelServices,
} from "@fluidframework/datastore-definitions";
import {
	type IExperimentalIncrementalSummaryContext,
	type IGarbageCollectionData,
	type ITelemetryContext,
	type ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import { type ISharedTree } from "@fluid-experimental/tree2";

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
export class SharedTreeShim implements IChannel {
	public constructor(
		public readonly id: string,
		public readonly currentTree: ISharedTree,
	) {}

	public get attributes(): IChannelAttributes {
		// TODO: investigate if we need to add the shim attributes to denote the transition from v1 -> v2 with v1 ops -> v2 ops
		return this.currentTree.attributes;
	}
	// TODO handle
	public handle!: IFluidHandle;
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
		return this.currentTree.connect(services);
	}
	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		return this.currentTree.getGCData(fullGC);
	}
}
