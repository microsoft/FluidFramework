/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "@fluidframework/datastore";
import {
    IFluidDataStoreRuntime,
    IChannelFactory,
    IChannelAttributes,
    IChannelServices,
    IChannel,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, SummaryType } from "@fluidframework/protocol-definitions";
import {
    IFluidDataStoreContext,
    IGarbageCollectionData,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";

class UnknownChannel implements IChannel {
    constructor(
        public readonly id: string,
        public readonly attributes: IChannelAttributes,
        services: IChannelServices) {
        services.deltaConnection.attach({
            process: (message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) => {
            },
            setConnectionState: (connected: boolean) => {
            },
            reSubmit: (content: any, localOpMetadata: unknown) => {
            },
            applyStashedOp: (content: any) => {
            },
        });
    }

    get IFluidLoadable() { return this; }
    get handle(): IFluidHandle {
        throw new Error("not implemented");
    }

    public getAttachSummary(fullTree?: boolean, trackState?: boolean): ISummaryTreeWithStats {
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
                tree: { },
            },
        };
    }

    public async summarize(fullTree?: boolean, trackState?: boolean): Promise<ISummaryTreeWithStats> {
        return this.getAttachSummary(fullTree, trackState);
    }

    public isAttached() { return true; }

    public connect(services: IChannelServices): void {}

    public getGCData(): IGarbageCollectionData {
        return { gcNodes: { "/": [] } };
    }
}

export class UnknownChannelFactory implements IChannelFactory {
    readonly attributes: IChannelAttributes = {
        type: this.type,
        snapshotFormatVersion: "1.0",
        packageVersion: "1.0",
    };

    constructor(public readonly type: string) {}

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
    Base: typeof FluidDataStoreRuntime = FluidDataStoreRuntime) {
    return class RuntimeWithRequestHandler extends Base {
        constructor(
            dataStoreContext: IFluidDataStoreContext,
            sharedObjectRegistry: ISharedObjectRegistry,
            existing: boolean,
        ) {
            super(dataStoreContext, new ObjectRegistryWithUnknownChannels(sharedObjectRegistry), existing);
        }
    } as typeof FluidDataStoreRuntime;
}
