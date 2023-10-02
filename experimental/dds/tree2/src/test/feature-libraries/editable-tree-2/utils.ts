/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import {
	DefaultEditBuilder,
	FieldSchema,
	TypedField,
	TypedSchemaCollection,
	createMockNodeKeyManager,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context } from "../../../feature-libraries/editable-tree-2/context";
import { AllowedUpdateType, IEditableForest } from "../../../core";
import { ISharedTree, ISharedTreeView, TreeContent } from "../../../shared-tree";
import { TestTreeProviderLite, forestWithContent } from "../../utils";

export function getReadonlyContext(
	forest: IEditableForest,
	schema: TypedSchemaCollection,
): Context {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return new Context(schema, forest, dummyEditor, createMockNodeKeyManager());
}

/**
 * Creates a context and its backing forest from the provided `content`.
 *
 * @returns The created context.
 */
export function contextWithContentReadonly(content: TreeContent): Context {
	const forest = forestWithContent(content);
	return getReadonlyContext(forest, content.schema);
}

export function createTree(): ISharedTree {
	const tree = new TestTreeProviderLite(1).trees[0];
	assert(tree.isAttached());
	return tree;
}

export function createTreeView<TRoot extends FieldSchema>(
	schema: TypedSchemaCollection<TRoot>,
	initialTree: any,
): ISharedTreeView {
	return createTree().schematize({
		allowedSchemaModifications: AllowedUpdateType.None,
		initialTree,
		schema,
	});
}

// TODO: 'initialTree' should be typed to TRoot once we can cope with unboxed literals.
export function createEditableTree<TRoot extends FieldSchema>(
	schema: TypedSchemaCollection<TRoot>,
	initialTree: any,
): TypedField<TRoot> {
	return createTreeView(schema, initialTree).editableTree2(schema);
}
