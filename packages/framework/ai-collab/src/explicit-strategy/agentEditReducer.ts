/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-negated-condition */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import type {
	InsertableContent,
	UnsafeUnknownSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/alpha";
import {
	Tree,
	NodeKind,
	type TreeArrayNode,
	type TreeNode,
	type TreeNodeSchema,
	type SimpleNodeSchema,
	type IterableTreeArrayContent,
	type TreeLeafValue,
	TreeAlpha,
	normalizeFieldSchema,
	ObjectNodeSchema,
	FieldKind,
	type ImplicitAllowedTypes,
	normalizeAllowedTypes,
} from "@fluidframework/tree/internal";

// TODO: Expose these functions

import {
	type TreeEdit,
	type ObjectPointer,
	type Pointer,
	type TreeContent,
	objectIdKey,
	type PathPointer,
	type ArrayPosition,
	isArrayRange,
	typeField,
} from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import { fail, type View } from "./utils.js";

// function populateDefaults(
// 	json: JsonValue,
// 	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
// ): void {
// 	if (typeof json === "object") {
// 		if (json === null) {
// 			return;
// 		}
// 		if (Array.isArray(json)) {
// 			for (const element of json) {
// 				populateDefaults(element, definitionMap);
// 			}
// 		} else {
// 			assert(
// 				typeof json[typeField] === "string",
// 				0xa73 /* The typeField must be present in new JSON content */,
// 			);
// 			const nodeSchema = definitionMap.get(json[typeField]);
// 			assert(nodeSchema?.kind === NodeKind.Object, 0xa74 /* Expected object schema */);

// 			for (const [key, fieldSchema] of Object.entries(nodeSchema.fields)) {
// 				const defaulter = (fieldSchema?.metadata as FieldSchemaMetadataAlpha)?.llmDefault as
// 					| (() => TreeNode | TreeLeafValue)
// 					| undefined;

// 				if (defaulter !== undefined) {
// 					(json as Record<string, TreeNode | TreeLeafValue>)[key] = defaulter();
// 				}
// 			}

// 			for (const value of Object.values(json)) {
// 				if (value !== undefined) {
// 					populateDefaults(value, definitionMap);
// 				}
// 			}
// 		}
// 	}
// }

function isArrayNode(node: TreeNode | TreeArrayNode | TreeLeafValue): node is TreeArrayNode {
	return Tree.schema(node).kind === NodeKind.Array;
}

function getIndex(
	view: View,
	array: TreeArrayNode,
	position: ArrayPosition,
	idGenerator: IdGenerator,
): number {
	switch (typeof position) {
		case "number": {
			return position;
		}
		case "string": {
			switch (position) {
				case "start": {
					return 0;
				}
				case "end": {
					return array.length;
				}
				default: {
					throw new UsageError(
						`Invalid array position "${position}". Expected "start", "end", an index, or a position relative to an element.`,
					);
				}
			}
		}
		case "object": {
			if ("before" in position) {
				const resolved = resolvePointer(view, position.before, idGenerator, "object");
				if (Tree.parent(resolved) !== array) {
					throw new UsageError(
						`The "before" position must be within the same array as the target node.`,
					);
				}
				const index = Tree.key(resolved);
				assert(typeof index === "number", 0xa7a /* Expected number */);
				return index;
			}
			if ("after" in position) {
				const resolved = resolvePointer(view, position.after, idGenerator, "object");
				if (Tree.parent(resolved) !== array) {
					throw new UsageError(
						`The "after" position must be within the same array as the target node.`,
					);
				}
				const index = Tree.key(resolved);
				assert(typeof index === "number", 0xa7b /* Expected number */);
				return index + 1;
			}
			throw new UsageError(
				`Invalid array position "${position}". Expected "start", "end", an index, or a position relative to an element.`,
			);
		}
		default: {
			throw new UsageError(
				`Invalid array position "${position}". Expected "start", "end", an index, or a position relative to an element.`,
			);
		}
	}
}

function failUsage(message: string): never {
	throw new UsageError(message);
}

function getRangeIndices(
	view: View,
	pointer: PathPointer,
	start: ArrayPosition,
	end: ArrayPosition,
	idGenerator: IdGenerator,
): [TreeArrayNode, start: number, end: number] {
	const array = resolvePointer(view, pointer, idGenerator, "array");
	const fromIndex = getIndex(view, array, start, idGenerator);
	const toIndex = getIndex(view, array, end, idGenerator);
	return [array, fromIndex, toIndex];
}

/**
 * Manages applying the various types of {@link TreeEdit}'s to a a given {@link TreeNode}.
 */
export function applyAgentEdit(
	view: View,
	treeEdit: TreeEdit,
	idGenerator: IdGenerator,
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	validator?: (edit: TreeNode) => void,
): void {
	switch (treeEdit.type) {
		case "insertIntoArray": {
			const array = resolvePathPointer(view, treeEdit.array, idGenerator);
			if (!isArrayNode(array)) {
				throw new UsageError("The destination node must be an arrayNode");
			}

			const index = getIndex(view, array, treeEdit.position, idGenerator);
			const parentNodeSchema = Tree.schema(array);

			const inserted = (
				treeEdit.values ?? [
					treeEdit.value ?? failUsage(`Either "value" or "values" must be provided`),
				]
			).map((v) => constructTree([...parentNodeSchema.childTypes], v, idGenerator));
			array.insertAt(index, ...(inserted as unknown as IterableTreeArrayContent<never>));

			break;
		}
		case "removeFromArray": {
			if (treeEdit.element !== undefined) {
				const node = resolvePointer(view, treeEdit.element, idGenerator, "object");
				const parentNode = Tree.parent(node);
				const schema =
					parentNode !== undefined
						? Tree.schema(parentNode)
						: failUsage("Target node is not in an array");

				if (schema.kind !== NodeKind.Array) {
					throw new UsageError("Target node is not in an array");
				}

				const array = parentNode as TreeArrayNode;
				const index = Tree.key(node) as number;
				array.removeAt(index);
			} else if (treeEdit.range !== undefined) {
				const [array, fromIndex, toIndex] = getRangeIndices(
					view,
					treeEdit.range.array,
					treeEdit.range.from,
					treeEdit.range.to,
					idGenerator,
				);
				array.removeRange(fromIndex, toIndex);
			} else {
				throw new UsageError(
					"Either 'element' or 'range' must be provided for RemoveFromArray.",
				);
			}
			break;
		}
		case "setField": {
			const node = resolvePointer(view, treeEdit.object, idGenerator, "object");
			const { treeNodeSchema } = getSimpleNodeSchema(node);

			if (!(treeNodeSchema instanceof ObjectNodeSchema)) {
				throw new UsageError("The target node must be an objectNode");
			}

			const fieldSchema = normalizeFieldSchema(
				treeNodeSchema.info[treeEdit.field] ??
					failUsage(
						`Property ${treeEdit.field} is not present on ${treeNodeSchema.identifier} object`,
					),
			);

			if (treeEdit.value === undefined && fieldSchema.kind !== FieldKind.Optional) {
				throw new UsageError(
					`Field "${treeEdit.field}" is not optional. Cannot set it to undefined.`,
				);
			}

			const inserted = constructTree(fieldSchema.allowedTypes, treeEdit.value, idGenerator);
			// TODO: validation
			// validator?.(inserted);
			// TODO: Better typing
			(node as unknown as Record<string, InsertableContent>)[treeEdit.field] = inserted;
			break;
		}
		case "moveArrayElement": {
			// TODO: need to add schema check for valid moves
			let sourceArray: TreeArrayNode;
			let sourceStartIndex: number;
			let sourceEndIndex: number;
			if (isArrayRange(treeEdit.source)) {
				[sourceArray, sourceStartIndex, sourceEndIndex] = getRangeIndices(
					view,
					treeEdit.source.array,
					treeEdit.source.from,
					treeEdit.source.to,
					idGenerator,
				);
			} else {
				const source = resolvePointer(view, treeEdit.source, idGenerator, "object");
				const parent = Tree.parent(source);
				if (parent === undefined || Tree.schema(parent).kind !== NodeKind.Array) {
					throw new UsageError("The source node must be within an arrayNode");
				}
				sourceArray = parent as TreeArrayNode;
				sourceStartIndex = Tree.key(source) as number;
				sourceEndIndex = sourceStartIndex + 1;
			}

			const destinationArray = resolvePointer(
				view,
				treeEdit.destination.target,
				idGenerator,
				"array",
			);
			const destinationIndex = getIndex(
				view,
				destinationArray,
				treeEdit.destination.position,
				idGenerator,
			);

			{
				const movedSourceTypes = new Set<string>();
				for (let i = sourceStartIndex; i < sourceEndIndex; i++) {
					const node = sourceArray.at(i) ?? fail("Expected element in array");
					const schemaIdentifier = Tree.schema(node).identifier;
					movedSourceTypes.add(schemaIdentifier);
				}

				const destinationSchema = Tree.schema(destinationArray);
				const allowedTypes = new Set(
					[...destinationSchema.childTypes.values()].map((s) => s.identifier),
				);
				for (const schemaIdentifier of movedSourceTypes) {
					if (!allowedTypes.has(schemaIdentifier)) {
						throw new UsageError(
							`The source node type "${schemaIdentifier}" is not allowed in the destination array`,
						);
					}
				}
			}

			destinationArray.moveRangeToIndex(
				destinationIndex,
				sourceStartIndex,
				sourceEndIndex,
				sourceArray,
			);
			break;
		}
		default: {
			fail("invalid tree edit");
		}
	}
}

function constructTree(
	allowedTypes: ImplicitAllowedTypes,
	value: TreeContent,
	idGenerator: IdGenerator,
): TreeNode | TreeArrayNode | TreeLeafValue {
	const normalizedAllowedTypes = [...normalizeAllowedTypes(allowedTypes)];
	if (typeof value === "object" && value !== null) {
		if (Array.isArray(value)) {
			const [type, ...insert] = value;
			assert(typeof type === "string", "Expected type value as first element in parsed array");
			const schema = normalizedAllowedTypes.find((s) => s.identifier === type);
			if (schema === undefined) {
				throw new UsageError(
					`Type "${type}" is not allowed in array which only allows "${normalizedAllowedTypes.join(`", "`)}"`,
				);
			}

			const childAllowedTypes = [...schema.childTypes];
			const transformed = insert.map((val) => {
				return constructTree(childAllowedTypes, val, idGenerator);
			});

			const constructed =
				TreeAlpha.create<UnsafeUnknownSchema>(schema, transformed) ??
				fail("Expected array node to be created");

			idGenerator.assignIds(constructed);
			return constructed;
		} else {
			assert(typeof value[typeField] === "string", "Expected type property in parsed object");
			const schema = normalizedAllowedTypes.find((s) => s.identifier === value[typeField]);
			if (schema === undefined) {
				throw new UsageError(
					`Type "${value[typeField]}" is not allowed in a property which only allows "${normalizedAllowedTypes.join(
						`", "`,
					)}"`,
				);
			}
			if (!(schema instanceof ObjectNodeSchema)) {
				throw new UsageError(
					`Type "${value[typeField]}" is not an object schema. Expected an object schema.`,
				);
			}

			let id: string | undefined;
			const transformed = Object.fromEntries(
				Object.entries(value)
					.filter((entry): entry is [string, TreeContent] => {
						if (entry[0] === objectIdKey) {
							id = entry[1] as string;
							return false;
						}
						return entry[0] !== typeField && entry[1] !== undefined;
					})
					.map(([key, val]) => {
						return [
							key,
							constructTree(
								schema.fields.get(key)?.allowedTypes ??
									fail("Expected field to have allowed types"),
								val,
								idGenerator,
							),
						];
					}),
			);

			const constructed =
				TreeAlpha.create<UnsafeUnknownSchema>(schema, transformed) ??
				fail("Expected object node to be created");

			if (id !== undefined) {
				// TODO: properly assert is TreeNode
				idGenerator.getOrCreateId(constructed as TreeNode, id);
			}

			idGenerator.assignIds(constructed);
			return constructed;
		}
	}

	return value;
}

function resolvePointer(
	view: View,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "object",
): TreeNode;
function resolvePointer(
	view: View,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "array",
): TreeArrayNode;
function resolvePointer(
	view: View,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "object | array",
): TreeNode | TreeArrayNode;
function resolvePointer(
	view: View,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "primitive",
): TreeLeafValue;
function resolvePointer(
	view: View,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped?: "object" | "array" | "object | array" | "primitive",
): TreeNode | TreeArrayNode | TreeLeafValue;
function resolvePointer(
	view: View,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped?: "object" | "array" | "object | array" | "primitive",
): TreeNode | TreeArrayNode | TreeLeafValue {
	const result =
		typeof pointer === "string"
			? findObject(pointer, idGenerator)
			: resolvePathPointer(view, pointer, idGenerator);

	switch (expectedTyped) {
		case "object": {
			if (Tree.schema(result).kind !== NodeKind.Object) {
				throw new UsageError("Expected object node");
			}
			break;
		}
		case "array": {
			if (Tree.schema(result).kind !== NodeKind.Array) {
				throw new UsageError("Expected array node");
			}
			break;
		}
		case "object | array": {
			if (
				Tree.schema(result).kind !== NodeKind.Object &&
				Tree.schema(result).kind !== NodeKind.Array
			) {
				throw new UsageError("Expected object or array node");
			}
			break;
		}
		case "primitive": {
			if (Tree.schema(result).kind !== NodeKind.Leaf) {
				throw new UsageError("Expected primitive node");
			}
			break;
		}
		default: {
			break;
		}
	}

	return result;
}

function resolvePathPointer(
	view: View,
	pointer: PathPointer,
	idGenerator: IdGenerator,
): TreeNode | TreeArrayNode | TreeLeafValue {
	const nodeId = pointer[0];
	if (nodeId === undefined) {
		throw new UsageError("Pointer should not be an empty array.");
	}
	let node = nodeId === null ? view.root : findObject(nodeId, idGenerator);
	if (node === undefined) {
		throw new UsageError(`No object with id "${nodeId}" found in the tree.`);
	}
	const [, ...path] = pointer;
	for (const p of path) {
		const schema = Tree.schema(node);
		if (schema.kind === NodeKind.Leaf) {
			throw new UsageError("Expected node to be an object or array.");
		}
		if (typeof p === "string") {
			if (schema.kind !== NodeKind.Object) {
				throw new UsageError("Expected node to be an object.");
			}
			const child = (
				node as unknown as Record<string, TreeNode | TreeArrayNode | TreeLeafValue>
			)[p];
			ensurePointable(child);
			node = child;
		} else {
			if (schema.kind !== NodeKind.Array) {
				throw new UsageError("Expected node to be an array.");
			}
			const child = (node as TreeArrayNode).at(p);
			ensurePointable(child);
			node = child;
		}
	}

	return node;
}

// We don't currently allow pointers to point to primitives, but we could.
function ensurePointable(
	node: TreeNode | TreeArrayNode | TreeLeafValue | undefined,
): asserts node is TreeNode | TreeArrayNode {
	if (typeof node !== "object" || node === null || isFluidHandle(node)) {
		throw new UsageError(
			`Pointer could not be resolved to a node in the tree (note that primitives and Fluid handles are not supported).`,
		);
	}
}

function findObject(pointer: ObjectPointer, idGenerator: IdGenerator): TreeNode {
	const object = idGenerator.getNode(pointer);
	if (object === undefined) {
		throw new UsageError(`No object with id "${pointer}" found in the tree.`);
	}
	return object;
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
