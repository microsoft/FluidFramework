/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IDocumentService,
    IDocumentStorageService,
    ISnapshotTree,
    IVersion,
} from "@prague/protocol-definitions";
import * as fs from "fs";
import * as util from "util";
import {
    dumpSnapshotBlobs,
    dumpSnapshotStats,
    dumpSnapshotTrees,
    dumpSnapshotVersions,
    dumpTotalStats,
    paramNumSnapshotVersions,
    paramSave,
    paramSnapshotVersionIndex,
} from "./pragueDumpArgs";

import { latestVersionsId } from "./pragueDumpInit";

async function fetchSnapshotTreeBlobs(
    storage: IDocumentStorageService,
    tree: ISnapshotTree,
    prefix: string = "",
    saveTreeDir?: string) {
    if (saveTreeDir === undefined && dumpSnapshotTrees) {
        console.log(tree);
    }

    let result: { path: string, blobId: string, blob: Promise<string | undefined> }[] = [];
    const itemPrefix = prefix !== "" ? prefix : "!CONTAINER!/";
    for (const item of Object.keys(tree.blobs)) {
        const path = `${itemPrefix}${item}`;
        const blobId = tree.blobs[item];
        if (blobId !== null) {
            const blob = storage.read(blobId);
            result.push({ path, blobId, blob });
        }
    }
    for (const component of Object.keys(tree.commits)) {
        const componentVersions = await storage.getVersions(tree.commits[component], 1);
        if (componentVersions.length !== 1) {
            console.error(`ERROR: Unable to get versions for ${component}`);
            continue;
        }
        const componentSnapShotTree = await storage.getSnapshotTree(componentVersions[0]);
        if (saveTreeDir !== undefined) {
            const writeFile = util.promisify(fs.writeFile);
            await writeFile(`${saveTreeDir}/${componentVersions[0].id}.json`,
                JSON.stringify(componentSnapShotTree, undefined, 2));
        }
        if (componentSnapShotTree) {
            const componentBlobs = await fetchSnapshotTreeBlobs(
                storage,
                componentSnapShotTree,
                `${prefix}[${component}]/`,
                saveTreeDir);
            result = result.concat(componentBlobs);
        }
    }

    for (const subtree of Object.keys(tree.trees)) {
        const componentBlobs = await fetchSnapshotTreeBlobs(
            storage, tree.trees[subtree],
            `${prefix}${subtree}/`,
            saveTreeDir);
        result = result.concat(componentBlobs);
    }
    return result;
}

async function dumpSnapshotTree(storage: IDocumentStorageService, tree: ISnapshotTree) {
    const blobs = await fetchSnapshotTreeBlobs(storage, tree);
    let size = 0;
    const sorted = blobs.sort((a, b) => a.path.localeCompare(b.path));

    if (dumpSnapshotStats || dumpSnapshotBlobs) {
        console.log(`${"Blob Path".padEnd(75)}| Bytes`);
        console.log("-".repeat(100));
    }
    for (const item of sorted) {
        try {
            const blob = await item.blob;
            if (blob === undefined) {
                continue;
            }
            if (dumpSnapshotStats || dumpSnapshotBlobs) {
                console.log(`${item.path.padEnd(75)}| ${blob.length}`);
            }
            if (dumpSnapshotBlobs) {
                const decoded = Buffer.from(blob, "base64").toString();
                try {
                    console.log(JSON.parse(decoded));
                } catch (e) {
                    console.log(decoded);
                }
                console.log("-".repeat(100));
            }
            size += blob.length;
        } catch (e) {
            console.log(`${item.path.padEnd(75)}: ERROR: ${e.message}`);
        }
    }
    return size;
}

async function saveSnapshot(storage: IDocumentStorageService, version: IVersion, index?: number) {
    const suffix = `${index !== undefined ? `${index}-` : ""}${version.id}`;
    console.log(`Saving snapshot ${suffix}`);
    const outDir = `${paramSave}/${suffix}/`;
    const snapshotTree = await storage.getSnapshotTree(version);
    if (!snapshotTree) {
        return Promise.reject(new Error("Failed to load snapshot tree"));
    }
    const mkdir = util.promisify(fs.mkdir);
    const writeFile = util.promisify(fs.writeFile);

    await mkdir(`${outDir}/decoded`, { recursive: true });
    await writeFile(`${outDir}/tree.json`, JSON.stringify(snapshotTree, undefined, 2));
    const blobs = await fetchSnapshotTreeBlobs(storage, snapshotTree, "", outDir);
    await Promise.all(blobs.map(async (blob) => {
        const data = await blob.blob;
        if (data === undefined) {
            console.error(`ERROR: Unable to get data for blob ${blob.blobId}`);
            return;
        }
        // tslint:disable-next-line:non-literal-fs-path
        await writeFile(`${outDir}/${blob.blobId}`, data);

        const decoded = Buffer.from(data, "base64").toString();
        try {
            const object = JSON.parse(decoded);
            await writeFile(`${outDir}/decoded/${blob.blobId}.json`, JSON.stringify(object, undefined, 2));
        } catch (e) {
            await writeFile(`${outDir}/decoded/${blob.blobId}.txt`, decoded);
        }
    }));
}

export async function pragueDumpSnapshot(documentService: IDocumentService) {

    const dumpTree = dumpSnapshotStats || dumpSnapshotTrees || dumpSnapshotBlobs || dumpTotalStats;
    if (dumpTree || dumpSnapshotVersions || paramSave !== undefined) {
        const storage = await documentService.connectToStorage();
        let version: IVersion | undefined;
        if (dumpSnapshotVersions || paramSnapshotVersionIndex !== undefined || paramSave !== undefined) {
            const versions = await storage.getVersions(latestVersionsId, paramNumSnapshotVersions);
            if (dumpSnapshotVersions) {
                console.log("Snapshot versions");
                console.log(versions);
            }
            if (paramSnapshotVersionIndex !== undefined) {
                version = versions[paramSnapshotVersionIndex];
                if (paramSave !== undefined) {
                    await saveSnapshot(storage, version);
                }
            } else if (paramSave !== undefined) {
                const batch: Promise<void>[] = [];
                let i = 0;
                for (const v of versions) {
                    batch.push(saveSnapshot(storage, v, i++));
                    if (batch.length === 10) {
                        // Only do 10 at a time concurrently to not spam the server
                        await Promise.all(batch);
                        batch.length = 0;
                    }
                }
                if (batch.length) {
                    await Promise.all(batch);
                }
            }
        }

        if (dumpTree) {
            if (version !== undefined) {
                console.log(`Loading snapshot version ${JSON.stringify(version)}`);
            }
            const snapshotTree = await storage.getSnapshotTree(version);
            if (snapshotTree) {
                const snapshotSize = await dumpSnapshotTree(storage, snapshotTree);
                if (dumpSnapshotStats) {
                    console.log("-".repeat(100));
                    // tslint:disable-next-line:max-line-length
                    console.log(`Total snapshot size                                                        | ${snapshotSize}`);
                } else if (dumpTotalStats) {
                    console.log(`Total snapshot size: ${snapshotSize}`);
                }
            } else {
                console.log("No snapshot tree");
            }
        }
    }
}
