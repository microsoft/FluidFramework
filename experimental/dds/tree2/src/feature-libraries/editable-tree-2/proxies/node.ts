/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import {
	FieldSchema,
	schemaIsFieldNode,
	schemaIsLeaf,
	schemaIsMap,
	schemaIsStruct,
} from "../../typed-schema";
import { FieldKinds } from "../../default-field-kinds";
import { TreeNode, TypedField } from "../editableTreeTypes";
import { createListProxy } from "./list";
import { createObjectProxy } from "./object";

/** Symbol used to store a private/internal reference to the underlying editable tree node. */
const treeNodeSym = Symbol("TreeNode");

/** Helper to retrieve the stored tree node. */
export function getTreeNode(target: object): TreeNode {
	return (target as any)[treeNodeSym] as TreeNode;
}

/** Helper to set the stored tree node. */
export function setTreeNode(target: any, treeNode: TreeNode) {
	Object.defineProperty(target, treeNodeSym, {
		value: treeNode,
		writable: false,
		enumerable: false,
		configurable: false,
	});
}

// TODO: Implement lifetime.  The proxy that should be cached on their respective nodes and reused.
// Object identity is tied to the proxy instance (not the target object)

/** Retrieve the associated proxy for the given field. */
export function getProxyForField<T extends FieldSchema>(field: TypedField<T>) {
	switch (field.schema.kind) {
		case FieldKinds.required: {
			const asValue = field as TypedField<FieldSchema<typeof FieldKinds.required>>;

			// TODO: Ideally, we would return leaves without first boxing them.  However, this is not
			//       as simple as calling '.content' since this skips the node and returns the FieldNode's
			//       inner field.
			return getProxyForNode(asValue.boxedContent);
		}
		case FieldKinds.optional: {
			fail(`"not implemented"`);
		}
		case FieldKinds.sequence: {
			fail("not implemented");
		}
		default:
			fail("invalid field kind");
	}
}

export function getProxyForNode(treeNode: TreeNode) {
	const schema = treeNode.schema;

	if (schemaIsMap(schema)) {
		fail("Map not implemented");
	}
	if (schemaIsLeaf(schema)) {
		return treeNode.value;
	}
	if (schemaIsFieldNode(schema)) {
		return createListProxy(treeNode);
	}
	if (schemaIsStruct(schema)) {
		return createObjectProxy(treeNode, schema);
	}
	fail("unrecognized node kind");
}
