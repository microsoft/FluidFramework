/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ISnapshotTree, ITree } from "@fluidframework/protocol-definitions";
import { IChannel, IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";
import { IFluidDataStoreContext, ISummaryTracker, ISummarizeResult, CreateChildSummarizerNodeFn } from "@fluidframework/runtime-definitions";
import { IChannelContext } from "./channelContext";
import { ISharedObjectRegistry } from "./componentRuntime";
export declare class RemoteChannelContext implements IChannelContext {
    private readonly runtime;
    private readonly componentContext;
    private readonly id;
    private readonly registry;
    private readonly branch;
    private readonly summaryTracker;
    private readonly attachMessageType?;
    private isLoaded;
    private pending;
    private channelP;
    private channel;
    private readonly services;
    private readonly summarizerNode;
    constructor(runtime: IFluidDataStoreRuntime, componentContext: IFluidDataStoreContext, storageService: IDocumentStorageService, submitFn: (content: any, localOpMetadata: unknown) => void, dirtyFn: (address: string) => void, id: string, baseSnapshot: Promise<ISnapshotTree> | ISnapshotTree, registry: ISharedObjectRegistry, extraBlobs: Promise<Map<string, string>> | undefined, branch: string, summaryTracker: ISummaryTracker, createSummarizerNode: CreateChildSummarizerNodeFn, attachMessageType?: string | undefined);
    getChannel(): Promise<IChannel>;
    setConnectionState(connected: boolean, clientId?: string): void;
    processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;
    reSubmit(content: any, localOpMetadata: unknown): void;
    snapshot(fullTree?: boolean): Promise<ITree>;
    summarize(fullTree?: boolean): Promise<ISummarizeResult>;
    private summarizeInternal;
    private loadChannel;
}
//# sourceMappingURL=remoteChannelContext.d.ts.map