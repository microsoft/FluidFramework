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
	type FlexTreeCounterField,
} from "../feature-libraries/index.js";

import { type TreeNode, getOrCreateNodeFromInnerNode } from "./core/index.js";

/**
 * Reads stored field content, returning its associated {@link TreeNode} or unboxed leaf value.
 * @remarks
 * Counter fields return their numeric content, not a live counter accessor.
 * Object-property access supplies accessors separately; content traversal and serialization use this function.
 * @param field - The field to read.
 * @returns Its node or leaf value, or `undefined` for an empty optional field.
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
		case FieldKinds.counter.identifier: {
			return (field as FlexTreeCounterField).content;
		}
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
