/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-negated-condition */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
import {
	type ImplicitFieldSchema,
	type InsertableContent,
	type TreeArrayNode,
	type TreeNode,
	type TreeNodeSchema,
	type IterableTreeArrayContent,
	type TreeLeafValue,
	type ImplicitAllowedTypes,
	Tree,
	NodeKind,
	FieldKind,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tree/alpha";
// eslint-disable-next-line import/order
import {
	normalizeAllowedTypes,
	type SimpleTreeSchema,
	ObjectNodeSchema,
} from "@fluidframework/tree/internal";

// TODO: Expose these functions

import { z } from "zod";

import {
	type TreeEdit,
	type ObjectPointer,
	type Pointer,
	type TreeContent,
	objectIdKey,
	type PathPointer,
	type ArrayElementPointer,
	isArrayRange,
	typeField,
	isAbsolute,
	type AbsoluteArrayPointer,
	type RelativeArrayPointer,
} from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import { getOrCreateTypeForInsertion } from "./typeGeneration.js";
import { constructNode, fail, failUsage, hasAtLeastTwo, type TreeView } from "./utils.js";

function resolveArrayElementPointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: ArrayElementPointer,
	idGenerator: IdGenerator,
): {
	array: TreeArrayNode;
	index: number;
} {
	if (isAbsolute(pointer)) {
		return resolveAbsoluteArrayElementPointer(view, pointer, idGenerator);
	}
	return resolveRelativeArrayElementPointer(view, pointer, idGenerator);
}

function resolveAbsoluteArrayElementPointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: AbsoluteArrayPointer,
	idGenerator: IdGenerator,
): {
	array: TreeArrayNode;
	index: number;
} {
	const array = resolvePointer(view, pointer.array, idGenerator, "array");
	if (typeof pointer.index === "number") {
		return { array, index: pointer.index };
	}
	if (pointer.index === "end") {
		return { array, index: array.length };
	}
	throw new UsageError(
		`Invalid absolute array index "${pointer.index}". Expected an index or "end".`,
	);
}

function resolveRelativeArrayElementPointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: RelativeArrayPointer,
	idGenerator: IdGenerator,
): {
	array: TreeArrayNode;
	index: number;
} {
	if ("before" in pointer) {
		const resolved = resolvePointer(view, pointer.before, idGenerator, "object");
		const index = Tree.key(resolved);
		if (typeof index !== "number") {
			throw new UsageError(
				`The insertion location is before an object that is not in an array.`,
			);
		}
		return { array: Tree.parent(resolved) as TreeArrayNode, index };
	}
	if ("after" in pointer) {
		const resolved = resolvePointer(view, pointer.after, idGenerator, "object");
		const index = Tree.key(resolved);
		if (typeof index !== "number") {
			throw new UsageError(
				`The insertion location is after an object that is not in an array.`,
			);
		}
		return { array: Tree.parent(resolved) as TreeArrayNode, index: index + 1 };
	}
	throw new UsageError(
		`Invalid relative array position "${pointer}". Expected an object with a valid "before" or "after" ObjectPointer.`,
	);
}

function getRangeIndices(
	view: TreeView<ImplicitFieldSchema>,
	start: ArrayElementPointer,
	end: ArrayElementPointer,
	idGenerator: IdGenerator,
): [TreeArrayNode, start: number, end: number] {
	const { array: startArray, index: startIndex } = resolveArrayElementPointer(
		view,
		start,
		idGenerator,
	);
	const { array: endArray, index: endIndex } = resolveArrayElementPointer(
		view,
		end,
		idGenerator,
	);
	if (startArray !== endArray) {
		throw new UsageError(`Start and end pointers must be in the same array.`);
	}

	return [startArray, startIndex, endIndex];
}

/**
 * Manages applying the various types of {@link TreeEdit}'s to a a given {@link TreeNode}.
 */
