/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { MapTree } from "../../core/index.js";
import {
	cursorForMapTreeField,
	cursorForMapTreeNode,
	mapTreeFromCursor,
	type MinimalMapTreeNodeView,
} from "../../feature-libraries/index.js";
import { testGeneralPurposeTreeCursor } from "../cursorTestSuite.js";

testGeneralPurposeTreeCursor("mapTreeCursor", cursorForMapTreeNode, mapTreeFromCursor);

testGeneralPurposeTreeCursor(
	"mapTreeCursor with delegated fields",
	(tree: MapTree) => cursorForMapTreeNode(withDelegatedFields(tree)),
	mapTreeFromCursor,
);

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
							throw new Error("Delegated fields must not enumerate node objects");
						},
					},
				];
			}),
		),
	};
}
