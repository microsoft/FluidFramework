/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { BlobTreeEntry } from "@fluidframework/protocol-base";
import {
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
} from "@fluidframework/protocol-definitions";
import { IChannel } from "@fluidframework/datastore-definitions";
import { ISummarizeResult } from "@fluidframework/runtime-definitions";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";

export interface IChannelContext {
    getChannel(): Promise<IChannel>;

    setConnectionState(connected: boolean, clientId?: string);

    processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata?: unknown): void;

    /** @deprecated in 0.22 summarizerNode */
    snapshot(fullTree?: boolean): Promise<ITree>;

    summarize(fullTree?: boolean): Promise<ISummarizeResult>;

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

export function snapshotChannel(channel: IChannel) {
    const snapshot = channel.snapshot();

    // Add in the object attributes to the returned tree
    const objectAttributes = channel.attributes;
    snapshot.entries.push(new BlobTreeEntry(".attributes", JSON.stringify(objectAttributes)));

    return snapshot;
}
