import * as git from "@prague/gitresources";
import { FileMode, IBlob, ISnapshotTree, ITree, ITreeEntry, TreeEntry } from "@prague/runtime-definitions";
// tslint:disable-next-line:no-submodule-imports
import * as sha1 from "sha.js/sha1";

/**
 * Create Hash (Github hashes the string with blob and size)
 * @param file The contents of the file in a buffer
 */
export function gitHashFile(file: Buffer): string {
    const size = file.byteLength;
    const filePrefix = "blob " + size.toString() + String.fromCharCode(0);
    /* tslint:disable:no-unsafe-any */
    const engine = new sha1();
    return engine.update(filePrefix)
        .update(file)
        .digest("hex");
}

export function flatten(tree: ITreeEntry[], blobMap: Map<string, string>): git.ITree {
    const entries = flattenCore("", tree, blobMap);
    return {
        sha: null,
        tree: entries,
        url: null,
    };
}

function flattenCore(path: string, treeEntries: ITreeEntry[], blobMap: Map<string, string>): git.ITreeEntry[] {
    const entries = new Array<git.ITreeEntry>();
    for (const treeEntry of treeEntries) {
        const subPath = `${path}${treeEntry.path}`;

        if (treeEntry.type === TreeEntry[TreeEntry.Blob]) {
            const blob = treeEntry.value as IBlob;
            const buffer = Buffer.from(blob.contents, blob.encoding);
            const sha = gitHashFile(buffer);
            blobMap.set(sha, buffer.toString("base64"));

            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha,
                size: buffer.length,
                type: "blob",
                url: "",
            };
            entries.push(entry);
        } else {
            const t = treeEntry.value as ITree;
            const entry: git.ITreeEntry = {
                mode: FileMode[treeEntry.mode],
                path: subPath,
                sha: null,
                size: -1,
                type: "tree",
                url: "",
            };
            entries.push(entry);

            const subTreeEntries = flattenCore(subPath + "/", t.entries, blobMap);
            entries.push(...subTreeEntries);
        }
    }

    return entries;
}

export function buildHierarchy(flatTree: git.ITree): ISnapshotTree {
    const lookup: { [path: string]: ISnapshotTree } = {};
    const root: ISnapshotTree = { blobs: {}, commits: {}, trees: {} };
    lookup[""] = root;

    for (const entry of flatTree.tree) {
        const lastIndex = entry.path.lastIndexOf("/");
        const entryPathDir = entry.path.slice(0, Math.max(0, lastIndex));
        const entryPathBase = entry.path.slice(lastIndex  + 1);

        // The flat output is breadth-first so we can assume we see tree nodes prior to their contents
        const node = lookup[entryPathDir];

        // Add in either the blob or tree
        if (entry.type === "tree") {
            const newTree = { blobs: {}, commits: {}, trees: {} };
            node.trees[entryPathBase] = newTree;
            lookup[entry.path] = newTree;
        } else if (entry.type === "blob") {
            node.blobs[entryPathBase] = entry.sha;
        } else if (entry.type === "commit") {
            node.commits[entryPathBase] = entry.sha;
        }
    }

    return root;
}
