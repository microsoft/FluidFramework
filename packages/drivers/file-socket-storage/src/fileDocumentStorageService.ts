/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/protocol-definitions";
import { IFileSnapshot, ReadDocumentStorageServiceBase } from "@prague/replay-socket-storage";
import { buildHierarchy, flatten } from "@prague/utils";
import * as assert from "assert";
import * as fs from "fs";

// This ID is used by replay tool as Document Id.
// We leverage it to figure out when container is asking for root document tree.
export const FileStorageDocumentName = "FileStorageDocId"; // some unique document name

// Tree ID use to communicate between getVersions() & getSnapshotTree() that IVersion is ours.
const FileStorageVersionTreeId = "FileStorageTreeId";

// this ID should not show up anywhere, as it's internal only ID that no public API should accept.
const FileStorageVersionTreeIdUnused = "baad";

/**
 * Document storage service for the file driver.
 */
export class PragueDumpReader extends ReadDocumentStorageServiceBase implements api.IDocumentStorageService {
    protected docTree: api.ISnapshotTree | null = null;

    constructor(private readonly path: string, private readonly versionName?: string) {
        super();
    }

    /**
     * Read the file and returns the snapshot tree.
     * @param version - The version contains the path of the file which contains the snapshot tree.
     */
    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        assert(version !== null);
        assert(!version || version.treeId === FileStorageVersionTreeId);

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
                return [{id: "latest", treeId: FileStorageVersionTreeId}];
            }
            // Started with ops - return empty set.
            return [];
        } else if (this.versionName !== undefined) {
            // We loaded from snapshot - search for commit there.
            assert(this.docTree);
            return [{
                id: versionId,
                treeId: FileStorageVersionTreeId,
            }];
        }
        throw new Error(`Unknown version: ${versionId}`);
    }

    /**
     * Finds if a file exists and returns the contents of the blob file.
     * @param sha - Name of the file to be read for blobs.
     */
    public async read(sha: string): Promise<string> {
        if (this.versionName !== undefined) {
            const fileName = `${this.path}/${this.versionName}/${sha}`;
            if (fs.existsSync(fileName)) {
                const data = fs.readFileSync(fileName).toString();
                return data;
            }
        }
        throw new Error(`Can't find blob ${sha}`);
    }
}

export interface ISnapshotWriterStorage extends api.IDocumentStorageService {
    onCommitHandler(componentName: string, tree: api.ITree): void;
    onSnapshotHandler(snapshot: IFileSnapshot): void;
}

