/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentStorageService,
    ISnapshotTree,
    ITree,
    IVersion,
} from "@prague/container-definitions";
import { buildHierarchy, flatten } from "@prague/utils";
import * as assert from "assert";
import { ReplayStorageService } from "./replayController";

/**
 * Structure of snapshot on disk, when we store snapshot as single file
 */
export interface IFileSnapshot {
    tree: ITree;
    commits: {[key: string]: ITree};
}

export class FileStorage extends ReplayStorageService {
    // IVersion.treeId used to communicate between getVersions() & getSnapshotTree() calls to indicate IVersion is ours.
    private static readonly FileStorageVersionTreeId = "FileStorageTreeId";

    protected docId?: string;
    protected tree: ISnapshotTree;
    protected blobs = new Map<string, string>();
    protected commits: {[key: string]: ITree} = {};

    public constructor(json: IFileSnapshot) {
        super();
        this.commits = json.commits;
        const flattened = flatten(json.tree.entries, this.blobs);
        this.tree = buildHierarchy(flattened);
    }

    public async getVersions(
            versionId: string,
            count: number): Promise<IVersion[]> {
        if (this.docId === undefined || this.docId === versionId) {
            this.docId = versionId;
            return [{id: "latest", treeId: ""}];
        }

        if (this.commits[versionId] !== undefined) {
            return [{id: versionId, treeId: FileStorage.FileStorageVersionTreeId}];
        }
        throw new Error(`Unknown version ID: ${versionId}`);
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (versionRequested && versionRequested.id !== "latest") {
            if (versionRequested.treeId !== FileStorage.FileStorageVersionTreeId) {
                throw new Error(`Unknown version id: ${versionRequested}`);
            }
            const tree = this.commits[versionRequested.id];
            if (tree === undefined) {
                throw new Error(`Can't find version ${versionRequested.id}`);
            }

            const flattened = flatten(tree.entries, this.blobs);
            return buildHierarchy(flattened);
        }
        return this.tree;
    }

    public async read(blobId: string): Promise<string> {
        const blob = this.blobs.get(blobId);
        if (blob !== undefined) {
            return blob;
        }
        throw new Error(`Unknown blob ID: ${blobId}`);
    }
}

export class SnapshotStorage extends ReplayStorageService {
    protected docId?: string;

    constructor(
            protected readonly storage: IDocumentStorageService,
            protected readonly tree: ISnapshotTree | null) {
        super();
        assert(this.tree);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        if (this.docId === undefined || this.docId === versionId) {
            this.docId = versionId;
            return [{id: "latest", treeId: ""}];
        }
        return this.storage.getVersions(versionId, count);
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (versionRequested && versionRequested.id !== "latest") {
            return this.storage.getSnapshotTree(versionRequested);
        }

        return this.tree;
    }

    public read(blobId: string): Promise<string> {
        return this.storage.read(blobId);
    }
}

export class OpStorage extends ReplayStorageService {
    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        return [];
    }

    public async getSnapshotTree(version?: IVersion): Promise<ISnapshotTree | null> {
        throw new Error("no snapshot tree should be asked when playing ops");
    }

    public async read(blobId: string): Promise<string> {
        throw new Error(`Unknown blob ID: ${blobId}`);
    }
}
