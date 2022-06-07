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

export async function listBlobsAtTreePath(inputTree: ITree | undefined, path: string): Promise<string[]> {
    const pathParts = getNormalizedObjectStoragePathParts(path);
    let tree: ITree | undefined = inputTree;
    while (tree?.entries !== undefined && pathParts.length > 0) {
        const part = pathParts.shift();
        const treeEntry = tree.entries.find((value) => {
            if (value.type === "Tree" && value.path === part) {
                return true;
            } else {
                return false;
            }
        });

        // this check is largely superfluous due to the same check being done
        // immediately above. the type system, however, is not aware of this.
        // so we must redundantly determine that the entry's type is "Tree"
        if (treeEntry?.type === "Tree") {
            tree = treeEntry.value;
        } else {
            tree = undefined;
        }
    }
    if (tree?.entries === undefined || pathParts.length !== 0) {
        throw new Error("path does not exist");
    }
    return tree.entries.filter((e) => e.type === "Blob").map((e) => e.path);
}
