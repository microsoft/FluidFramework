/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConnectionState } from "@microsoft/fluid-container-definitions";
import {
    FileMode,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import { IChannel, IEnvelope } from "@microsoft/fluid-runtime-definitions";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";

export interface IChannelContext {
    getChannel(): Promise<IChannel>;

    changeConnectionState(value: ConnectionState, clientId: string);

    processOp(message: ISequencedDocumentMessage, local: boolean): void;

    snapshot(): Promise<ITree>;

    isRegistered(): boolean;
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
    snapshot.entries.push({
        mode: FileMode.File,
        path: ".attributes",
        type: TreeEntry[TreeEntry.Blob],
        value: {
            contents: JSON.stringify(objectAttributes),
            encoding: "utf-8",
        },
    });

    // If baseId exists then the previous snapshot is still valid
    snapshot.id = baseId;

    return snapshot;
}
