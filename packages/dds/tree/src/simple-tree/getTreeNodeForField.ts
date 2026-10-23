/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

import type { FieldKey, TreeValue } from "../core/index.js";
import {
	FieldKinds,
	type FlexTreeField,
	type FlexTreeNode,
	isFlexTreeNode,
	type FlexTreeRequiredField,
	type FlexTreeOptionalField,
} from "../feature-libraries/index.js";

import {
	type TreeNode,
	getOrCreateNodeFromInnerNode,
	getOrCreateNodeFromInnerUnboxedNode,
} from "./core/index.js";

/**
 * Reads field content without allocating a field wrapper or boxing leaf nodes.
 */
export function getTreeNodeForField(
	node: FlexTreeNode,
	key: FieldKey,
): TreeNode | TreeValue | undefined {
	const content = node.getFieldContent(key);
	return content === undefined ? undefined : getOrCreateNodeFromInnerUnboxedNode(content);
}

/**
 * Retrieve the associated {@link TreeNode} for the given field's content.
 */
export function tryGetTreeNodeForField(
	field: FlexTreeField,
): TreeNode | TreeValue | undefined {
	function tryToUnboxLeaves(
		flexField: FlexTreeOptionalField | FlexTreeRequiredField,
	): TreeNode | TreeValue | undefined {
		const maybeContent = flexField.content;
		return isFlexTreeNode(maybeContent)
			? getOrCreateNodeFromInnerNode(maybeContent)
			: maybeContent;
	}
	switch (field.schema) {
		case FieldKinds.required.identifier: {
			const typedField = field as FlexTreeRequiredField;
			return tryToUnboxLeaves(typedField);
		}
		case FieldKinds.optional.identifier: {
			const typedField = field as FlexTreeOptionalField;
			return tryToUnboxLeaves(typedField);
		}
		case FieldKinds.identifier.identifier: {
			// Identifier fields are just required fields that hold strings
			return (field as FlexTreeRequiredField).content as string;
		}

		default: {
			fail(0xadf /* invalid field kind */);
		}
	}
}
