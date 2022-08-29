/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { assert, bufferToString } from "@fluidframework/common-utils";
import { IDocumentStorageService, ISummaryContext } from "@fluidframework/driver-definitions";
import { buildSnapshotTree, convertSummaryTreeToSnapshotITree } from "@fluidframework/driver-utils";
import * as api from "@fluidframework/protocol-definitions";
import { IFileSnapshot, ReadDocumentStorageServiceBase } from "@fluidframework/replay-driver";

// This ID is used by replay tool as Document Id.
// We leverage it to figure out when container is asking for root document tree.
export const FileStorageDocumentName = "FileStorageDocId"; // Some unique document name

// Tree ID use to communicate between getVersions() & getSnapshotTree() that IVersion is ours.
const FileStorageVersionTreeId = "FileStorageTreeId";

/**
 * Document storage service for the file driver.
 */
export class FluidFetchReader extends ReadDocumentStorageServiceBase implements IDocumentStorageService {
    protected docTree: api.ISnapshotTree | null = null;

    constructor(private readonly path: string, private readonly versionName?: string) {
        super();
    }

    /**
     * Read the file and returns the snapshot tree.
     * @param version - The version contains the path of the file which contains the snapshot tree.
     */
    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        assert(version !== null, 0x092 /* "version input for reading snapshot tree is null!" */);
        assert(!version || version.treeId === FileStorageVersionTreeId,
            0x093 /* "invalid version input for reading snapshot tree!" */);

        let filename: string;
        let rootTree = false;
        if (!version || version.id === "latest") {
            if (this.docTree) {
                return this.docTree;
            }
            if (this.versionName === undefined) {
                return null;
            }
            rootTree = true;
            filename = `${this.path}/${this.versionName}/tree.json`;
        } else {
            filename = `${this.path}/${this.versionName}/${version.id}.json`;
        }

        if (!fs.existsSync(filename)) {
            throw new Error(`Can't find file ${filename}`);
        }
        const data = fs.readFileSync(filename);
        const tree = JSON.parse(data.toString("utf-8"));
        if (rootTree) {
            this.docTree = tree;
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return tree;
    }

    /**
     * Gets the path of the snapshot tree to be read.
     * @param versionId - version ID.
     * @param count - Number of versions to be returned.
     */
    public async getVersions(versionId: string | null, count: number): Promise<api.IVersion[]> {
        if (versionId === FileStorageDocumentName || versionId === null) {
            if (this.docTree || this.versionName !== undefined) {
                return [{ id: "latest", treeId: FileStorageVersionTreeId }];
            }
            // Started with ops - return empty set.
            return [];
        } else if (this.versionName !== undefined) {
            assert(!!this.docTree, 0x094 /* "Missing snapshot tree!" */);
            return [{
                id: versionId,
                treeId: FileStorageVersionTreeId,
            }];
        }
        throw new Error(`Unknown version: ${versionId}`);
    }

    public async readBlob(sha: string): Promise<ArrayBufferLike> {
        if (this.versionName !== undefined) {
            const fileName = `${this.path}/${this.versionName}/${sha}`;
            if (fs.existsSync(fileName)) {
                const data = fs.readFileSync(fileName);
                return data;
            }
        }
        throw new Error(`Can't find blob ${sha}`);
    }
}

export interface ISnapshotWriterStorage extends IDocumentStorageService {
    onSnapshotHandler(snapshot: IFileSnapshot): void;
    reset(): void;
}

export type ReaderConstructor = new (...args: any[]) => IDocumentStorageService;
export const FileSnapshotWriterClassFactory = <TBase extends ReaderConstructor>(Base: TBase) =>
    class extends Base implements ISnapshotWriterStorage {
        // Note: if variable name has same name as in base class, it overrides it!
        public blobsWriter = new Map<string, ArrayBufferLike>();
        public latestWriterTree?: api.ISnapshotTree;
        public docId?: string;

        public reset() {
            this.blobsWriter = new Map<string, ArrayBufferLike>();
            this.latestWriterTree = undefined;
            this.docId = undefined;
        }

        public onSnapshotHandler(snapshot: IFileSnapshot): void {
            throw new Error("onSnapshotHandler is not setup! Please provide your handler!");
        }

        public async readBlob(sha: string): Promise<ArrayBufferLike> {
            const blob = this.blobsWriter.get(sha);
            if (blob !== undefined) {
                return blob;
            }
            return super.readBlob(sha);
        }

        public async getVersions(versionId: string | null, count: number): Promise<api.IVersion[]> {
            // If we already saved document, that means we are getting here because of snapshot generation.
            // Not returning tree ensures that ContainerRuntime.snapshot() would regenerate subtrees for
            // each unchanged data store.
            // If we want to change that, we would need to capture docId on first call and return this.latestWriterTree
            // when latest is requested.
            if (this.latestWriterTree && (this.docId === versionId || versionId === null)) {
                return [{ id: "latest", treeId: FileStorageVersionTreeId }];
            }

            if (this.docId === undefined && versionId !== null) {
                this.docId = versionId;
            }

            return super.getVersions(versionId, count);
        }

        public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
            if (this.latestWriterTree && (!version || version.id === "latest")) {
                return this.latestWriterTree;
            }
            return super.getSnapshotTree(version);
        }

        public async uploadSummaryWithContext(summary: api.ISummaryTree, context: ISummaryContext): Promise<string> {
            const tree = convertSummaryTreeToSnapshotITree(summary);

            // Remove tree IDs for easier comparison of snapshots
            delete tree.id;
            removeNullTreeIds(tree);

            this.latestWriterTree = buildSnapshotTree(tree.entries, this.blobsWriter);

            const fileSnapshot: IFileSnapshot = { tree, commits: {} };
            this.onSnapshotHandler(fileSnapshot);
            return "testHandleId";
        }

        public async buildTree(snapshotTree: api.ISnapshotTree): Promise<api.ITree> {
            const tree: api.ITree = { entries: [] };

            for (const subTreeId of Object.keys(snapshotTree.trees)) {
                const subTree = await this.buildTree(snapshotTree.trees[subTreeId]);
                tree.entries.push({
                    mode: api.FileMode.Directory,
                    path: subTreeId,
                    type: api.TreeEntry.Tree,
                    value: subTree,
                });
            }

            for (const blobName of Object.keys(snapshotTree.blobs)) {
                const buffer = await this.readBlob(snapshotTree.blobs[blobName]);
                const contents = bufferToString(buffer, "utf8");
                const blob: api.IBlob = {
                    contents,
                    encoding: "utf-8",
                };
                tree.entries.push({
                    mode: api.FileMode.File,
                    path: blobName,
                    type: api.TreeEntry.Blob,
                    value: blob,
                });
            }

            return tree;
        }
    };

function removeNullTreeIds(tree: api.ITree) {
    for (const node of tree.entries) {
        if (node.type === api.TreeEntry.Tree) {
            removeNullTreeIds(node.value);
        }
    }
    assert(tree.id === undefined || tree.id === null,
        0x096 /* "Trying to remove valid tree IDs in removeNullTreeIds()!" */);
    delete tree.id;
}
export const FluidFetchReaderFileSnapshotWriter = FileSnapshotWriterClassFactory(FluidFetchReader);
