/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import type { SchematizingSimpleTreeView } from "../shared-tree/schematizingTreeView.js";

// eslint-disable-next-line import/no-internal-modules
import { fail } from "../util/utils.js";

import {
	FieldKind,
	FieldSchema,
	getJsonSchema,
	Tree,
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	type JsonTreeSchema,
	type TreeArrayNode,
	type TreeNode,
} from "../index.js";

// eslint-disable-next-line import/no-extraneous-dependencies
import ajvModuleOrClass from "ajv";
// eslint-disable-next-line import/no-internal-modules
import { valueSchemaAllows } from "../feature-libraries/valueUtilities.js";
import type { Value } from "../core/index.js";
import type {
	EditWrapper,
	TreeEdit,
	Target,
	Selection,
	Range,
	// eslint-disable-next-line import/no-internal-modules
	Place,
} from "../agent-editing/agentEditTypes.js";
import { getOrCreateInnerNode, type TreeNodeSchema } from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import { LeafNodeSchema } from "../simple-tree/leafNodeSchema.js";

// The first case here covers the esm mode, and the second the cjs one.
// Getting correct typing for the cjs case without breaking esm compilation proved to be difficult, so that case uses `any`
const Ajv =
	(ajvModuleOrClass as typeof ajvModuleOrClass & { default: unknown }).default ??
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ajvModuleOrClass as any);

/**
 * Creates a JSON Schema validator for the provided schema, using `ajv`.
 */
export function getJsonValidator(schema: JsonTreeSchema): (data: unknown) => void {
	const ajv = new Ajv({
		strict: false,
		allErrors: true,
	});
	return ajv.compile(schema);
}

export function applyAgentEdit<TSchema extends ImplicitFieldSchema>(
	tree: SchematizingSimpleTreeView<TSchema>,
	treeEdit: TreeEdit,
	nodeMap: Map<number, TreeNode>,
): void {
	switch (treeEdit.type) {
		case "setRoot": {
			const { simpleNodeSchema } = getSimpleNodeSchema(tree.root as TreeNode);

			const rootNode = new simpleNodeSchema(treeEdit.content);
			tree.root = rootNode as InsertableTreeFieldFromImplicitField<TSchema>;
			break;
		}
		case "insert": {
			const { node, index } = getPlaceInfo(treeEdit.destination, nodeMap);
			const parentNode = Tree.parent(node);
			assert(parentNode !== undefined, "parent node must exist");

			const { treeNodeSchema, simpleNodeSchema } = getSimpleNodeSchema(node);

			const jsonSchema = getJsonSchema(treeNodeSchema);
			const validator = getJsonValidator(jsonSchema);
			validator(treeEdit.content);
			const insertNode = new simpleNodeSchema(treeEdit.content);

			(parentNode as TreeArrayNode).insertAt(index, insertNode);
			break;
		}
		case "remove": {
			const source = treeEdit.source;
			if (isTarget(source)) {
				const { node, parentIndex } = getTargetInfo(source, nodeMap);
				const parentNode = Tree.parent(node) as TreeArrayNode;
				parentNode.removeAt(parentIndex);
			} else if (isRange(source)) {
				const { startNode, startIndex, endNode, endIndex } = getRangeInfo(source, nodeMap);
				const parentNode = Tree.parent(startNode) as TreeArrayNode;
				const endParentNode = Tree.parent(endNode) as TreeArrayNode;

				assert(
					parentNode === endParentNode,
					"the two nodes of the range must be from the same parent",
				);

				parentNode.removeRange(startIndex, endIndex);
			}
			break;
		}
		case "modify": {
			const { node } = getTargetInfo(treeEdit.target, nodeMap);
			const { treeNodeSchema } = getSimpleNodeSchema(node);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const fieldSchema = (treeNodeSchema.info as any)[treeEdit.field];
			const modification = treeEdit.modification;

			// if fieldSchema is a LeafnodeSchema, we can check that it's a valid type and set the field.
			if (fieldSchema instanceof LeafNodeSchema) {
				assert(
					valueSchemaAllows(fieldSchema.info, modification as Value),
					"invalid modification content",
				);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(node as any)[treeEdit.field] = modification;
			}
			// If the fieldSchema is a function we can grab the constructor and make an instance of that node.
			else if (typeof fieldSchema === "function") {
				const simpleSchema = fieldSchema as unknown as new (dummy: unknown) => TreeNode;
				const jsonSchema = getJsonSchema(fieldSchema);
				const validator = getJsonValidator(jsonSchema);
				validator(modification);
				if (Array.isArray(modification)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const field = (node as any)[treeEdit.field] as TreeArrayNode;
					assert(Array.isArray(field), "the field must be an array node");
					const modificationArrayNode = new simpleSchema(modification);
					assert(
						Array.isArray(modificationArrayNode),
						"the modification must be an array node",
					);
					field.removeRange(0);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(node as any)[treeEdit.field] = modificationArrayNode;
				}
			}
			// If the fieldSchema is of type FieldSchema, we can check its allowed types and set the field.
			else if (fieldSchema instanceof FieldSchema) {
				if (fieldSchema.kind === FieldKind.Optional && modification === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(node as any)[treeEdit.field] = undefined;
				}
				for (const allowedType of fieldSchema.allowedTypeSet.values()) {
					const jsonSchema = getJsonSchema(allowedType);
					const validator = getJsonValidator(jsonSchema);
					if (isValidContent(modification, validator)) {
						if (allowedType instanceof LeafNodeSchema) {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(node as any)[treeEdit.field] = modification;
						} else if (typeof allowedType === "function") {
							const simpleSchema = allowedType as unknown as new (dummy: unknown) => TreeNode;
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(node as any)[treeEdit.field] = new simpleSchema(modification);
						}
					}
				}
			}
			break;
		}
		case "move": {
			break;
		}
		default:
			fail("invalid tree edit");
	}
}

