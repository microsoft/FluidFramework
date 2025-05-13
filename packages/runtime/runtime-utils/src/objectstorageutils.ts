/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITree } from "@fluidframework/driver-definitions/internal";

/**
 * @internal
 */
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

/**
 * @internal
 */
export async function listBlobsAtTreePath(
	inputTree: ITree | undefined,
	path: string,
): Promise<string[]> {
	const pathParts = getNormalizedObjectStoragePathParts(path);
	let tree: ITree | undefined = inputTree;
	while (tree?.entries !== undefined && pathParts.length > 0) {
		const part = pathParts.shift();
		const treeEntry = tree.entries.find((value) => {
			return value.type === "Tree" && value.path === part ? true : false;
		});

		// this check is largely superfluous due to the same check being done
		// immediately above. the type system, however, is not aware of this.
		// so we must redundantly determine that the entry's type is "Tree"
		tree = treeEntry?.type === "Tree" ? treeEntry.value : undefined;
	}
	if (tree?.entries === undefined || pathParts.length !== 0) {
		throw new Error("path does not exist");
	}
	return tree.entries.filter((e) => e.type === "Blob").map((e) => e.path);
}
