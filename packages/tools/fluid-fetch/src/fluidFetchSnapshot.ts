/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as util from "util";
import { fromBase64ToUtf8 } from "@fluidframework/common-utils";
import {
    IDocumentService,
    IDocumentStorageService,
} from "@microsoft/fluid-driver-definitions";
import {
    ISnapshotTree,
    IVersion,
} from "@microsoft/fluid-protocol-definitions";
import { formatNumber } from "./fluidAnalyzeMessages";
import {
    dumpSnapshotStats,
    dumpSnapshotTrees,
    dumpSnapshotVersions,
    paramNumSnapshotVersions,
    paramSnapshotVersionIndex,
} from "./fluidFetchArgs";
import { latestVersionsId } from "./fluidFetchInit";

interface ISnapshotInfo {
    blobCountNew: number;
    blobCount: number;
    size: number;
    sizeNew: number;
}

interface IBlob {
    path: string;
    blobId: string;
    blob: Promise<string | undefined>;
    isTree: boolean;
    reused: boolean;
    canBeReused: boolean;
}

const blobCache = new Map<string, Promise<string>>();
let blobCachePrevious = new Map<string, Promise<string>>();
let blobCacheCurrent = new Map<string, Promise<string>>();

function fetchBlobs(prefix: string, tree: ISnapshotTree, storage: IDocumentStorageService) {
    const result: IBlob[] = [];
    for (const item of Object.keys(tree.blobs)) {
        const path = `${prefix}${item}`;
        const blobId = tree.blobs[item];
        if (blobId !== null) {
            let reused = true;
            const canBeReused = false;
            let blob = blobCachePrevious.get(blobId);
            if (!blob) {
                reused = false;
                blob = blobCache.get(blobId);
                if (blob === undefined) {
                    blob = storage.read(blobId);
                    blobCache.set(blobId, blob);
                }
            }
            blobCacheCurrent.set(blobId, blob);
            result.push({ path, blobId, blob, isTree: false, reused, canBeReused });
        }
    }
    return result;
}

async function fetchBlobsFromSnapshotTree(
    storage: IDocumentStorageService,
    tree: ISnapshotTree,
    prefix: string = "/",
    commit = true) {
    assert(Object.keys(tree.commits).length === 0 || (prefix === "/"));
    if (commit && dumpSnapshotTrees) {
        console.log(tree);
    }

    if (prefix === "/") {
        blobCachePrevious = blobCacheCurrent;
        blobCacheCurrent = new Map<string, Promise<string>>();
    }

    let result = fetchBlobs(prefix, tree, storage);

    if (commit) {
        assert(tree.id);
        const blobId = prefix === "/" ? "tree" : tree.id === null ? "no id" : tree.id;
        const content = JSON.stringify(tree, undefined, 2);
        const path = `${prefix}tree.json`;
        result.push({ path, blobId, blob: Promise.resolve(content), isTree: true, reused: false, canBeReused: false });
    }

    for (const component of Object.keys(tree.commits)) {
        const componentVersions = await storage.getVersions(tree.commits[component], 1);
        if (componentVersions.length !== 1) {
            console.error(`ERROR: Unable to get versions for ${component}`);
            continue;
        }
        const componentSnapShotTree = await reportErrors(
            `getSnapshotTree ${componentVersions[0].id}`,
            storage.getSnapshotTree(componentVersions[0]));
        if (componentSnapShotTree === null) {
            // eslint-disable-next-line max-len
            console.error(`No component tree for component = ${component}, path = ${prefix}, version = ${componentVersions[0].id}`);
            continue;
        }
        assert(componentSnapShotTree.id === tree.commits[component]);
        assert(componentSnapShotTree.id === componentVersions[0].id);
        const componentBlobs = await fetchBlobsFromSnapshotTree(
            storage,
            componentSnapShotTree,
            `${prefix}[${component}]/`);
        result = result.concat(componentBlobs);
    }

    for (const subtreeId of Object.keys(tree.trees)) {
        const subtree = tree.trees[subtreeId];
        assert(Object.keys(subtree.commits).length === 0);
        const componentBlobs = await fetchBlobsFromSnapshotTree(
            storage,
            subtree,
            `${prefix}${subtreeId}/`,
            false);
        result = result.concat(componentBlobs);
    }
    return result;
}

async function dumpSnapshotTreeVerbose(name: string, blobs: IBlob[]) {
    let size = 0;
    const sorted = blobs.sort((a, b) => a.path.localeCompare(b.path));

    let nameLength = 10;
    for (const item of sorted) {
        nameLength = Math.max(nameLength, item.path.length);
    }

    console.log("");
    console.log(`${"Blob Path".padEnd(nameLength)} | Reused |      Bytes`);
    console.log("-".repeat(nameLength + 26));
    for (const item of sorted) {
        const blob = await item.blob;
        if (blob === undefined) {
            continue;
        }
        // eslint-disable-next-line max-len
        console.log(`${item.path.padEnd(nameLength)} |    ${item.reused ? "X" : " "}   | ${formatNumber(blob.length).padStart(10)}`);
        size += blob.length;
    }

    console.log("-".repeat(nameLength + 26));
    console.log(`${"Total snapshot size".padEnd(nameLength)} |        | ${formatNumber(size).padStart(10)}`);
}

