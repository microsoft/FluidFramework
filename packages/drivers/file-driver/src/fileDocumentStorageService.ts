/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { assert, bufferToString } from "@fluidframework/common-utils";
import {
    IDocumentStorageService,
    IDocumentStorageServicePolicies,    // these are needed for api-extractor
    ISummaryContext,                    // these are needed for api-extractor
} from "@fluidframework/driver-definitions";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import * as api from "@fluidframework/protocol-definitions";
import { IFileSnapshot, ReadDocumentStorageServiceBase } from "@fluidframework/replay-driver";

// This ID is used by replay tool as Document Id.
// We leverage it to figure out when container is asking for root document tree.
export const FileStorageDocumentName = "FileStorageDocId"; // Some unique document name

// Tree ID use to communicate between getVersions() & getSnapshotTree() that IVersion is ours.
const FileStorageVersionTreeId = "FileStorageTreeId";

// This ID should not show up anywhere, as it's internal only ID that no public API should accept.
const FileStorageVersionTreeIdUnused = "baad";

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
        // Fill in this.commit right here?
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return tree;
    }

    /**
     * Gets the path of the snapshot tree to be read.
     * @param versionId - version ID.
     * @param count - Number of versions to be returned.
     */
    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
        if (versionId === FileStorageDocumentName) {
            if (this.docTree || this.versionName !== undefined) {
                return [{ id: "latest", treeId: FileStorageVersionTreeId }];
            }
            // Started with ops - return empty set.
            return [];
        } else if (this.versionName !== undefined) {
            // We loaded from snapshot - search for commit there.
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
    onCommitHandler(dataStoreName: string, tree: api.ITree): void;
    onSnapshotHandler(snapshot: IFileSnapshot): void;
    reset(): void;
}

export type ReaderConstructor = new (...args: any[]) => IDocumentStorageService;
export const FileSnapshotWriterClassFactory = <TBase extends ReaderConstructor>(Base: TBase) =>
    class extends Base implements ISnapshotWriterStorage {
        // Note: if variable name has same name as in base class, it overrides it!
        public blobsWriter = new Map<string, ArrayBufferLike>();
        public commitsWriter: { [key: string]: api.ITree } = {};
        public latestWriterTree?: api.ISnapshotTree;
        public docId?: string;

        public reset() {
            this.blobsWriter = new Map<string, ArrayBufferLike>();
            this.commitsWriter = {};
            this.latestWriterTree = undefined;
            this.docId = undefined;
        }

        public onCommitHandler(dataStoreName: string, tree: api.ITree): void {
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

        public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
            // If we already saved document, that means we are getting here because of snapshot generation.
            // Not returning tree ensures that ContainerRuntime.snapshot() would regenerate subtrees for
            // each unchanged data store.
            // If we want to change that, we would need to capture docId on first call and return this.latestWriterTree
            // when latest is requested.
            if (this.docId === undefined && versionId !== undefined) {
                this.docId = versionId;
            }
            if (this.latestWriterTree && (this.docId === versionId || versionId === undefined)) {
                return [{ id: "latest", treeId: FileStorageVersionTreeId }];
            }

            if (this.commitsWriter[versionId] !== undefined) {
                // PrefetchDocumentStorageService likes to prefetch everything!
                // Skip, as Container does not really need it.
                throw new Error("Not supporting commit loading");
                // Return [{id: versionId, treeId: FileStorageVersionTreeId}];
            }
            return super.getVersions(versionId, count);
        }

        public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
            if (this.latestWriterTree && (!version || version.id === "latest")) {
                return this.latestWriterTree;
            }
            if (version && this.commitsWriter[version.id] !== undefined) {
                return buildSnapshotTree(this.commitsWriter[version.id].entries, this.blobsWriter);
            }
            return super.getSnapshotTree(version);
        }

        public async write(
            tree: api.ITree,
            parents: string[],
            message: string,
            ref: string): Promise<api.IVersion> {
            let dataStoreName = ref ? ref : "container";
            if (tree && tree.entries) {
                tree.entries.forEach((entry) => {
                    if (entry.path === ".component" && entry.type === api.TreeEntry.Blob) {
                        const blob: api.IBlob = entry.value;
                        const content = blob.contents.split(":");
                        if (content[0] === `{"pkg"`) {
                            dataStoreName = content[1].substring(1, content[1].lastIndexOf(`"`));
                        }
                    }
                });
            }

            const commitName = `commit_${dataStoreName}`;

            // Sort entries for easier diffing
            this.sortTree(tree);

            // Remove tree IDs for easier comparison of snapshots
            delete tree.id;
            removeNullTreeIds(tree);

            if (ref) {
                this.commitsWriter[commitName] = tree;
            } else {
                // Rebuild latest tree - runtime will ask for it when generating next snapshot to write out
                // non-changed commits for data stores
                await this.writeOutFullSnapshot(tree);

                // Prep for the future - refresh latest tree, as it's requests on next snapshot generation.
                // Do not care about blobs (at least for now), as blobs are not written out (need follow up)
                this.latestWriterTree = buildSnapshotTree(tree.entries, this.blobsWriter);

                // Do not reset this.commitsWriter - runtime will reference same commits in future snapshots
                // if data store did not change in between two snapshots.
                // We can optimize here by filtering commits based on contents of this.docTree.commits
            }

            this.onCommitHandler(dataStoreName, tree);
            return {
                id: commitName,
                date: new Date().toUTCString(),
                treeId: FileStorageVersionTreeIdUnused,
            };
        }

        public async writeOutFullSnapshot(tree: api.ITree) {
            const commits: { [key: string]: api.ITree } = {};

            // Sort keys. This does not guarantees that JSON.stringify() would produce sorted result,
            // but in practice it does.
            const commitsSorted: { [key: string]: api.ITree } = {};
            for (const key of Object.keys(commits).sort()) {
                commitsSorted[key] = commits[key];
            }

            const fileSnapshot: IFileSnapshot = { tree, commits: commitsSorted };
            this.onSnapshotHandler(fileSnapshot);
        }

        public sortTree(tree: api.ITree) {
            tree.entries.sort((a, b) => a.path.localeCompare(b.path));
            tree.entries.map((entry) => {
                if (entry.type === api.TreeEntry.Tree) {
                    this.sortTree(entry.value);
                }
            });
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

            assert(Object.keys(snapshotTree.commits).length === 0,
                0x095 /* "Leftover distinct commits after building tree!" */);
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
