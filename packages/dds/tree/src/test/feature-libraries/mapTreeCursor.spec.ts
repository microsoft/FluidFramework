/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { FieldKey, MapTree, TreeNodeSchemaIdentifier } from "../../core/index.js";
import {
	cursorForMapTreeField,
	cursorForMapTreeNode,
	mapTreeFromCursor,
	type MinimalMapTreeNodeView,
} from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { testGeneralPurposeTreeCursor } from "../cursorTestSuite.js";

testGeneralPurposeTreeCursor("mapTreeCursor", cursorForMapTreeNode, mapTreeFromCursor);

testGeneralPurposeTreeCursor(
	"mapTreeCursor with delegated fields",
	(tree: MapTree) => cursorForMapTreeNode(withDelegatedFields(tree)),
	mapTreeFromCursor,
);

describe("mapTreeCursor field delegation", () => {
	const delegatedFieldKey: FieldKey = brand("delegated");
	const leafType: TreeNodeSchemaIdentifier = brand("delegated-leaf");
	const parentType: TreeNodeSchemaIdentifier = brand("delegating-parent");

	for (const value of [0, false, null]) {
		it(`preserves falsy values through field delegation (${String(value)})`, () => {
			const nodes = Array.from({ length: 3 }, () => ({
				type: leafType,
				value,
				fields: new Map(),
			}));
			const cursor = cursorForMapTreeNode(
				withDelegatedFields({
					type: parentType,
					fields: new Map([[delegatedFieldKey, nodes]]),
				}),
			);
			cursor.enterField(delegatedFieldKey);
			assert(cursor.firstNode());
			assert.equal(cursor.value, value);
			assert.equal(cursor.fork().value, value);
			assert(cursor.nextNode());
			assert.equal(cursor.value, value);
			cursor.enterField(delegatedFieldKey);
			assert.equal(cursor.firstNode(), false);
			cursor.exitField();
			assert.equal(cursor.value, value);
			cursor.exitNode();
			assert.equal(cursor.getFieldLength(), 3);
		});
	}
});

/**
 * convert a MapTree into one which recursively "specializes" its fields' cursors with the generic mapTree cursor.
 *
 * This is useful for testing the correctness of `FieldDelegatingCursor`.
 */
function withDelegatedFields(tree: MapTree): MinimalMapTreeNodeView {
	return {
		type: tree.type,
		value: tree.value,
		fields: new Map(
			Array.from(tree.fields, ([key, children]) => {
				const nodes = children.map(withDelegatedFields);
				return [
					key,
					{
						length: nodes.length,
						tryGetCursor: () => cursorForMapTreeField(nodes),
						[Symbol.iterator](): Iterator<MinimalMapTreeNodeView> {
							throw new Error(
								"Delegated fields should construct a cursor rather than enumerate field contents directly.",
							);
						},
					},
				];
			}),
		),
	};
}
