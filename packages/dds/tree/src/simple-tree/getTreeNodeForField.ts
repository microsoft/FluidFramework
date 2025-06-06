/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "@fluidframework/core-utils/internal";

import type { TreeValue } from "../core/index.js";
import {
	FieldKinds,
	type FlexTreeField,
	isFlexTreeNode,
	type FlexTreeRequiredField,
	type FlexTreeOptionalField,
} from "../feature-libraries/index.js";

import { type TreeNode, getOrCreateNodeFromInnerNode } from "./core/index.js";

/**
 * Retrieve the associated {@link TreeNode} for the given field's content.
 */
export function getTreeNodeForField(field: FlexTreeField): TreeNode | TreeValue | undefined {
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
			// Identifier fields are just value fields that hold strings
			return (field as FlexTreeRequiredField).content as string;
		}

		default:
			fail(0xadf /* invalid field kind */);
	}
}
