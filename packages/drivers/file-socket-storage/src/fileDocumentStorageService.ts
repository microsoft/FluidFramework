/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as api from "@prague/container-definitions";
import * as fs from "fs";
import * as util from "util";

/**
 * Document storage service for the file driver.
 */
export class FileDocumentStorageService implements api.IDocumentStorageService  {

    private versionName: string;
    constructor(private readonly path: string) {}

    public get repositoryUrl(): string {
        throw new Error("Not implemented.");
    }

    /**
     * Read the file and returns the snapshot tree.
     * @param version - The version contains the path of the file which contains the snapshot tree.
     */
    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        if (version === null || version === undefined) {
            return null;
        }
        const fileName = `${this.path}/${version.id}.json`;
        let snapshotTree: api.ISnapshotTree = null;
        if (fs.existsSync(fileName)) {
            const data = fs.readFileSync(fileName);
            snapshotTree = JSON.parse(data.toString("utf-8"));
        }
        return snapshotTree;
    }

    /**
     * Gets the path of the snapshot tree to be read.
     * @param sha - Name of the file to be read for component snapshot tree or name of the directory to be
     *              read for container snapshot tree.
     * @param count - Number of versions to be returned.
     */
    public async getVersions(sha: string, count: number): Promise<api.IVersion[]> {
        const versions: api.IVersion[] = [];
        let version: api.IVersion;
        if (fs.existsSync(`${this.path}/${sha}`)) {
            version = {
                id: `${sha}/tree`,
                treeId: `${sha}/tree`,
            };
            this.versionName = sha;
        } else if (fs.existsSync(`${this.path}/${this.versionName}/${sha}.json`)) {
            version = {
                id: `${this.versionName}/${sha}`,
                treeId: `${this.versionName}/${sha}`,
            };
        } else {
            return [];
        }
        versions.push(version);
        return versions;
    }

    /**
     * Finds if a file exists and returns the contents of the blob file.
     * @param sha - Name of the file to be read for blobs.
     */
    public async read(sha: string): Promise<string> {
        let fileName: string = "null";
        const files: string[] = fs.readdirSync(`${this.path}/${this.versionName}/decoded`);
        for (const file of files) {
            if (file.startsWith(sha)) {
                fileName = file;
            }
        }
        fileName = `${this.path}/${this.versionName}/decoded/${fileName}`;
        if (fs.existsSync(fileName)) {
            const data = fs.readFileSync(fileName);
            return data.toString("base64");
        }
        return Buffer.from("[]").toString("base64");
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        const fileName = `${this.path}/${version.id}.json`;
        let snapshotTree: api.ISnapshotTree = null;
        if (fs.existsSync(fileName)) {
            const data = fs.readFileSync(fileName);
            snapshotTree = JSON.parse(data.toString("utf-8"));
        }
        const content = await this.read(snapshotTree.blobs[path]);
        return content;
    }

    public async write(
        tree: api.ITree,
        parents: string[],
        message: string,
        ref: string,
    ): Promise<api.IVersion | null> {
            const messages = message.split(";");
            let outDirName: string;
            let lastOp: string;
            messages.forEach((singleMessage) => {
                const key = singleMessage.split(":");
                if (key.length > 0 && key[0] === "OutputDirectoryName") {
                    outDirName =  key[1] ? key[1] : "output";
                } else if (key.length > 0 && key[0] === "OP") {
                    lastOp = key[1];
                }
            });

            const writeFile = util.promisify(fs.writeFile);
            const mkdir = util.promisify(fs.mkdir);
            let componentName = "container";
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

            const commit: api.IVersion = {
                id: `${componentName}`,
                treeId: "",
            };

            await mkdir(`${outDirName}/${componentName}`, { recursive: true });
            await writeFile(
                `${outDirName}/${componentName}/Snapshot_last_op_${lastOp}.json`,
                JSON.stringify(tree, undefined, 2));
            console.log(`Writing snapshot for ${componentName} after OP number ${lastOp}`);
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
}