async function dumpSnapshotTree(name: string, blobs: IBlob[]): Promise<ISnapshotInfo> {
    let size = 0;
    let sizeNew = 0;
    let blobCountNew = 0;
    const sorted = blobs.sort((a, b) => a.path.localeCompare(b.path));

    for (const item of sorted) {
        const blob = await item.blob;
        if (blob === undefined) {
            continue;
        }
        if (!item.reused) {
            sizeNew += blob.length;
            blobCountNew++;
        }
        size += blob.length;
    }

    return { blobCountNew, blobCount: sorted.length, size, sizeNew };
}

async function saveSnapshot(name: string, blobs: IBlob[], saveDir: string) {
    const outDir = `${saveDir}/${name}/`;
    const mkdir = util.promisify(fs.mkdir);

    await mkdir(`${outDir}/decoded`, { recursive: true });
    await Promise.all(blobs.map(async (blob) => {
        const data = await blob.blob;
        if (data === undefined) {
            console.error(`ERROR: Unable to get data for blob ${blob.blobId}`);
            return;
        }

        if (!blob.isTree) {
            fs.writeFileSync(`${outDir}/${blob.blobId}`, data);
            const decoded = fromBase64ToUtf8(data);
            try {
                const object = JSON.parse(decoded);
                fs.writeFileSync(`${outDir}/decoded/${blob.blobId}.json`, JSON.stringify(object, undefined, 2));
            } catch (e) {
                fs.writeFileSync(`${outDir}/decoded/${blob.blobId}.txt`, decoded);
            }
        } else {
            // Write out same data for tree
            fs.writeFileSync(`${outDir}/${blob.blobId}.json`, data);
            fs.writeFileSync(`${outDir}/decoded/${blob.blobId}.json`, data);
        }
    }));
}

async function fetchBlobsFromVersion(storage: IDocumentStorageService, version: IVersion) {
    const tree = await reportErrors(`getSnapshotTree ${version.id}`, storage.getSnapshotTree(version));
    if (!tree) {
        return Promise.reject(new Error("Failed to load snapshot tree"));
    }
    return fetchBlobsFromSnapshotTree(storage, tree);
}

async function reportErrors<T>(message: string, res: Promise<T>) {
    try {
        return await res;
    } catch (error) {
        console.error(`Error calling ${message}`);
        throw error;
    }
}

export async function fluidFetchSnapshot(documentService?: IDocumentService, saveDir?: string) {
    if (!dumpSnapshotStats && !dumpSnapshotTrees && !dumpSnapshotVersions && saveDir === undefined) {
        return;
    }

    // --local mode - do not connect to storage.
    // For now, bail out early.
    // In future, separate download from analyzes parts and allow offline analyzes
    if (!documentService) {
        return;
    }

    console.log("\n");

    const storage = await documentService.connectToStorage();
    let version: IVersion | undefined;
    const versions = await reportErrors(
        `getVersions ${latestVersionsId}`,
        storage.getVersions(latestVersionsId, paramNumSnapshotVersions));
    if (dumpSnapshotVersions) {
        console.log("Snapshot versions");
        console.log(versions);
    }

    let blobsToDump: IBlob[] | undefined;
    if (paramSnapshotVersionIndex !== undefined) {
        version = versions[paramSnapshotVersionIndex];
        if (version === undefined) {
            console.log(`There are only ${versions.length} snapshots, --snapshotVersionIndex is too large`);
            return;
        }
        if (saveDir !== undefined) {
            blobsToDump = await fetchBlobsFromVersion(storage, version);
            const name = version.id;
            console.log(`Saving snapshot ${name}`);
            await saveSnapshot(name, blobsToDump, saveDir);
        }
    } else {
        version = versions[0];
        if (saveDir !== undefined && versions.length > 0) {
            console.log("  Name          |                  Date |       Size |   New Size |  Blobs | New Blobs");
            console.log("-".repeat(86));

            // Go in reverse order, to correctly calculate blob reuse - from oldest to newest snapshots
            for (let i = versions.length - 1; i >= 0; i--) {
                const v = versions[i];
                const blobs = await fetchBlobsFromVersion(storage, v);
                blobsToDump = blobs;
                const name = `${i}-${v.id}`;
                const res = await dumpSnapshotTree(name, blobs);

                let date = "";
                if (v.date) {
                    try {
                        date = new Date(v.date).toLocaleString();
                    } catch (e) {
                        date = v.date.replace("T", " ");
                        const index = date.lastIndexOf(".");
                        if (index > 0) {
                            date = `${date.substr(0, index)} Z`;
                        }
                    }
                }
                date = date.padStart(21);
                const size = formatNumber(res.size).padStart(10);
                const sizeNew = formatNumber(res.sizeNew).padStart(10);
                const blobCount = formatNumber(res.blobCount).padStart(6);
                const blobCountNew = formatNumber(res.blobCountNew).padStart(9);

                console.log(`${name.padEnd(15)} | ${date} | ${size} | ${sizeNew} | ${blobCount} | ${blobCountNew}`);

                await saveSnapshot(name, blobs, saveDir);
            }
        }
    }

    if (dumpSnapshotStats || dumpSnapshotTrees) {
        if (version === undefined) {
            console.log("No snapshot tree");
        } else {
            if (blobsToDump === undefined) {
                blobsToDump = await fetchBlobsFromVersion(storage, version);
            }
            console.log(`\n\nSnapshot version ${version.id}`);
            await dumpSnapshotTreeVerbose(version.id, blobsToDump);
        }
    }
}
