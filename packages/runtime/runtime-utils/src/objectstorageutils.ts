/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree } from "@fluidframework/protocol-definitions";

export function getNormalizedObjectStoragePathParts(path: string) {
    let normalizePath = path;
    if (normalizePath.startsWith("/")) {
        normalizePath = normalizePath.substr(1);
    }
    if (normalizePath.endsWith("/")) {
        normalizePath = normalizePath.substr(0, normalizePath.length - 1);
    }
    if (normalizePath.length > 0) {
        return normalizePath.split("/");
    }
    return [];
}

export async function listBlobsAtTreePath(inputTree: ITree, path: string): Promise<string[]> {
    const pathParts = getNormalizedObjectStoragePathParts(path);
    let tree: ITree | undefined = inputTree;
    while (tree?.entries !== undefined && pathParts.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const part = pathParts.shift()!;
        const index = tree.entries.findIndex((value) => {
            if (value.type === "Tree" && value.path === part) {
                return true;
            } else {
                return false;
            }
        });
        if (index === -1) {
            tree = undefined;
        } else {
            const treeEntry = tree.entries[index];
            tree = treeEntry.value;
        }
    }
    if (tree?.entries === undefined || pathParts.length !== 0) {
        throw new Error("path does not exist");
    }
    return tree.entries.filter((e) => e.type === "Blob").map((e) => e.path);
}
