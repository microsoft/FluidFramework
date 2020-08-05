/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IChannelStorageService } from "@fluidframework/component-runtime-definitions";
import { ITree } from "@fluidframework/protocol-definitions";
export declare class LocalChannelStorageService implements IChannelStorageService {
    private readonly tree;
    constructor(tree: ITree);
    read(path: string): Promise<string>;
    contains(path: string): Promise<boolean>;
    list(path: string): Promise<string[]>;
    /**
     * Provides a synchronous access point to locally stored data
     */
    private readSync;
    private readSyncInternal;
}
//# sourceMappingURL=localChannelStorageService.d.ts.map