/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import {
	DefaultEditBuilder,
	FieldSchema,
	TypedSchemaCollection,
	createMockNodeKeyManager,
	nodeKeyFieldKey,
} from "../../../feature-libraries";
// eslint-disable-next-line import/no-internal-modules
import { Context, getTreeContext } from "../../../feature-libraries/editable-tree-2/context";
import { AllowedUpdateType, IEditableForest } from "../../../core";
import { ISharedTree, ISharedTreeView, TreeContent } from "../../../shared-tree";
import { TestTreeProviderLite, forestWithContent } from "../../utils";
import { brand } from "../../../util";

export function getReadonlyContext(
	forest: IEditableForest,
	schema: TypedSchemaCollection,
): Context {
	// This will error if someone tries to call mutation methods on it
	const dummyEditor = {} as unknown as DefaultEditBuilder;
	return getTreeContext(
		schema,
		forest,
		dummyEditor,
		createMockNodeKeyManager(),
		brand(nodeKeyFieldKey),
	);
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
