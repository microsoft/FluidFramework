/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

// eslint-disable-next-line import/no-internal-modules
import { fail } from "../util/utils.js";

import {
	FieldKind,
	FieldSchema,
	getJsonSchema,
	Tree,
	type ImplicitFieldSchema,
	type TreeArrayNode,
	type TreeNode,
} from "../index.js";

// eslint-disable-next-line import/no-extraneous-dependencies
import ajvModuleOrClass from "ajv";
import type {
	TreeEdit,
	Target,
	Selection,
	Range,
	Place,
	// eslint-disable-next-line import/no-internal-modules
} from "../agent-editing/agentEditTypes.js";
import {
	getOrCreateInnerNode,
	NodeKind,
	type ImplicitAllowedTypes,
	type TreeNodeSchema,
	type TreeView,
} from "../simple-tree/index.js";
// eslint-disable-next-line import/no-internal-modules
import type { JsonValue } from "../json-handler/jsonParser.js";
// eslint-disable-next-line import/no-internal-modules
import type { SimpleNodeSchema } from "../simple-tree/api/simpleSchema.js";
import { normalizeAllowedTypes } from "../simple-tree/schemaTypes.js";

export const typeField = "__fluid_type";

// The first case here covers the esm mode, and the second the cjs one.
// Getting correct typing for the cjs case without breaking esm compilation proved to be difficult, so that case uses `any`
const Ajv =
	(ajvModuleOrClass as typeof ajvModuleOrClass & { default: unknown }).default ??
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(ajvModuleOrClass as any);

/**
 * Creates a JSON Schema validator for the provided schema, using `ajv`.
 */
export function getJsonValidator<TSchema extends ImplicitFieldSchema>(
	schema: TSchema,
): (data: unknown) => data is TSchema {
	const jsonSchema = getJsonSchema(schema);
	const ajv = new Ajv({
		strict: false,
		allErrors: true,
	});
	return ajv.compile(jsonSchema);
}

function populateDefaults(
	json: JsonValue,
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
): void {
	if (typeof json === "object") {
		if (json === null) {
			return;
		}
		if (Array.isArray(json)) {
			for (const element of json) {
				populateDefaults(element, definitionMap);
			}
		} else {
			assert(typeof json[typeField] === "string", "missing or invalid type field");
			const nodeSchema = definitionMap.get(json[typeField]);
			assert(nodeSchema?.kind === NodeKind.Object, "Expected object schema");

			for (const [key, fieldSchema] of Object.entries(nodeSchema.fields)) {
				const defaulter = fieldSchema?.metadata?.llmDefault;
				if (defaulter !== undefined) {
					// TODO: Properly type. The input `json` is a JsonValue, but the output can contain nodes (from the defaulters) amidst the json.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					json[key] = defaulter() as any;
				}
			}

			for (const value of Object.values(json)) {
				populateDefaults(value, definitionMap);
			}
		}
	}
}

