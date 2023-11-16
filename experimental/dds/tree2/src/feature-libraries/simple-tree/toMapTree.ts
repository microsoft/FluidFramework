/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";

import {
	TreeTypeSet,
	type FieldKey,
	type MapTree,
	type TreeNodeSchemaIdentifier,
	EmptyKey,
} from "../../core";
// eslint-disable-next-line import/no-internal-modules
import { leaf } from "../../domains/leafDomain";
import { brand, fail } from "../../util";
import {
	ContextuallyTypedNodeData,
	PrimitiveValue,
	TreeDataContext,
	getPossibleTypes,
	isFluidHandle,
} from "../contextuallyTyped";
import { type TreeNodeSchema } from "../typed-schema";
import { TypedNode } from "./types";

/**
 * Transforms an input {@link TypedNode} tree to a {@link MapTree}.
 * @param tree - TODO (note POJO nature)
 */
export function toMapTree(
	tree: TypedNode<TreeNodeSchema, "javaScript">,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	assert(tree !== undefined, "Cannot map undefined tree.");

	if (tree === null) {
		return valueToMapTree(null, leaf.null.name);
	}
	switch (typeof tree) {
		case "number":
			return valueToMapTree(tree, leaf.number.name);
		case "string":
			return valueToMapTree(tree, leaf.string.name);
		case "boolean":
			return valueToMapTree(tree, leaf.boolean.name);
		default: {
			if (isFluidHandle(tree)) {
				return valueToMapTree(tree, leaf.handle.name);
			} else if (Array.isArray(tree)) {
				return arrayToMapTree(tree, context, typeSet);
			} else if (tree instanceof Map) {
				return mapToMapTree(tree, context, typeSet);
			} else {
				// Assume record-like object
				return recordToMapTree(
					tree as Record<string, TypedNode<TreeNodeSchema, "javaScript">>,
					context,
					typeSet,
				);
			}
		}
	}
}

function valueToMapTree(
	// eslint-disable-next-line @rushstack/no-new-null
	tree: PrimitiveValue | IFluidHandle | null,
	type: TreeNodeSchemaIdentifier,
): MapTree {
	return {
		value: tree,
		type,
		// TODO: do we really need to instantiate a map for a tree with no fields?
		fields: new Map(),
	};
}

function arrayToMapTree(
	tree: TypedNode<TreeNodeSchema, "javaScript">[],
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(tree, context, typeSet);

	const mappedChildren = tree
		.filter((child) => child !== undefined)
		.map((child) => toMapTree(child, context, typeSet)); // TODO: is this the right typeSet for list?

	// List children are represented as a single field entry denoted with `EmptyKey`
	const fields = new Map<FieldKey, MapTree[]>([[EmptyKey, mappedChildren]]);

	return {
		type,
		fields,
	};
}

function mapToMapTree(
	tree: Map<string, TypedNode<TreeNodeSchema, "javaScript">>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(tree, context, typeSet);
	const childTypeSet = context.schema.nodeSchema.get(type)?.mapFields?.types ?? fail("TODO");

	const fields = new Map<FieldKey, MapTree[]>();
	for (const [key, value] of tree) {
		if (value !== undefined) {
			const mappedChildTree = toMapTree(value, context, childTypeSet);
			fields.set(brand(key), [mappedChildTree]);
		}
	}
	return {
		type,
		fields,
	};
}

function recordToMapTree(
	tree: Record<string, TypedNode<TreeNodeSchema, "javaScript">>,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): MapTree {
	const type = getType(tree, context, typeSet);
	const fields = new Map<FieldKey, MapTree[]>();
	for (const [key, value] of Object.entries(tree)) {
		if (value !== undefined) {
			const childTypeSet =
				context.schema.nodeSchema.get(type)?.objectNodeFields.get(brand(key))?.types ??
				fail("TODO");
			const mappedChildTree = toMapTree(value, context, childTypeSet);
			fields.set(brand(key), [mappedChildTree]);
		}
	}

	return {
		type,
		fields,
	};
}

function getType(
	tree: TypedNode<TreeNodeSchema, "javaScript">,
	context: TreeDataContext,
	typeSet: TreeTypeSet,
): TreeNodeSchemaIdentifier {
	const possibleTypes = getPossibleTypes(context, typeSet, tree as ContextuallyTypedNodeData);
	assert(possibleTypes.length !== 0, "data is incompatible with all types allowed by the schema");
	assert(
		possibleTypes.length === 1,
		"data is compatible with more than one type allowed by the schema",
	);
	return possibleTypes[0];
}