export type ReaderConstructor = new (...args: any[]) => api.IDocumentStorageService;
// tslint:disable-next-line:max-func-body-length
export function FileSnapshotWriterClassFactory<TBase extends ReaderConstructor>(Base: TBase) {
    return class extends Base implements ISnapshotWriterStorage {
        // Note: if variable name has same name as in base class, it overrides it!
        public readonly blobsWriter = new Map<string, string>();
        public readonly commitsWriter: {[key: string]: api.ITree} = {};
        public latestWriterTree?: api.ISnapshotTree;
        public savedSnapshot = false;

        public onCommitHandler(componentName: string, tree: api.ITree): void {
            throw new Error("onCommitHandler is not setup! Please provide your handler!");
        }
        public onSnapshotHandler(snapshot: IFileSnapshot): void {
            throw new Error("onSnapshotHandler is not setup! Please provide your handler!");
        }

        public async read(sha: string): Promise<string> {
            const blob = this.blobsWriter.get(sha);
            if (blob !== undefined) {
                return blob;
            }
            return super.read(sha);
        }

        public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
            // If we already saved document, that means we are getting here because of snapshot generation.
            // Not returning tree ensures that ContainerRuntime.snapshot() would regenerate subtrees for
            // each unchanged component.
            // If we want to change that, we would need to capture docId on first call and return this.latestWriterTree
            // when latest is requested.
            if (this.savedSnapshot) {
                return [];
            }

            if (this.commitsWriter[versionId] !== undefined) {
                // PrefetchDocumentStorageService likes to prefetch everything!
                // Skip, as Container does not really need it.
                throw new Error("Not supporting commit loading");
            }
            return super.getVersions(versionId, count);
        }

        public async write(
                tree: api.ITree,
                parents: string[],
                message: string,
                ref: string): Promise<api.IVersion> {
            let componentName = ref ? ref : "container";
            // tslint:disable-next-line:strict-boolean-expressions
            if (tree && tree.entries) {
                tree.entries.forEach((entry) => {
                    if (entry.path === ".component" && entry.type === api.TreeEntry[api.TreeEntry.Blob]) {
                        const blob: api.IBlob = entry.value as api.IBlob;
                        const content = blob.contents.split(":");
                        if (content[0] === `{"pkg"`) {
                            componentName = content[1].substring(1, content[1].lastIndexOf(`"`));
                        }
                    }
                });
            }

            const commitName = `commit_${componentName}`;

            // Sort entries for easier diffing
            this.sortCommit(tree);

            // Remove tree IDs for easier comparison of snapshots
            delete tree.id;
            removeNullTreIds(tree);

            if (ref) {
                this.commitsWriter[commitName] = tree;
            } else {
                this.savedSnapshot = true;

                // Rebuild latest tree - runtime will ask for it when generating next snapshot to write out
                // non-changed commits for components
                await this.writeOutFullSnapshot(tree);

                // Prep for the future - refresh latest tree, as it's requests on next snapshot generation.
                // Do not care about blobs (at least for now), as blobs are not written out (need follow up)
                const flattened = flatten(tree.entries, this.blobsWriter);
                this.latestWriterTree = buildHierarchy(flattened);

                // Do not reset this.commitsWriter - runtime will reference same commits in future snapshots
                // if component did not change in between two snapshots.
                // We can optimize here by filtering commits based on contents of this.docTree.commits
            }

            this.onCommitHandler(componentName, tree);
            return {
                id: commitName,
                treeId: FileStorageVersionTreeIdUnused,
            };
        }

        public async writeOutFullSnapshot(tree: api.ITree) {
            for (const entry of tree.entries) {
                if (entry.type === api.TreeEntry[api.TreeEntry.Commit]) {
                    const commitId = entry.value as string;
                    let commit = this.commitsWriter[commitId];
                    if (commit === undefined) {
                        // Read from disk any commits that were referenced in original snapshot
                        const version = await this.getVersions(commitId, 1);
                        if (version.length > 0) {
                            const commitTree = await this.getSnapshotTree(version[0]);
                            if (commitTree) {
                                commit = await this.buildTree(commitTree);
                                this.sortCommit(commit);
                                this.commitsWriter[commitId] = commit;
                            }
                        }
                        if (commit === undefined) {
                            console.error(`Can't resolve commit ${commitId}`);
                        }
                    }
                }
            }

            // Sort keys. This does not guarantees that JSON.stringify() would produce sorted result,
            // but in practice it does.
            const commits: {[key: string]: api.ITree} = {};
            for (const key of Object.keys(this.commitsWriter).sort()) {
                commits[key] = this.commitsWriter[key];
            }

            const fileSnapshot: IFileSnapshot = {tree, commits};
            this.onSnapshotHandler(fileSnapshot);
        }

        public sortCommit(tree: api.ITree) {
            tree.entries.sort((a, b) => {
                return a.path.localeCompare(b.path);
            });
        }

        public async buildTree(snapshotTree: api.ISnapshotTree): Promise<api.ITree> {
            const tree: api.ITree = {id: snapshotTree.id, entries: []};

            for (const subTreeId of Object.keys(snapshotTree.trees)) {
                const subTree = await this.buildTree(snapshotTree.trees[subTreeId]);
                tree.entries.push({
                    mode: api.FileMode.Directory,
                    path: subTreeId,
                    type: api.TreeEntry[api.TreeEntry.Tree],
                    value: subTree,
                });
            }

            for (const blobName of Object.keys(snapshotTree.blobs)) {
                const contents = await this.read(snapshotTree.blobs[blobName]);
                const blob: api.IBlob = {
                    contents: Buffer.from(contents, "base64").toString("utf-8"), // decode for readability
                    encoding: "utf-8",
                };
                tree.entries.push({
                    mode: api.FileMode.File,
                    path: blobName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: blob,
                });
            }

            assert(Object.keys(snapshotTree.commits).length === 0);
            return tree;
        }
    };
}

function removeNullTreIds(tree: api.ITree) {
    for (const node of tree.entries) {
        if (node.type === api.TreeEntry[api.TreeEntry.Tree]) {
            removeNullTreIds(node.value as api.ITree);
        }
    }
    assert(tree.id === undefined || tree.id === null);
    delete tree.id;
}

export const PragueDumpReaderFileSnapshotWriter = FileSnapshotWriterClassFactory(PragueDumpReader);
