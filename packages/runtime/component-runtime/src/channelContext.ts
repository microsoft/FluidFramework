/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@microsoft/fluid-container-definitions";
import { BlobTreeEntry } from "@microsoft/fluid-core-utils";
import {
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { IChannel, IEnvelope } from "@microsoft/fluid-runtime-definitions";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";

export interface IChannelContext {
    getChannel(): Promise<IChannel>;

    changeConnectionState(value: ConnectionState, clientId: string);

    processOp(message: ISequencedDocumentMessage, local: boolean): void;

    snapshot(fullTree?: boolean): Promise<ITree>;

    isRegistered(): boolean;

    refreshBaseSummary(snapshot: ISnapshotTree);
}

export function createServiceEndpoints(
    id: string,
    connectionState: ConnectionState,
    submitFn: (type: MessageType, content: any) => number,
    storageService: IDocumentStorageService,
    tree?: ISnapshotTree,
    extraBlobs?: Map<string, string>,
) {
    const deltaConnection = new ChannelDeltaConnection(
        id,
        connectionState,
        (message) => {
            const envelope: IEnvelope = { address: id, contents: message };
            return submitFn(MessageType.Operation, envelope);
        });
    const objectStorage = new ChannelStorageService(tree, storageService, extraBlobs);

    return {
        deltaConnection,
        objectStorage,
    };
}

export function snapshotChannel(channel: IChannel, baseId: string | null) {
    const snapshot = channel.snapshot();

    // Add in the object attributes to the returned tree
    const objectAttributes = channel.attributes;
    snapshot.entries.push(new BlobTreeEntry(".attributes", JSON.stringify(objectAttributes)));

    // If baseId exists then the previous snapshot is still valid
    snapshot.id = baseId;

    return snapshot;
}
