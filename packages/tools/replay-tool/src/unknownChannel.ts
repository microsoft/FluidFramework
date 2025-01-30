/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import {
	FluidDataStoreRuntime,
	ISharedObjectRegistry,
} from "@fluidframework/datastore/internal";
import {
	IChannel,
	IChannelAttributes,
	IChannelFactory,
	IFluidDataStoreRuntime,
	IChannelServices,
} from "@fluidframework/datastore-definitions/internal";
import { SummaryType } from "@fluidframework/driver-definitions";
import {
	ITelemetryContext,
	IGarbageCollectionData,
	ISummaryTreeWithStats,
	IFluidDataStoreContext,
	type IRuntimeMessageCollection,
} from "@fluidframework/runtime-definitions/internal";

class UnknownChannel implements IChannel {
	constructor(
		public readonly id: string,
		public readonly attributes: IChannelAttributes,
		services: IChannelServices,
	) {
		services.deltaConnection.attach({
			processMessages: (messageCollection: IRuntimeMessageCollection) => {},
			setConnectionState: (connected: boolean) => {},
			reSubmit: (content: any, localOpMetadata: unknown) => {},
			applyStashedOp: (content: any) => {},
			rollback: (content: any, localOpMetadata: unknown) => {},
		});
	}

	get IFluidLoadable() {
		return this;
	}
	get handle(): IFluidHandle {
		throw new Error("not implemented");
	}

	public getAttachSummary(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): ISummaryTreeWithStats {
		return {
			stats: {
				treeNodeCount: 1,
				blobNodeCount: 0,
				handleNodeCount: 0,
				totalBlobSize: 0,
				unreferencedBlobSize: 0,
			},
			summary: {
				type: SummaryType.Tree,
				tree: {},
			},
		};
	}

	public async summarize(
		fullTree?: boolean,
		trackState?: boolean,
		telemetryContext?: ITelemetryContext,
	): Promise<ISummaryTreeWithStats> {
		return this.getAttachSummary(fullTree, trackState, telemetryContext);
	}

	public isAttached() {
		return true;
	}

	public connect(services: IChannelServices): void {}

	public getGCData(): IGarbageCollectionData {
		return { gcNodes: { "/": [] } };
	}
}

export class UnknownChannelFactory implements IChannelFactory {
	readonly attributes: IChannelAttributes;

	constructor(public readonly type: string) {
		this.attributes = {
			type,
			snapshotFormatVersion: "1.0",
			packageVersion: "1.0",
		};
	}

	async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<IChannel> {
		return new UnknownChannel(id, channelAttributes, services);
	}

	create(runtime: IFluidDataStoreRuntime, id: string): IChannel {
		throw new Error("Not implemented");
	}
}

class ObjectRegistryWithUnknownChannels implements ISharedObjectRegistry {
	private static readonly types = new Set<string>();

	constructor(private readonly base: ISharedObjectRegistry) {}
	public get(name: string): IChannelFactory | undefined {
		const res = this.base.get(name);
		if (res) {
			return res;
		}
		if (!ObjectRegistryWithUnknownChannels.types.has(name)) {
			ObjectRegistryWithUnknownChannels.types.add(name);
			console.error(`DDS of type ${name} can't be created`);
		}
		return new UnknownChannelFactory(name);
	}
}

export function mixinDataStoreWithAnyChannel(
	Base: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
) {
	return class RuntimeWithRequestHandler extends Base {
		constructor(
			dataStoreContext: IFluidDataStoreContext,
			sharedObjectRegistry: ISharedObjectRegistry,
			existing: boolean,
		) {
			super(
				dataStoreContext,
				new ObjectRegistryWithUnknownChannels(sharedObjectRegistry),
				existing,
				() => {
					// TODO: AB#4779
					throw new Error("TODO");
				},
			);
		}
	} as typeof FluidDataStoreRuntime;
}
