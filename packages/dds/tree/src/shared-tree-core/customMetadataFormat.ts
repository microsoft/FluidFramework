/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Type from "@sinclair/typebox";

import type { CustomMetadataTree } from "../core/index.js";
import {
	type JsonCompatibleReadOnlyObject,
	JsonCompatibleReadOnlyObjectSchema,
	type Mutable,
} from "../util/index.js";

/**
 * The persisted form of a {@link CustomMetadataTree}.
 * @remarks
 * The property names are abbreviated, and both are optional, because this rides on every annotated op
 * and occupies summary space for as long as its commit survives. Most commits are produced by a single
 * (un-nested) transaction, for which this encodes as just `{"m":\{...\}}`.
 *
 * - `m`: the metadata supplied by this transaction, omitted when it supplied none.
 * - `c`: the nodes of nested transactions, omitted when there were none.
 *
 * @privateRemarks
 * Each node forbids additional properties. Extending the shape of a node is therefore a breaking format
 * change and must be introduced under a new message/EditManager format version rather than by adding a
 * key here: silently ignoring an unknown key would lose metadata when an older client re-summarizes.
 */
// Declared as a type alias rather than an interface so that it satisfies the index signature of
// `JsonCompatibleReadOnlyObject`, which the encoded message and summary types are constrained to.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type EncodedCustomMetadataTree = {
	readonly m?: JsonCompatibleReadOnlyObject;
	readonly c?: readonly EncodedCustomMetadataTree[];
};

export const EncodedCustomMetadataTree = Type.Recursive((Self) =>
	Type.Object(
		{
			m: Type.Optional(JsonCompatibleReadOnlyObjectSchema),
			c: Type.Optional(Type.Array(Self)),
		},
		{ additionalProperties: false },
	),
) as unknown as Type.TSchema;

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
	encoded: EncodedCustomMetadataTree,
): CustomMetadataTree | undefined {
	const decoded = decodeNode(encoded);
	// A tree in which no transaction supplied metadata carries no information, and would otherwise
	// break the invariant that `customTree` is defined exactly when the flattened view is.
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
