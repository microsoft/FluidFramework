/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type TreeStoredSchema,
	rootFieldKey,
	type MapTree,
	type TreeNodeSchemaIdentifier,
} from "../core/index.js";
import { FieldKinds, cursorForMapTreeField } from "../feature-libraries/index.js";
import type { ITreeCheckout } from "../shared-tree/index.js";
import { stringSchema, toStoredSchema } from "../simple-tree/index.js";
import { brand, type JsonCompatible } from "../util/index.js";
import { checkoutWithContent } from "./utils.js";
// eslint-disable-next-line import/no-internal-modules
import { normalizeAllowedTypes } from "../simple-tree/schemaTypes.js";
import { singleJsonCursor } from "./json/index.js";
import { JsonUnion } from "../jsonDomainSchema.js";

// This file provides utilities for testing sequence fields using documents where the root is the sequence being tested.
// This pattern is not expressible using the public simple-tree API, and is only for testing internal details.

export const jsonSequenceRootSchema: TreeStoredSchema = {
	nodeSchema: toStoredSchema(JsonUnion).nodeSchema,
	rootFieldSchema: {
		kind: FieldKinds.sequence.identifier,
		types: new Set(
			[...normalizeAllowedTypes(JsonUnion)].map((s) =>
				brand<TreeNodeSchemaIdentifier>(s.identifier),
			),
		),
	},
};

/**
 * Helper function to insert node at a given index.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted nodes.
 */
export function insert(tree: ITreeCheckout, index: number, ...values: string[]): void {
	const fieldEditor = tree.editor.sequenceField({ field: rootFieldKey, parent: undefined });
	fieldEditor.insert(
		index,
		cursorForMapTreeField(
			values.map(
				(value): MapTree => ({
					fields: new Map(),
					type: brand(stringSchema.identifier),
					value,
				}),
			),
		),
	);
}

/**
 * Removes `count` items from the root field of `tree`.
 */
export function remove(tree: ITreeCheckout, index: number, count: number): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	field.remove(index, count);
}

/**
 * Creates a sequence field at the root.
 */
export function makeTreeFromJsonSequence(json: JsonCompatible[]): ITreeCheckout {
	const cursors = json.map(singleJsonCursor);
	const tree = checkoutWithContent({
		schema: jsonSequenceRootSchema,
		initialTree: cursors,
	});
	return tree;
}
