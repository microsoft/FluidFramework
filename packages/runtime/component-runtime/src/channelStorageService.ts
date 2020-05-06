/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentStorageService } from "@microsoft/fluid-driver-definitions";
import { SnapshotTreeHolder } from "@microsoft/fluid-protocol-base";
import { IObjectStorageService } from "@microsoft/fluid-runtime-definitions";

export class ChannelStorageService implements IObjectStorageService {
    private readonly flattenedTreeP: Promise<{ [path: string]: string }>;

    constructor(
        tree: SnapshotTreeHolder | undefined,
        private readonly storage: IDocumentStorageService,
        private readonly extraBlobs?: Promise<Map<string, string>>,
    ) {
        if (tree !== undefined) {
            this.flattenedTreeP = tree.getFlattenedTree();
        } else {
            this.flattenedTreeP = Promise.resolve({});
        }
    }

    public async contains(path: string): Promise<boolean> {
        return (await this.flattenedTreeP)[path] !== undefined;
    }

    public async read(path: string): Promise<string> {
        const id = await this.getIdForPath(path);
        const blob = this.extraBlobs !== undefined
            ? (await this.extraBlobs).get(id)
            : undefined;

        return blob ?? this.storage.read(id);
    }

    private async getIdForPath(path: string): Promise<string> {
        return (await this.flattenedTreeP)[path];
    }
}