function isValidContent(content: unknown, validator: (data: unknown) => void): boolean {
	try {
		validator(content);
	} catch (error) {
		return false;
	}
	return true;
}

export function agentEditReducer<TSchema extends ImplicitFieldSchema>(
	tree: SchematizingSimpleTreeView<TSchema>,
	editWrapper: EditWrapper,
	nodeMap: Map<number, TreeNode>,
): void {
	for (const treeEdit of editWrapper.edits) {
		applyAgentEdit(tree, treeEdit, nodeMap);
	}
}

function isTarget(selection: Selection): selection is Target {
	return "objectId" in selection;
}

function isRange(selection: Selection): selection is Range {
	return "from" in selection && "to" in selection;
}

interface RangeInfo {
	startNode: TreeNode;
	startIndex: number;
	endNode: TreeNode;
	endIndex: number;
}

function getRangeInfo(range: Range, nodeMap: Map<number, TreeNode>): RangeInfo {
	const { node: startNode, index: startIndex } = getPlaceInfo(range.from, nodeMap);
	const { node: endNode, index: endIndex } = getPlaceInfo(range.to, nodeMap);

	return { startNode, startIndex, endNode, endIndex };
}

interface PlaceInfo {
	node: TreeNode;
	index: number;
}

function getPlaceInfo(place: Place, nodeMap: Map<number, TreeNode>): PlaceInfo {
	const { node, parentIndex } = getTargetInfo(place, nodeMap);
	return { node, index: place.place === "before" ? parentIndex : parentIndex + 1 };
}

interface TargetInfo {
	node: TreeNode;
	parentIndex: number;
}

function getTargetInfo(target: Target, nodeMap: Map<number, TreeNode>): TargetInfo {
	const node = nodeMap.get(target.objectId);
	assert(node !== undefined, "objectId does not exist in nodeMap");

	const parentIndex = getOrCreateInnerNode(node).anchorNode.parentIndex;
	return { node, parentIndex };
}

interface SchemaInfo {
	treeNodeSchema: TreeNodeSchema;
	simpleNodeSchema: new (dummy: unknown) => TreeNode;
}

function getSimpleNodeSchema(node: TreeNode): SchemaInfo {
	const treeNodeSchema = Tree.schema(node);
	const simpleNodeSchema = treeNodeSchema as unknown as new (dummy: unknown) => TreeNode;
	return { treeNodeSchema, simpleNodeSchema };
}
