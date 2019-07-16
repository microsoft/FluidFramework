/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import { IFileSnapshot  } from "@prague/replay-socket-storage";
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
export class FileDocumentStorageService implements api.IDocumentStorageService  {

    private versionName?: string;
    private latestTree: api.ISnapshotTree | null = null;

    private readonly commits: {[key: string]: api.ITree} = {};
    private readonly blobs = new Map<string, string>();

    constructor(private readonly path: string) {}

    public get repositoryUrl(): string {
        throw new Error("Not implemented.");
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
            if (!version || this.latestTree) {
                return this.latestTree;
            }
            rootTree = true;
            filename = `${this.path}/${this.versionName}/tree.json`;
        } else {
            filename = version.id;
        }

        if (!fs.existsSync(filename)) {
            console.error(`Can't find file ${filename}`);
            return null;
        }
        const data = fs.readFileSync(filename);
        const tree = JSON.parse(data.toString("utf-8"));
        if (rootTree) {
            this.latestTree = tree;
        }
        return tree;
    }

    /**
     * Gets the path of the snapshot tree to be read.
     * @param versionId - version ID.
     * @param count - Number of versions to be returned.
     */
    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
        if (versionId === FileStorageDocumentName || versionId === this.versionName) {
            // if we started with some snapshot and already loaded it, OR we already saved some snapshot,
            // then we have a tree! Return it.
            // Otherwise we started with ops - return empty set.
            if (this.latestTree) {
                return [{id: "latest", treeId: FileStorageVersionTreeId}];
            }
            // If we have no tree, then we started with no snapshot, and did not produce one yet.
            assert(versionId === FileStorageDocumentName);
        } else if (this.commits[versionId] !== undefined) {
            // PrefetchDocumentStorageService likes to prefetch everything!
            // Skip, as Container does not really need it.
            throw new Error("Not supporting commit loading");
        } else if (this.versionName === undefined) {
            // Some commit is requested for the first time. That can only mean - we are loading from snapshot.
            assert(!this.latestTree);
            const fileName = `${this.path}/${versionId}/tree.json`;
            if (fs.existsSync(fileName)) {
                this.versionName = versionId;
                return [{id: "latest", treeId: FileStorageVersionTreeId}];
            }
            console.error(`Unknown version: ${versionId}`);
        } else {
            // We loaded from shapshot - search for date there.
            assert(this.latestTree);
            const fileName = `${this.path}/${this.versionName}/${versionId}.json`;
            if (fs.existsSync(fileName)) {
                // Ideally we return something that satisfies that rule:
                // GetVersions(versionId, 1).id === versionId
                // But it does not matter as these ids do not persist
                return [{
                    id: fileName,
                    treeId: FileStorageVersionTreeId,
                }];
            }
            console.error(`Can't find ${fileName} version!"`);
        }
        return [];
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

        // Prefetcher reads all the blobs (after first snapshot is created).
        // Throw exception, as it should not matter.
        const blob = this.blobs.get(sha);
        if (blob === undefined) {
            throw new Error(`Can't find blob ${sha}`);
        }
        return blob;
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        return Promise.reject("Should never get here");
    }

    public async write(
        tree: api.ITree,
        parents: string[],
        message: string,
        ref: string,
    ): Promise<api.IVersion> {
            const messages = message.split(";");
            let outDirName: string = "output";
            let lastOp: string = "";

            // Note: part of the string is generated by playMessagesFromFileStorage()
            messages.forEach((singleMessage) => {
                const index = singleMessage.indexOf(":");
                const key = index > 0 ? singleMessage.substr(0, index) : "";
                const value = index > 0 ? singleMessage.substr(index + 1) : "";
                if (key === "OutputDirectoryName") {
                    outDirName = value ? value : "output";
                } else if (key === "OP") {
                    lastOp = value;
                }
            });

            let componentName = ref ? ref : "container";
            // tslint:disable-next-line: strict-boolean-expressions
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
            const commit: api.IVersion = {
                id: commitName,
                treeId: FileStorageVersionTreeIdUnused,
            };

            fs.mkdirSync(outDirName, { recursive: true });

            if (ref) {
                this.commits[commitName] = tree;
            } else {
                // Rebuild latest tree - runtime will ask for it when generating next snapshot to write out
                // non-changed commits for components
                await this.writeOutFullSnapshot(tree, outDirName);

                // Prep for the future - refresh latest tree, as it's requests on next snapshot generation.
                // Do not care about blobs (at least for now), as blobs are not written out (need follow up)
                const flattened = flatten(tree.entries, this.blobs);
                this.latestTree = buildHierarchy(flattened);

                // Do not reset this.commits - runtime will reference same commits in future snapshots
                // if component did not change in between two snapshots.
                // We can optimize here by filtering commits based on contents of this.latestTree.commits
            }

            console.log(`Writing snapshot for ${componentName} after OP number ${lastOp}`);
            componentName = componentName.replace("/", "_");
            fs.writeFileSync(
                `${outDirName}/${componentName}.json`,
                JSON.stringify(tree, undefined, 2),
                {encoding: "utf-8"});
            return commit;
    }

    public uploadSummary(commit: api.ISummaryTree): Promise<api.ISummaryHandle> {
        return Promise.reject("Not implemented.");
    }

    public downloadSummary(handle: api.ISummaryHandle): Promise<api.ISummaryTree> {
        return Promise.reject("Not implemented.");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        return Promise.reject("Not implemented.");
    }

    public getRawUrl(sha: string): string {
        throw new Error("Not implemented.");
    }

    private async writeOutFullSnapshot(tree: api.ITree, outDirName: string) {
        for (const entry of tree.entries) {
            if (entry.type === api.TreeEntry[api.TreeEntry.Commit]) {
                const commitId = entry.value as string;
                let commit = this.commits[commitId];
                if (commit === undefined) {
                    // Read from disk any commits that were referenced in original snapshot
                    const version = await this.getVersions(commitId, 1);
                    if (version.length > 0) {
                        const commitTree = await this.getSnapshotTree(version[0]);
                        if (commitTree) {
                            commit = this.commits[commitId] = await this.buildTree(commitTree);
                            this.commits[commitId] = commit;
                        }
                    }
                    if (commit === undefined) {
                        console.error(`Can't resolve commit ${commitId}`);
                    }
                }
            }
        }

        const fileSnapshot: IFileSnapshot = {tree, commits: this.commits};
        fs.writeFileSync(
            `${outDirName}/snapshot.json`,
            JSON.stringify(fileSnapshot, undefined, 2),
            { encoding: "utf-8" });
    }

    private async buildTree(snapshotTree: api.ISnapshotTree): Promise<api.ITree> {
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
}
