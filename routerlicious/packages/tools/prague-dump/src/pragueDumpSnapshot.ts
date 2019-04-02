import {
    IDocumentService,
    IDocumentStorageService,
    ISnapshotTree,
    ITokenProvider,
} from "@prague/container-definitions";
import {
    dumpSnapshotBlobs,
    dumpSnapshotSha,
    dumpSnapshotStats,
    dumpSnapshotTrees,
    dumpTotalStats,
} from "./pragueDumpArgs";
async function fetchSnapshotTreeBlobs(storage: IDocumentStorageService, tree: ISnapshotTree, prefix: string = "") {
    if (dumpSnapshotTrees) {
        console.log(tree);
    }

    let result = new Array<{ path: string, sha: string, blob: Promise<string> }>();
    const itemPrefix = prefix !== "" ? prefix : "!CONTAINER!/";
    for (const item of Object.keys(tree.blobs)) {
        const path = `${itemPrefix}${item}`;
        const sha = tree.blobs[item];
        const blob = storage.read(sha);
        result.push({ path, sha, blob });
    }
    for (const component of Object.keys(tree.commits)) {
        const componentVersions = await storage.getVersions(tree.commits[component], 1);
        if (componentVersions.length !== 1) {
            console.error(`ERROR: Unable to get versions for ${component}`);
            continue;
        }
        const componentSnapShotTree = await storage.getSnapshotTree(componentVersions[0]);
        const componentBlobs = await fetchSnapshotTreeBlobs(storage, componentSnapShotTree, `${prefix}[${component}]/`);
        result = result.concat(componentBlobs);
    }

    for (const subtree of Object.keys(tree.trees)) {
        result = result.concat(await fetchSnapshotTreeBlobs(storage, tree.trees[subtree], `${prefix}${subtree}/`));
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

export async function pragueDumpSnapshot(
    documentService: IDocumentService,
    tokenProvider: ITokenProvider,
    tenantId: string,
    id: string) {
    if (dumpSnapshotStats || dumpSnapshotTrees || dumpSnapshotBlobs || dumpTotalStats) {
        const storage = await documentService.connectToStorage(tenantId, id, tokenProvider);
        const snapshotTree = await storage.getSnapshotTree();
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
