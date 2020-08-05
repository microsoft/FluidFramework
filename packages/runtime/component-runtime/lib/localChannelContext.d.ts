/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ITree } from "@fluidframework/protocol-definitions";
import { IChannel, IFluidDataStoreRuntime } from "@fluidframework/component-runtime-definitions";
import { IFluidDataStoreContext, ISummarizeResult } from "@fluidframework/runtime-definitions";
import { IChannelContext } from "./channelContext";
import { ISharedObjectRegistry } from "./componentRuntime";
/**
 * Channel context for a locally created channel
 */
export declare class LocalChannelContext implements IChannelContext {
    private readonly componentContext;
    private readonly storageService;
    private readonly submitFn;
    readonly channel: IChannel;
    private attached;
    private connection;
    private readonly dirtyFn;
    constructor(id: string, registry: ISharedObjectRegistry, type: string, runtime: IFluidDataStoreRuntime, componentContext: IFluidDataStoreContext, storageService: IDocumentStorageService, submitFn: (content: any, localOpMetadata: unknown) => void, dirtyFn: (address: string) => void);
    getChannel(): Promise<IChannel>;
    setConnectionState(connected: boolean, clientId?: string): void;
    processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void;
    reSubmit(content: any, localOpMetadata: unknown): void;
    snapshot(fullTree?: boolean): Promise<ITree>;
    summarize(fullTree?: boolean): Promise<ISummarizeResult>;
    getAttachSnapshot(): ITree;
    attach(): void;
}
//# sourceMappingURL=localChannelContext.d.ts.map