/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
import { type IFluidHandle, type IFluidLoadable } from "@fluidframework/core-interfaces";

/**
 * Create skeleton Hot Swap Channel
 */
export class HotSwap implements IChannel {
	public id!: string;
	public attributes!: IChannelAttributes;
	public getAttachSummary(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
	): ISummaryTreeWithStats {
		throw new Error("Method not implemented.");
	}
	public async summarize(
		fullTree?: boolean | undefined,
		trackState?: boolean | undefined,
		telemetryContext?: ITelemetryContext | undefined,
		incrementalSummaryContext?: IExperimentalIncrementalSummaryContext | undefined,
	): Promise<ISummaryTreeWithStats> {
		throw new Error("Method not implemented.");
	}
	public isAttached(): boolean {
		throw new Error("Method not implemented.");
	}
	public connect(services: IChannelServices): void {
		throw new Error("Method not implemented.");
	}
	public getGCData(fullGC?: boolean | undefined): IGarbageCollectionData {
		throw new Error("Method not implemented.");
	}
	public handle!: IFluidHandle;
	public IFluidLoadable!: IFluidLoadable;
}
