/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable unicorn/no-negated-condition */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
// eslint-disable-next-line import/no-internal-modules
import type { FieldSchemaMetadataAlpha } from "@fluidframework/tree/alpha";
import {
	Tree,
	NodeKind,
	type ImplicitAllowedTypes,
	type TreeArrayNode,
	type TreeNode,
	type TreeNodeSchema,
	type SimpleNodeSchema,
	FieldKind,
	FieldSchema,
	normalizeAllowedTypes,
	type ImplicitFieldSchema,
	type IterableTreeArrayContent,
	SchemaFactory,
	type TreeLeafValue,
} from "@fluidframework/tree/internal";

import {
	type TreeEdit,
	type ObjectPointer,
	type Pointer,
	type TreeContentObject,
	type TreeContent,
	typeField,
	objectIdKey,
	type TreeContentArray,
	type PathPointer,
	type ArrayPosition,
	isArrayRange,
} from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import type { JsonValue } from "./jsonTypes.js";
import { toDecoratedJson } from "./promptGeneration.js";
import { fail, type View } from "./utils.js";

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
			assert(
				typeof json[typeField] === "string",
				0xa73 /* The typeField must be present in new JSON content */,
			);
			const nodeSchema = definitionMap.get(json[typeField]);
			assert(nodeSchema?.kind === NodeKind.Object, 0xa74 /* Expected object schema */);

			for (const [key, fieldSchema] of Object.entries(nodeSchema.fields)) {
				const defaulter = (fieldSchema?.metadata as FieldSchemaMetadataAlpha)?.llmDefault as
					| (() => TreeNode | TreeLeafValue)
					| undefined;

				if (defaulter !== undefined) {
					(json as Record<string, TreeNode | TreeLeafValue>)[key] = defaulter();
				}
			}

			for (const value of Object.values(json)) {
				if (value !== undefined) {
					populateDefaults(value, definitionMap);
				}
			}
		}
	}
}

function createObjectOrArray(
	jsonObject: TreeContentObject | TreeContentArray,
	schema: TreeNodeSchema,
	idGenerator: IdGenerator,
): TreeNode {
	const jsonWithoutIds = cloneWithoutProperty(jsonObject, objectIdKey);
	const simpleNodeSchema = schema as unknown as new (dummy: unknown) => TreeNode;
	const treeNode = new simpleNodeSchema(jsonWithoutIds);

	function updateIds(node: TreeNode | TreeLeafValue, json: TreeContent): void {
		if (typeof json === "object" && json !== null) {
			if (Array.isArray(json)) {
				for (let i = 0; i < json.length; i++) {
					updateIds((node as TreeArrayNode)[i] ?? fail("TODO"), json[i] ?? fail("TODO"));
				}
			} else {
				// TODO: assert that treeNode is a TreeNode
				if (typeof json[objectIdKey] === "string") {
					if (idGenerator.getNode(json[objectIdKey]) !== undefined) {
						throw new UsageError(
							`${objectIdKey} ${json[objectIdKey]} already exists in the tree`,
						);
					}
					idGenerator.getOrCreateId(node as TreeNode, json[objectIdKey]);
				}
				for (const [key, value] of Object.entries(json)) {
					if (value !== undefined) {
						assert(node !== null, "");
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						const child = (node as TreeNode)[key];
						if (child !== undefined) {
							updateIds(child as TreeNode | TreeLeafValue, value);
						}
					}
				}
			}
		}
	}

	updateIds(treeNode, jsonObject);
	return treeNode;
}

function cloneWithoutProperty(
	obj: TreeContentObject | TreeContentArray,
	propertyToRemove,
): TreeContentObject | TreeContentArray {
	// Custom replacer function to exclude specific property
	function replacer<T>(key: string, value: T): T | undefined {
		if (key === propertyToRemove) {
			return undefined; // This will exclude the property
		}
		return value;
	}
	// Use stringify with the custom replacer, then parse back to an object
	return JSON.parse(JSON.stringify(obj, replacer)) as TreeContentObject | TreeContentArray;
}

function getSchemaIdentifier(content: TreeContent): string | undefined {
	switch (typeof content) {
		case "boolean": {
			return SchemaFactory.boolean.identifier;
		}
		case "number": {
			return SchemaFactory.number.identifier;
		}
		case "string": {
			return SchemaFactory.string.identifier;
		}
		case "object": {
			if (content === null) {
				return SchemaFactory.null.identifier;
			}
			if (Array.isArray(content)) {
				throw new UsageError("Arrays are not currently supported in this context");
			}
			if (isFluidHandle(content)) {
				return SchemaFactory.handle.identifier;
			}
			return content[typeField];
		}
		default: {
			throw new UsageError("Unsupported content type");
		}
	}
}

