/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { BlobTreeEntry } from "@fluidframework/protocol-base";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { ChannelStorageService } from "./channelStorageService";
export function createServiceEndpoints(id, connected, submitFn, dirtyFn, storageService, tree, extraBlobs) {
    const deltaConnection = new ChannelDeltaConnection(id, connected, (message, localOpMetadata) => submitFn(message, localOpMetadata), dirtyFn);
    const objectStorage = new ChannelStorageService(tree, storageService, extraBlobs);
    return {
        deltaConnection,
        objectStorage,
    };
}
export function snapshotChannel(channel) {
    const snapshot = channel.snapshot();
    // Add in the object attributes to the returned tree
    const objectAttributes = channel.attributes;
    snapshot.entries.push(new BlobTreeEntry(".attributes", JSON.stringify(objectAttributes)));
    return snapshot;
}
//# sourceMappingURL=channelContext.js.map