export function applyAgentEdit<TSchema extends ImplicitFieldSchema>(
	tree: TreeView<TSchema>,
	treeEdit: TreeEdit,
	nodeMap: Map<number, TreeNode>,
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
): void {
	switch (treeEdit.type) {
		case "setRoot": {
			populateDefaults(treeEdit.content, definitionMap);

			const treeSchema = tree.schema;
			const validator = getJsonValidator(tree.schema);
			// If it's a primitive, just validate the content and set
			if (isPrimitive(treeEdit.content)) {
				if (validator(treeEdit.content)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(tree as any).root = treeEdit.content;
				}
			} else if (treeSchema instanceof FieldSchema) {
				if (treeSchema.kind === FieldKind.Optional && treeEdit.content === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(tree as any).root = treeEdit.content;
				} else {
					for (const allowedType of treeSchema.allowedTypeSet.values()) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						if ((treeEdit.content as any)[typeField] === allowedType.identifier) {
							if (typeof allowedType === "function") {
								const simpleNodeSchema = allowedType as unknown as new (
									dummy: unknown,
								) => TreeNode;
								const rootNode = new simpleNodeSchema(treeEdit.content);
								if (validator(rootNode)) {
									// eslint-disable-next-line @typescript-eslint/no-explicit-any
									(tree as any).root = rootNode;
								}
							} else {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								(tree as any).root = treeEdit.content;
							}
						}
					}
				}
			} else if (Array.isArray(treeSchema)) {
				for (const allowedType of treeSchema) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					if ((treeEdit.content as any)[typeField] === allowedType.identifier) {
						if (typeof allowedType === "function") {
							const simpleNodeSchema = allowedType as unknown as new (
								dummy: unknown,
							) => TreeNode;
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(tree as any).root = new simpleNodeSchema(treeEdit.content);
						} else {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(tree as any).root = treeEdit.content;
						}
					}
				}
			}

			break;
		}
		case "insert": {
			const { node, index } = getPlaceInfo(treeEdit.destination, nodeMap);
			const parentNode = Tree.parent(node);
			assert(parentNode !== undefined, "parent node must exist");

			const parentNodeSchema = Tree.schema(parentNode);
			populateDefaults(treeEdit.content, definitionMap);
			// We assume that the parentNode for inserts edits are guaranteed to be an arrayNode.
			const allowedTypes = normalizeAllowedTypes(
				parentNodeSchema.info as ImplicitAllowedTypes,
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const schemaIdentifier = (treeEdit.content as any)[typeField];

			for (const allowedType of allowedTypes.values()) {
				if (allowedType.identifier === schemaIdentifier) {
					if (typeof allowedType === "function") {
						const simpleNodeSchema = allowedType as unknown as new (
							dummy: unknown,
						) => TreeNode;
						const insertNode = new simpleNodeSchema(treeEdit.content);
						(parentNode as TreeArrayNode).insertAt(index, insertNode);
					}
				}
			}
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

			const fieldSchema =
				(treeNodeSchema.info as Record<string, ImplicitFieldSchema>)[treeEdit.field] ??
				fail("Expected field schema");

			const modification = treeEdit.modification;

			// if fieldSchema is a LeafnodeSchema, we can check that it's a valid type and set the field.
			if (isPrimitive(modification)) {
				const validator = getJsonValidator(fieldSchema);
				validator(modification);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				(node as any)[treeEdit.field] = modification;
			}
			// If the fieldSchema is a function we can grab the constructor and make an instance of that node.
			else if (typeof fieldSchema === "function") {
				const simpleSchema = fieldSchema as unknown as new (dummy: unknown) => TreeNode;
				populateDefaults(modification, definitionMap);
				const validator = getJsonValidator(fieldSchema);
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
				} else {
					const modificationNode = new simpleSchema(modification);

					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(node as any)[treeEdit.field] = modificationNode;
				}
			}
			// If the fieldSchema is of type FieldSchema, we can check its allowed types and set the field.
			else if (fieldSchema instanceof FieldSchema) {
				if (fieldSchema.kind === FieldKind.Optional && modification === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					(node as any)[treeEdit.field] = undefined;
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const schemaIdentifier = (modification as any)[typeField];

				for (const allowedType of fieldSchema.allowedTypeSet.values()) {
					if (allowedType.identifier === schemaIdentifier) {
						if (typeof allowedType === "function") {
							const simpleSchema = allowedType as unknown as new (dummy: unknown) => TreeNode;
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(node as any)[treeEdit.field] = new simpleSchema(modification);
						} else {
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							(node as any)[treeEdit.field] = modification;
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

function isPrimitive(content: unknown): boolean {
	return (
		typeof content === "number" ||
		typeof content === "string" ||
		typeof content === "boolean" ||
		typeof content === "undefined" ||
		content === null
	);
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

export function isValidContent(content: unknown, validator: (data: unknown) => void): boolean {
	try {
		validator(content);
	} catch (error) {
		return false;
	}
	return true;
}

function getSimpleNodeSchema(node: TreeNode): SchemaInfo {
	const treeNodeSchema = Tree.schema(node);
	const simpleNodeSchema = treeNodeSchema as unknown as new (dummy: unknown) => TreeNode;
	return { treeNodeSchema, simpleNodeSchema };
}
