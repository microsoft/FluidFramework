/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { IChannelStorageService } from "@fluidframework/datastore-definitions";
export declare class ChannelStorageService implements IChannelStorageService {
    private readonly tree;
    private readonly storage;
    private readonly extraBlobs?;
    private static flattenTree;
    private readonly flattenedTreeP;
    constructor(tree: Promise<ISnapshotTree> | undefined, storage: Pick<IDocumentStorageService, "read">, extraBlobs?: Promise<Map<string, string>> | undefined);
    contains(path: string): Promise<boolean>;
    read(path: string): Promise<string>;
    list(path: string): Promise<string[]>;
    private getIdForPath;
}
//# sourceMappingURL=channelStorageService.d.ts.map