export function applyAgentEdit(
	treeSchema: SimpleTreeSchema,
	view: TreeView<ImplicitFieldSchema>,
	treeEdit: TreeEdit,
	idGenerator: IdGenerator,
): void {
	switch (treeEdit.type) {
		case "insertIntoArray": {
			const { array, index } = resolveArrayElementPointer(
				view,
				treeEdit.position,
				idGenerator,
			);
			const parentNodeSchema = Tree.schema(array);

			const inserted = (
				treeEdit.values ?? [
					treeEdit.value ?? failUsage(`Either "value" or "values" must be provided`),
				]
			).map((v) =>
				constructTree(treeSchema, [...parentNodeSchema.childTypes], v, idGenerator),
			);
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

			const fieldSchema =
				treeNodeSchema.fields.get(treeEdit.field) ??
				failUsage(
					`Property ${treeEdit.field} is not present on ${treeNodeSchema.identifier} object`,
				);

			if (treeEdit.value === undefined && fieldSchema.kind !== FieldKind.Optional) {
				throw new UsageError(
					`Property "${treeEdit.field}" is not optional. Cannot remove it.`,
				);
			}

			// TODO: Better typing
			const settableNode = node as unknown as Record<string, InsertableContent | undefined>;
			settableNode[treeEdit.field] =
				treeEdit.value === undefined
					? undefined
					: constructTree(treeSchema, fieldSchema.allowedTypes, treeEdit.value, idGenerator);

			idGenerator.assignIds(node[treeEdit.field]);
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

			const { array: destinationArray, index: destinationIndex } = resolveArrayElementPointer(
				view,
				treeEdit.destination,
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
	treeSchema: SimpleTreeSchema,
	allowedTypes: ImplicitAllowedTypes,
	value: TreeContent,
	idGenerator: IdGenerator,
): TreeNode | TreeLeafValue {
	if (typeof value === "object" && value !== null) {
		const normalizedAllowedTypes = [...normalizeAllowedTypes(allowedTypes)];
		const zodAllowedTypes = normalizedAllowedTypes.map((s) =>
			getOrCreateTypeForInsertion(treeSchema.definitions, s.identifier),
		);

		if (zodAllowedTypes[0] === undefined) {
			throw new UsageError(`No types are allowed in this field`);
		}

		const zodParser = hasAtLeastTwo(zodAllowedTypes)
			? z.union(zodAllowedTypes)
			: zodAllowedTypes[0];

		const parseResult = zodParser.safeParse(value);
		if (!parseResult.success) {
			throw new UsageError(
				`Failed to parse "${JSON.stringify(value)}". Error: ${parseResult.error.message}`,
			);
		}

		return constructTreeHelper(allowedTypes, parseResult.data as TreeContent, idGenerator);
	}

	return constructTreeHelper(allowedTypes, value, idGenerator);
}

function constructTreeHelper(
	allowedTypes: ImplicitAllowedTypes,
	value: TreeContent,
	idGenerator: IdGenerator,
): TreeNode | TreeLeafValue {
	const normalizedAllowedTypes = [...normalizeAllowedTypes(allowedTypes)];
	if (typeof value === "object" && value !== null) {
		if (Array.isArray(value)) {
			const [type, ...insert] = value;
			assert(typeof type === "string", "Expected type value as first element in parsed array");
			const schema = normalizedAllowedTypes.find((s) => s.identifier === type);
			if (schema === undefined) {
				throw new UsageError(
					`Type "${type}" is not allowed in array which only allows "${normalizedAllowedTypes.map((t) => t.identifier).join(`", "`)}"`,
				);
			}

			const childAllowedTypes = [...schema.childTypes];
			const transformed = insert.map((val) => {
				return constructTreeHelper(childAllowedTypes, val, idGenerator);
			});

			return constructNode(schema, transformed);
		} else {
			assert(typeof value[typeField] === "string", "Expected type property in parsed object");
			const schema = normalizedAllowedTypes.find((s) => s.identifier === value[typeField]);
			if (schema === undefined) {
				throw new UsageError(
					`Type "${value[typeField]}" is not allowed in a property which only allows "${normalizedAllowedTypes
						.map((t) => t.identifier)
						.join(`", "`)}"`,
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
							constructTreeHelper(
								schema.fields.get(key)?.allowedTypes ??
									fail("Expected field to have allowed types"),
								val,
								idGenerator,
							),
						];
					}),
			);

			const constructed = constructNode(schema, transformed);
			if (id !== undefined) {
				// TODO: properly assert is TreeNode
				idGenerator.getOrCreateId(constructed, id);
			}

			return constructed;
		}
	}

	return value;
}

function resolvePointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "object",
): TreeNode;
function resolvePointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "array",
): TreeArrayNode;
function resolvePointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "object | array",
): TreeNode;
function resolvePointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped: "primitive",
): TreeLeafValue;
function resolvePointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped?: "object" | "array" | "object | array" | "primitive",
): TreeNode | TreeLeafValue;
function resolvePointer(
	view: TreeView<ImplicitFieldSchema>,
	pointer: Pointer,
	idGenerator: IdGenerator,
	expectedTyped?: "object" | "array" | "object | array" | "primitive",
): TreeNode | TreeLeafValue {
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
	view: TreeView<ImplicitFieldSchema>,
	pointer: PathPointer,
	idGenerator: IdGenerator,
): TreeNode | TreeLeafValue {
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
			const child = (node as unknown as Record<string, TreeNode | TreeLeafValue>)[p];
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
	node: TreeNode | TreeLeafValue | undefined,
): asserts node is TreeNode {
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
