/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, stringToBuffer } from "@fluidframework/common-utils";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentServiceFactory,
    IDocumentStorageService,
    IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import {
    IClient,
    ISnapshotTree,
    ITree,
    IVersion,
    ISummaryTree,
} from "@fluidframework/protocol-definitions";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
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
    protected static readonly FileStorageVersionTreeId = "FileStorageTreeId";

    protected docId?: string;
    protected docTree: ISnapshotTree;
    protected blobs: Map<string, string>;
    protected readonly commits: { [key: string]: ITree } = {};
    protected readonly trees: { [key: string]: ISnapshotTree } = {};

    public constructor(json: IFileSnapshot) {
        super();
        this.commits = json.commits;

        this.blobs = new Map<string, string>();
        this.docTree = buildSnapshotTree(json.tree.entries, this.blobs);
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
            return this.docTree;
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

            this.trees[versionRequested.id] = snapshotTree = buildSnapshotTree(tree.entries, this.blobs);
        }
        return snapshotTree;
    }

    public async read(blobId: string): Promise<string> {
        const blob = this.blobs.get(blobId);
        if (blob !== undefined) {
            return blob;
        }
        throw new Error(`Unknown blob ID: ${blobId}`);
    }

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        const blob = this.blobs.get(blobId);
        if (blob !== undefined) {
            return stringToBuffer(blob, "base64");
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
        assert(!!this.docTree);
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

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        return this.storage.readBlob(blobId);
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

    public async readBlob(blobId: string): Promise<ArrayBufferLike> {
        throw new Error(`Unknown blob ID: ${blobId}`);
    }
}

export class StaticStorageDocumentService implements IDocumentService {
    constructor(private readonly storage: IDocumentStorageService) { }

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public get resolvedUrl(): IResolvedUrl {
        throw new Error("Not implemented");
    }

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

    // TODO: Issue-2109 Implement detach container api or put appropriate comment.
    public async createContainer(
        createNewSummary: ISummaryTree,
        resolvedUrl: IResolvedUrl,
        logger: ITelemetryLogger,
    ): Promise<IDocumentService> {
        throw new Error("Not implemented");
    }
}
