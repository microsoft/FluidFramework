/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachmentTreeEntry, BlobTreeEntry, CommitTreeEntry, TreeTreeEntry } from "@fluidframework/protocol-base";
import {
    ITree,
    TreeEntry,
    ITreeEntry,
} from "@fluidframework/protocol-definitions";

export const gcBlobKey = "gc";
// A list of runtime blob paths whose contents should be normalized.
const runtimeBlobsToNormalize = [ gcBlobKey ];

export interface ISnapshotNormalizerConfig {
    // The paths of blobs whose contents should be normalized.
    blobsToNormalize?: string[];
}

/**
 * Function that deep sorts an array. It handles cases where array elements are objects or arrays.
 * @returns the sorted array.
 */
function getDeepSortedArray(array: any[]): any[] {
    const sortedArray: any[] = [];
    // Sort arrays and objects, if any, in the array.
    for (const element of array) {
        if (Array.isArray(element)) {
            sortedArray.push(getDeepSortedArray(element));
        } else if (element instanceof Object) {
            sortedArray.push(getDeepSortedObject(element));
        } else {
            sortedArray.push(element);
        }
    }

    // Now that all the arrays and objects in this array's elements have been sorted, sort it by comparing each
    // element's stringified version.
    const sortFn = (elem1: any, elem2: any) => {
        const serializedElem1 = JSON.stringify(elem1);
        const serializedElem2 = JSON.stringify(elem2);
        return serializedElem1.localeCompare(serializedElem2);
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return sortedArray.sort(sortFn);
}

/**
 * Function that deep sorts an object. It handles cases where object properties are arrays or objects.
 * @returns the sorted object.
 */
function getDeepSortedObject(obj: any): any {
    const sortedObj: any = {};
    // Sort the object keys first. Then sort arrays and objects, if any, in the object.
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
        const value = obj[key];
        if (Array.isArray(value)) {
            sortedObj[key] = getDeepSortedArray(value);
        } else if (value instanceof Object) {
            sortedObj[key] = getDeepSortedObject(value);
        } else {
            sortedObj[key] = value;
        }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return sortedObj;
}

/**
 * Function that normalizes a blob's content. If the content is an object or an array, deep sorts them.
 * Special handling for certain runtime blobs, such as the "gc" blob.
 * @returns the normalized blob content.
 */
function getNormalizedBlobContent(blobContent: string, blobName: string): string {
    let content = blobContent;
    if (blobName === gcBlobKey) {
        // GC blobs may contain "unrefTimestamp" - The time the corresponding object became unreferenced. This is the
        // timestamp of the last op processed and can differ between clients depending on when GC was run. It will be
        // undefined if no ops were processed before running GC. So, remove it for the purposes of comparing snapshots.
        const gcDetails = JSON.parse(content);
        delete gcDetails.unrefTimestamp;
        content = JSON.stringify(gcDetails);
    }

    // Deep sort the content if it's parseable.
    try {
        let contentObj = JSON.parse(content);
        if (Array.isArray(contentObj)) {
            contentObj = getDeepSortedArray(contentObj);
        } else if (contentObj instanceof Object) {
            contentObj = getDeepSortedObject(contentObj);
        }
        content = JSON.stringify(contentObj);
    } catch {}
    return content;
}

/**
 * Helper function that normalizes the given snapshot tree. It sorts objects and arrays in the snapshot. It also
 * normalizes certain blob contents for which the order of content does not matter. For example, garbage collection
 * blobs contains objects / arrays whose element order do not matter.
 * @param snapshot - The snapshot tree to normalize.
 * @param config - Configs to use when normalizing snapshot. For example, it can contain paths of blobs whose contents
 * should be normalized as well.
 * @returns a copy of the normalized snapshot tree.
 */
export function getNormalizedSnapshot(snapshot: ITree, config?: ISnapshotNormalizerConfig): ITree {
    // Merge blobs to normalize in the config with runtime blobs to normalize. The contents of these blobs will be
    // parsed and deep sorted.
    const blobsToNormalize = [ ...runtimeBlobsToNormalize, ...config?.blobsToNormalize ?? [] ];
    const normalizedEntries: ITreeEntry[] = [];

    for (const entry of snapshot.entries) {
        switch (entry.type) {
            case TreeEntry.Blob: {
                let contents = entry.value.contents;
                // If this blob has to be normalized, parse and sort the blob contents first.
                if (blobsToNormalize.includes(entry.path)) {
                    contents = getNormalizedBlobContent(contents, entry.path);
                }
                normalizedEntries.push(new BlobTreeEntry(entry.path, contents));
                break;
            }
            case TreeEntry.Tree: {
                normalizedEntries.push(new TreeTreeEntry(entry.path, getNormalizedSnapshot(entry.value, config)));
                break;
            }
            case TreeEntry.Attachment: {
                normalizedEntries.push(new AttachmentTreeEntry(entry.path, (entry.value).id));
                break;
            }
            case TreeEntry.Commit:
                normalizedEntries.push(new CommitTreeEntry(entry.path, entry.value));
                break;
            default:
                throw new Error("Unknown entry type");
        }
    }

    // Sory the tree entries based on their path.
    normalizedEntries.sort((a, b) => a.path.localeCompare(b.path));

    return {
        entries: normalizedEntries,
        id: snapshot.id,
    };
}
