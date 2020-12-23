/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IChannel } from "@fluidframework/datastore-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISequencedDocumentMessage, ISnapshotTree } from "@fluidframework/protocol-definitions";
import {
    gcBlobKey,
    IChannelSummarizeResult,
    IContextSummarizeResult,
    IGCData,
    IGCDetails,
} from "@fluidframework/runtime-definitions";
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

    getGCData(): Promise<IGCData>;
}

export function createServiceEndpoints(
    id: string,
    connected: boolean,
    submitFn: (content: any, localOpMetadata: unknown) => void,
    dirtyFn: () => void,
    storageService: IDocumentStorageService,
    tree?: ISnapshotTree,
    extraBlobs?: Map<string, string>,
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
): IChannelSummarizeResult {
    const summarizeResult = channel.summarize(fullTree, trackState);

    // Add the channel attributes to the returned result.
    addBlobToSummary(summarizeResult, attributesBlobKey, JSON.stringify(channel.attributes));

    // Add GC details to the summary.
    const gcDetails: IGCDetails = {
        used: true,
        gcData: summarizeResult.gcData,
    };
    addBlobToSummary(summarizeResult, gcBlobKey, JSON.stringify(gcDetails));

    return summarizeResult;
}