function isArrayNode(node: TreeNode | TreeArrayNode | TreeLeafValue): node is TreeArrayNode {
	return Tree.schema(node).kind === NodeKind.Array;
}

function contentWithIds(content: TreeNode, idGenerator: IdGenerator): TreeContentObject {
	return JSON.parse(toDecoratedJson(idGenerator, content)) as TreeContentObject;
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
			{
				const array = resolvePathPointer(view, treeEdit.array, idGenerator);
				if (!isArrayNode(array)) {
					throw new UsageError("The destination node must be an arrayNode");
				}

				const index = getIndex(view, array, treeEdit.position, idGenerator);
				const parentNodeSchema = Tree.schema(array);

				const values: TreeContent[] = treeEdit.values ?? [
					treeEdit.value ?? failUsage(`Either "value" or "values" must be provided`),
				];
				for (const value of values) {
					populateDefaults(value, definitionMap);
					const schemaIdentifier = getSchemaIdentifier(value);

					// We assume that the parentNode for inserts edits are guaranteed to be an arrayNode.
					const allowedTypes = [
						...normalizeAllowedTypes(parentNodeSchema.info as ImplicitAllowedTypes),
					];

					for (const allowedType of allowedTypes.values()) {
						if (
							allowedType.identifier === schemaIdentifier &&
							typeof allowedType === "function"
						) {
							if (typeof value !== "object" || value === null) {
								throw new UsageError("inserted node must be an object");
							}
							const insertNode = createObjectOrArray(value, allowedType, idGenerator);
							validator?.(insertNode);
							array.insertAt(index, insertNode as unknown as IterableTreeArrayContent<never>);
							contentWithIds(insertNode, idGenerator);
							break;
						}
					}
				}
			}
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

			const fieldSchema =
				(treeNodeSchema.info as Record<string, ImplicitFieldSchema>)[treeEdit.field] ??
				fail("Expected field schema");

			const modification = treeEdit.value;

			let insertedObject: TreeNode | undefined;
			// if fieldSchema is a LeafnodeSchema, we can check that it's a valid type and set the field.
			if (isPrimitive(modification)) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
				(node as any)[treeEdit.field] = modification ?? undefined;
			}
			// If the fieldSchema is a function we can grab the constructor and make an instance of that node.
			else if (typeof fieldSchema === "function") {
				populateDefaults(modification, definitionMap);
				if (typeof modification !== "object" || modification === null) {
					throw new UsageError("inserted node must be an object");
				}
				insertedObject = createObjectOrArray(modification, fieldSchema, idGenerator);
				validator?.(insertedObject);

				if (Array.isArray(modification)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					const field = (node as any)[treeEdit.field] as TreeArrayNode;
					assert(Array.isArray(field), 0xa75 /* the field must be an array node */);
					assert(
						Array.isArray(insertedObject),
						0xa76 /* the modification must be an array node */,
					);
					field.removeRange(0);
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(node as any)[treeEdit.field] = insertedObject;
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(node as any)[treeEdit.field] = insertedObject;
				}
			}
			// If the fieldSchema is of type FieldSchema, we can check its allowed types and set the field.
			else if (fieldSchema instanceof FieldSchema) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
				const schemaIdentifier = (modification as any)[typeField];
				if (fieldSchema.kind === FieldKind.Optional && modification === undefined) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(node as any)[treeEdit.field] = undefined;
				} else {
					for (const allowedType of fieldSchema.allowedTypeSet.values()) {
						if (allowedType.identifier === schemaIdentifier) {
							if (typeof allowedType === "function") {
								const simpleSchema = allowedType as unknown as new (
									dummy: unknown,
								) => TreeNode;
								const constructedObject = new simpleSchema(modification);
								insertedObject = constructedObject;
								// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
								(node as any)[treeEdit.field] = constructedObject;
							} else {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
								(node as any)[treeEdit.field] = modification;
							}
						}
					}
				}
			}
			if (insertedObject !== undefined) {
				contentWithIds(insertedObject, idGenerator);
			}
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

function isPrimitive(content: unknown): boolean {
	return (
		typeof content === "number" ||
		typeof content === "string" ||
		typeof content === "boolean" ||
		content === undefined ||
		content === null
	);
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
