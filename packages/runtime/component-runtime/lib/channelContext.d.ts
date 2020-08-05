/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ISnapshotTree, ITree } from "@fluidframework/protocol-definitions";
import { IChannel } from "@fluidframework/component-runtime-definitions";
import { ISummarizeResult } from "@fluidframework/runtime-definitions";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
export interface IChannelContext {
    getChannel(): Promise<IChannel>;
    setConnectionState(connected: boolean, clientId?: string): any;
    processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata?: unknown): void;
    /** @deprecated in 0.22 summarizerNode */
    snapshot(fullTree?: boolean): Promise<ITree>;
    summarize(fullTree?: boolean): Promise<ISummarizeResult>;
    reSubmit(content: any, localOpMetadata: unknown): void;
}
export declare function createServiceEndpoints(id: string, connected: boolean, submitFn: (content: any, localOpMetadata: unknown) => void, dirtyFn: () => void, storageService: IDocumentStorageService, tree?: Promise<ISnapshotTree>, extraBlobs?: Promise<Map<string, string>>): {
    deltaConnection: ChannelDeltaConnection;
    objectStorage: ChannelStorageService;
};
export declare function snapshotChannel(channel: IChannel): ITree;
//# sourceMappingURL=channelContext.d.ts.map