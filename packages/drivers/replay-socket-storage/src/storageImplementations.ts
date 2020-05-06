/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IResolvedUrl,
} from "@microsoft/fluid-driver-definitions";
import { buildSnapshotTree, buildSnapshotTreeAsync, SnapshotTreeHolder } from "@microsoft/fluid-protocol-base";
import {
    IClient,
    ISnapshotTree,
    ITree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { EmptyDeltaStorageService } from "./emptyDeltaStorageService";
import { ReadDocumentStorageServiceBase } from "./replayController";

/**
 * Structure of snapshot on disk, when we store snapshot as single file
 */
export interface IFileSnapshot {
    tree: ITree;
    commits: { [key: string]: ITree };
}

export class FileSnapshotReader extends ReadDocumentStorageServiceBase implements IDocumentStorageService {
    // IVersion.treeId used to communicate between getVersions() & getSnapshotTree() calls to indicate IVersion is ours.
    private static readonly FileStorageVersionTreeId = "FileStorageTreeId";

    protected docId?: string;
    protected docTreeHolder: SnapshotTreeHolder;
    protected blobs: Promise<Map<string, string>>;
    protected readonly commits: { [key: string]: ITree } = {};
    protected readonly trees: { [key: string]: ISnapshotTree } = {};

    public constructor(json: IFileSnapshot) {
        super();
        this.commits = json.commits;

        const treeHolderAndMap = buildSnapshotTree(json.tree.entries);
        this.docTreeHolder = treeHolderAndMap.treeHolder;
        this.blobs = treeHolderAndMap.blobMap;
    }

    public async getVersions(
        versionId: string,
        count: number): Promise<IVersion[]> {
        if (this.docId === undefined || this.docId === versionId) {
            this.docId = versionId;
            return [{ id: "latest", treeId: "" }];
        }

        if (this.commits[versionId] !== undefined) {
            return [{ id: versionId, treeId: FileSnapshotReader.FileStorageVersionTreeId }];
        }
        throw new Error(`Unknown version ID: ${versionId}`);
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (!versionRequested || versionRequested.id === "latest") {
            return this.docTreeHolder.snapshotTree;
        }
        if (versionRequested.treeId !== FileSnapshotReader.FileStorageVersionTreeId) {
            throw new Error(`Unknown version id: ${versionRequested}`);
        }

        let snapshotTree = this.trees[versionRequested.id];
        if (snapshotTree === undefined) {
            const tree = this.commits[versionRequested.id];
            if (tree === undefined) {
                throw new Error(`Can't find version ${versionRequested.id}`);
            }

            const blobMap = await this.blobs;
            this.trees[versionRequested.id] = snapshotTree = await buildSnapshotTreeAsync(tree.entries, blobMap);
            this.blobs = Promise.resolve(blobMap);
        }
        return snapshotTree;
    }

    public async read(blobId: string): Promise<string> {
        const blob = (await this.blobs).get(blobId);
        if (blob !== undefined) {
            return blob;
        }
        throw new Error(`Unknown blob ID: ${blobId}`);
    }
}

export class SnapshotStorage extends ReadDocumentStorageServiceBase {
    protected docId?: string;

    constructor(
        protected readonly storage: IDocumentStorageService,
        protected readonly docTree: ISnapshotTree | null) {
        super();
        assert(this.docTree);
    }

    public async getVersions(versionId: string, count: number): Promise<IVersion[]> {
        if (this.docId === undefined || this.docId === versionId) {
            this.docId = versionId;
            return [{ id: "latest", treeId: "" }];
        }
        return this.storage.getVersions(versionId, count);
    }

    public async getSnapshotTree(versionRequested?: IVersion): Promise<ISnapshotTree | null> {
        if (versionRequested && versionRequested.id !== "latest") {
            return this.storage.getSnapshotTree(versionRequested);
        }

        return this.docTree;
    }

    public async read(blobId: string): Promise<string> {
        return this.storage.read(blobId);
    }
}

export class OpStorage extends ReadDocumentStorageServiceBase {
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

export class StaticStorageDocumentService implements IDocumentService {
    constructor(private readonly storage: IDocumentStorageService) { }

    public async connectToStorage(): Promise<IDocumentStorageService> {
        return this.storage;
    }

    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return new EmptyDeltaStorageService();
    }

    public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
        // We have no delta stream, so make it not return forever...
        return new Promise(() => { });
    }

    public async branch(): Promise<string> {
        return Promise.reject("Invalid operation");
    }

    public getErrorTrackingService() {
        return null;
    }
}

export class StaticStorageDocumentServiceFactory implements IDocumentServiceFactory {
    public readonly protocolName = "fluid-static-storage:";
    public constructor(protected readonly storage: IDocumentStorageService) { }

    public async createDocumentService(fileURL: IResolvedUrl): Promise<IDocumentService> {
        return new StaticStorageDocumentService(this.storage);
    }
}
