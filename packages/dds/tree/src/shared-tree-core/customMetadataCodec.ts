/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { CustomMetadataTree } from "../core/index.js";
import type { Mutable } from "../util/index.js";

import type { EncodedCustomMetadataTree } from "./customMetadataFormat.js";

export function encodeCustomMetadataTree(tree: CustomMetadataTree): EncodedCustomMetadataTree {
	const encoded: Mutable<EncodedCustomMetadataTree> = {};
	if (tree.metadata !== undefined) {
		encoded.m = tree.metadata;
	}
	if (tree.children.length > 0) {
		encoded.c = tree.children.map(encodeCustomMetadataTree);
	}
	return encoded;
}

export function decodeCustomMetadataTree(
	encoded: EncodedCustomMetadataTree | undefined,
): CustomMetadataTree | undefined {
	if (encoded === undefined) {
		return undefined;
	}
	const decoded = decodeNode(encoded);
	// A tree in which no node supplied metadata carries no information.
	return hasMetadata(decoded) ? decoded : undefined;
}

function decodeNode(encoded: EncodedCustomMetadataTree): CustomMetadataTree {
	return {
		metadata: encoded.m,
		children: encoded.c?.map(decodeNode) ?? [],
	};
}

function hasMetadata(node: CustomMetadataTree): boolean {
	return node.metadata !== undefined || node.children.some(hasMetadata);
}
