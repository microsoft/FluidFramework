/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel } from "@fluidframework/datastore-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IContextSummarizeResult } from "@fluidframework/runtime-definitions";
import { addBlobToSummary } from "@fluidframework/runtime-utils";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";

export const attributesBlobKey = ".attributes";

export interface IChannelContext {
    getChannel(): Promise<IChannel>;

    setConnectionState(connected: boolean, clientId?: string);

    processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata?: unknown): void;

    summarize(fullTree?: boolean, trackState?: boolean): Promise<IContextSummarizeResult>;

    reSubmit(content: any, localOpMetadata: unknown): void;
}

export function createServiceEndpoints(
    id: string,
    connected: boolean,
    submitFn: (content: any, localOpMetadata: unknown) => void,
    dirtyFn: () => void,
    storageService: IDocumentStorageService,
    tree?: Promise<ISnapshotTree>,
    extraBlobs?: Promise<Map<string, string>>,
) {
    const deltaConnection = new ChannelDeltaConnection(
        id,
        connected,
        (message, localOpMetadata) => submitFn(message, localOpMetadata),
        dirtyFn);
    const objectStorage = new ChannelStorageService(tree, storageService, extraBlobs);

    return {
        deltaConnection,
        objectStorage,
    };
}

export function summarizeChannel(
    channel: IChannel,
    fullTree: boolean = false,
    trackState: boolean = false,
): ISummaryTreeWithStats {
    const summarizeResult = channel.summarize(fullTree, trackState);
    // Add the channel attributes to the returned tree
    addBlobToSummary(summarizeResult, attributesBlobKey, JSON.stringify(channel.attributes));
    return summarizeResult;
}
