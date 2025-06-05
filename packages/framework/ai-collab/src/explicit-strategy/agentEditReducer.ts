/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { isFluidError, UsageError } from "@fluidframework/telemetry-utils/internal";
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
} from "@fluidframework/tree/internal";
import { closest } from "fastest-levenshtein";

import type {
	ArrayRangeRemoveDiff,
	ArraySingleRemoveDiff,
	InsertDiff,
	ModifyDiff,
	MoveRangeDiff,
	MoveSingleDiff,
	NodePath,
	RemoveNodeDiff,
	Diff,
} from "../diffTypes.js";

import {
	type TreeEdit,
	type ObjectTarget,
	type Selection,
	type Range,
	type ObjectPlace,
	type ArrayPlace,
	type TreeEditObject,
	type TreeEditValue,
	typeField,
	type Modify,
	type Remove,
	type Move,
	objectIdKey,
} from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import type { JsonValue } from "./jsonTypes.js";
import { toDecoratedJson } from "./promptGeneration.js";
import { fail } from "./utils.js";

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
		}
	}
}

/**
 * Gets the schema identifier of the given content, including primitive values.
 */
export function getSchemaIdentifier(content: TreeEditValue): string {
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

/**
 * Converts a tree node from a {@link TreeEdit} to a {@link TreeEditObject} with the proper object IDs.
 */
export function contentWithIds(content: TreeNode, idGenerator: IdGenerator): TreeEditObject {
	return JSON.parse(toDecoratedJson(idGenerator, content)) as TreeEditObject;
}

/**
 * Manages applying the various types of {@link TreeEdit}'s to a a given {@link TreeNode}.
 */
export function applyAgentEdit(
	treeEdit: TreeEdit,
	idGenerator: IdGenerator,
	definitionMap: ReadonlyMap<string, SimpleNodeSchema>,
	validator?: (edit: TreeNode) => void,
): { edit: TreeEdit; diff: Diff } {
	assertObjectIdsExist(treeEdit, idGenerator);
	switch (treeEdit.type) {
		case "insert": {
			const { array, index } = getPlaceInfo(treeEdit.destination, idGenerator);

			const parentNodeSchema = Tree.schema(array);
			populateDefaults(treeEdit.content, definitionMap);

			const schemaIdentifier = getSchemaIdentifier(treeEdit.content);

			// We assume that the parentNode for inserts edits are guaranteed to be an arrayNode.
			const allowedTypes = [
				...normalizeAllowedTypes(parentNodeSchema.info as ImplicitAllowedTypes),
			];

			for (const allowedType of allowedTypes.values()) {
				if (allowedType.identifier === schemaIdentifier && typeof allowedType === "function") {
					const simpleNodeSchema = allowedType as unknown as new (dummy: unknown) => TreeNode;
					const insertNode = new simpleNodeSchema(treeEdit.content);
					validator?.(insertNode);

					array.insertAt(index, insertNode as unknown as IterableTreeArrayContent<never>);
					return {
						edit: {
							...treeEdit,
							content: contentWithIds(insertNode, idGenerator),
						},
						diff: createInsertDiff(insertNode, treeEdit.explanation, idGenerator),
					};
				}
			}
			fail("inserted node must be of an allowed type");
		}
		case "remove": {
			const source = treeEdit.source;
			let diff: RemoveNodeDiff | ArraySingleRemoveDiff | ArrayRangeRemoveDiff;
			if (isObjectTarget(source)) {
				const node = getNodeFromTarget(source, idGenerator);
				const parentNode = Tree.parent(node);
				// Case for deleting rootNode
				if (parentNode === undefined) {
					throw new UsageError(
						"The root is required, and cannot be removed. Please use modify edit instead.",
					);
				} else if (Tree.schema(parentNode).kind === NodeKind.Array) {
					const nodeIndex = Tree.key(node) as number;
					const parentArrayNode = parentNode as TreeArrayNode;
					diff = createRemoveDiff(treeEdit, idGenerator);
					parentArrayNode.removeAt(nodeIndex);
				} else {
					const fieldKey = Tree.key(node);
					const parentSchema = Tree.schema(parentNode);
					const fieldSchema =
						(parentSchema.info as Record<string, ImplicitFieldSchema>)[fieldKey] ??
						fail("Expected field schema");
					if (fieldSchema instanceof FieldSchema && fieldSchema.kind === FieldKind.Optional) {
						diff = createRemoveDiff(treeEdit, idGenerator);
						// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
						(parentNode as any)[fieldKey] = undefined;
					} else {
						throw new UsageError(
							`${fieldKey} is required, and cannot be removed. Please use modify edit instead.`,
						);
					}
				}
			} else if (isRange(source)) {
				const { array, startIndex, endIndex } = getRangeInfo(source, idGenerator);
				diff = createRemoveDiff(treeEdit, idGenerator);
				array.removeRange(startIndex, endIndex);
			} else {
				throw new UsageError("Invalid source for remove edit");
			}

			return { edit: treeEdit, diff };
		}
		case "modify": {
			const node = getNodeFromTarget(treeEdit.target, idGenerator);
			const { treeNodeSchema } = getSimpleNodeSchema(node);

			const nodeFieldSchemas = treeNodeSchema.info as Record<string, ImplicitFieldSchema>;

			const fieldSchema = nodeFieldSchemas[treeEdit.field];

			// If the LLM attempts to modify a field that does not exist in the target schema we generate a useful error message that can be used as part of the feedback loop.
			if (fieldSchema === undefined) {
				const errorMessage = createInvalidModifyFeedbackMsg(
					treeEdit,
					node,
					"NONEXISTENT_FIELD",
				);
				throw new UsageError(errorMessage);
			}

			const modification = treeEdit.modification;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			const schemaIdentifier = (modification as any)[typeField];

			let insertedObject: TreeNode | undefined;
			const diff = createModifyDiff(treeEdit, idGenerator);
			// if fieldSchema is a LeafnodeSchema, we can check that it's a valid type and set the field.
			if (isPrimitive(modification)) {
				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(node as any)[treeEdit.field] = modification;
				} catch (error) {
					if (!isFluidError(error)) {
						throw error;
					}
					// If the LLM attempts to use the wrong type for a field, we generate a useful error message that can be used as part of the feedback loop.
					const isInvalidTypeError =
						error.message.match(
							/The provided data is incompatible with all of the types allowed by the schema./,
						) !== null;
					if (isInvalidTypeError === true) {
						const errorMessage = createInvalidModifyFeedbackMsg(
							treeEdit,
							node,
							"INVALID_TYPE",
						);
						throw new UsageError(errorMessage);
					}

					throw error;
				}
			}
			// If the fieldSchema is a function we can grab the constructor and make an instance of that node.
			else if (typeof fieldSchema === "function") {
				const simpleSchema = fieldSchema as unknown as new (dummy: unknown) => TreeNode;
				populateDefaults(modification, definitionMap);
				const constructedModification = new simpleSchema(modification);
				validator?.(constructedModification);

				insertedObject = constructedModification;

				if (Array.isArray(modification)) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					const field = (node as any)[treeEdit.field] as TreeArrayNode;
					assert(Array.isArray(field), 0xa75 /* the field must be an array node */);
					assert(
						Array.isArray(constructedModification),
						0xa76 /* the modification must be an array node */,
					);
					field.removeRange(0);
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
				(node as any)[treeEdit.field] = constructedModification;
			}
			// If the fieldSchema is of type FieldSchema, we can check its allowed types and set the field.
			else if (fieldSchema instanceof FieldSchema) {
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

			return insertedObject === undefined
				? { edit: treeEdit, diff }
				: {
						edit: {
							...treeEdit,
							modification: contentWithIds(insertedObject, idGenerator),
						},
						diff,
					};
		}
		case "move": {
			// TODO: need to add schema check for valid moves
			const source = treeEdit.source;
			const destination = treeEdit.destination;
			const { array: destinationArrayNode, index: destinationIndex } = getPlaceInfo(
				destination,
				idGenerator,
			);
			const diff: MoveSingleDiff | MoveRangeDiff = createMoveDiff(treeEdit, idGenerator);
			if (isObjectTarget(source)) {
				const sourceNode = getNodeFromTarget(source, idGenerator);
				const sourceIndex = Tree.key(sourceNode) as number;
				const sourceArrayNode = Tree.parent(sourceNode) as TreeArrayNode;
				const sourceArraySchema = Tree.schema(sourceArrayNode);
				if (sourceArraySchema.kind !== NodeKind.Array) {
					throw new UsageError("the source node must be within an arrayNode");
				}
				const destinationArraySchema = Tree.schema(destinationArrayNode);
				const allowedTypes = [
					...normalizeAllowedTypes(destinationArraySchema.info as ImplicitAllowedTypes),
				];
				const nodeToMove = sourceArrayNode.at(sourceIndex);
				assert(nodeToMove !== undefined, 0xa77 /* node to move must exist */);
				if (isNodeAllowedType(nodeToMove as TreeNode, allowedTypes)) {
					destinationArrayNode.moveRangeToIndex(
						destinationIndex,
						sourceIndex,
						sourceIndex + 1,
						sourceArrayNode,
					);
				} else {
					throw new UsageError("Illegal node type in destination array");
				}
			} else if (isRange(source)) {
				const {
					array,
					startIndex: sourceStartIndex,
					endIndex: sourceEndIndex,
				} = getRangeInfo(source, idGenerator);
				const destinationArraySchema = Tree.schema(destinationArrayNode);
				const allowedTypes = [
					...normalizeAllowedTypes(destinationArraySchema.info as ImplicitAllowedTypes),
				];
				for (let i = sourceStartIndex; i < sourceEndIndex; i++) {
					const nodeToMove = array.at(i);
					assert(nodeToMove !== undefined, 0xa78 /* node to move must exist */);
					if (!isNodeAllowedType(nodeToMove as TreeNode, allowedTypes)) {
						throw new UsageError("Illegal node type in destination array");
					}
				}
				destinationArrayNode.moveRangeToIndex(
					destinationIndex,
					sourceStartIndex,
					sourceEndIndex,
					array,
				);
			} else {
				throw new Error("Invalid source for move edit");
			}
			return { edit: treeEdit, diff };
		}
		default: {
			fail("invalid tree edit");
		}
	}
}

/**
 * Produces a useful, context-rich error message to give as a response to the LLM when it has produced an {@link ModifyEdit} that either references a nonexistant field or an invalid type for the selected field.
 * @param errorType - The type of error message to produce. You must determine the error type before calling this function.
 * - `'NONEXISTENT_FIELD'` is used when the field does not exist in the node's schema.
 * - `'INVALID_TYPE'` is used when the field exists but the type of the modification is invalid.
 */
function createInvalidModifyFeedbackMsg(
	modifyEdit: Modify,
	treeNode: TreeNode,
	errorType: "NONEXISTENT_FIELD" | "INVALID_TYPE",
): string {
	const { treeNodeSchema } = getSimpleNodeSchema(treeNode);
	const nodeFieldSchemas = treeNodeSchema.info as Record<string, ImplicitFieldSchema>;
	const messagePrefix = `You attempted an invalid modify edit on the node with id '${modifyEdit.target.target}' and schema '${treeNodeSchema.identifier}'.`;
	let messageSuffix = "";
	const getAllowedTypeIdentifiers = (fieldName: string): string[] => {
		const targetFieldNodeSchema = nodeFieldSchemas[fieldName];
		return targetFieldNodeSchema instanceof FieldSchema
			? [...targetFieldNodeSchema.allowedTypeSet.values()].map((schema) => schema.identifier)
			: [(targetFieldNodeSchema as TreeNodeSchema).identifier];
	};

	if (errorType === "NONEXISTENT_FIELD") {
		const nodeFieldNames = Object.keys(nodeFieldSchemas);
		const closestPossibleFieldMatch = closest(modifyEdit.field, nodeFieldNames);
		const allowedTypeIdentifiers = getAllowedTypeIdentifiers(closestPossibleFieldMatch);
		const closestPossibleMatchForFieldMessage = ` If you are sure you are trying to modify this node, did you mean to use the field \`${closestPossibleFieldMatch}\` which has the following set of allowed types: \`[${allowedTypeIdentifiers.map((id) => `'${id}'`).join(", ")}]\`?`;
		messageSuffix = ` The node's field you selected for modification \`${modifyEdit.field}\` does not exist in this node's schema. The set of available fields for this node are: \`[${nodeFieldNames.map((field) => `'${field}'`).join(", ")}]\`.${closestPossibleMatchForFieldMessage}`;
	} else if (errorType === "INVALID_TYPE") {
		const allowedTypeIdentifiers = getAllowedTypeIdentifiers(modifyEdit.field);
		// TODO: If the invalid modification is a new object, it won't be clear what part of the object is invalid for the given type. If we could give some more detailed guidance on what was wrong with the object it would be ideal.
		messageSuffix = ` You cannot set the node's field \`${modifyEdit.field}\` to the value \`${modifyEdit.modification}\` with type \`${typeof modifyEdit.modification}\` because this type is incompatible with all of the types allowed by the field's schema. The set of allowed types are \`[${allowedTypeIdentifiers.map((id) => `'${id}'`).join(", ")}]\`.`;
	}

	return messagePrefix + messageSuffix;
}

function isNodeAllowedType(node: TreeNode, allowedTypes: TreeNodeSchema[]): boolean {
	for (const allowedType of allowedTypes) {
		if (Tree.is(node, allowedType)) {
			return true;
		}
	}
	return false;
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

function isObjectTarget(selection: Selection): selection is ObjectTarget {
	return Object.keys(selection).length === 1 && "target" in selection;
}

function isRange(selection: Selection): selection is Range {
	return "from" in selection && "to" in selection;
}

interface RangeInfo {
	array: TreeArrayNode;
	startIndex: number;
	endIndex: number;
}

/**
 * Gets information about the range of nodes being targeted by an {@link Range}
 */
export function getRangeInfo(range: Range, idGenerator: IdGenerator): RangeInfo {
	const { array: arrayFrom, index: startIndex } = getPlaceInfo(range.from, idGenerator);
	const { array: arrayTo, index: endIndex } = getPlaceInfo(range.to, idGenerator);

	if (arrayFrom !== arrayTo) {
		throw new UsageError(
			'The "from" node and "to" nodes of the range must be in the same parent array.',
		);
	}

	return { array: arrayFrom, startIndex, endIndex };
}

function getPlaceInfo(
	place: ObjectPlace | ArrayPlace,
	idGenerator: IdGenerator,
): {
	array: TreeArrayNode;
	index: number;
} {
	if (place.type === "arrayPlace") {
		const parent = idGenerator.getNode(place.parentId) ?? fail("Expected parent node");
		const child = (parent as unknown as Record<string, unknown>)[place.field];
		if (child === undefined) {
			throw new UsageError(`No child under field field`);
		}
		const schema = Tree.schema(child as TreeNode);
		if (schema.kind !== NodeKind.Array) {
			throw new UsageError("Expected child to be in an array node");
		}
		return {
			array: child as TreeArrayNode,
			index: place.location === "start" ? 0 : (child as TreeArrayNode).length,
		};
	} else {
		const node = getNodeFromTarget(place, idGenerator);
		const nodeIndex = Tree.key(node);
		const parent = Tree.parent(node);
		if (parent === undefined) {
			throw new UsageError("TODO: root node target not supported");
		}
		const schema = Tree.schema(parent);
		if (schema.kind !== NodeKind.Array) {
			throw new UsageError("Expected child to be in an array node");
		}
		return {
			array: parent as unknown as TreeArrayNode,
			index: place.place === "before" ? (nodeIndex as number) : (nodeIndex as number) + 1,
		};
	}
}

/**
 * Returns the target node with the matching internal objectId using the provided {@link ObjectTarget}
 */
function getNodeFromTarget(target: ObjectTarget, idGenerator: IdGenerator): TreeNode {
	const node = idGenerator.getNode(target.target);
	assert(node !== undefined, 0xa79 /* objectId does not exist in nodeMap */);
	return node;
}

/**
 * Checks that the objectIds of the Tree Nodes within the givin the {@link TreeEdit} exist within the given {@link IdGenerator}
 *
 * @throws An {@link UsageError} if the objectIdKey does not exist in the {@link IdGenerator}
 */
function assertObjectIdsExist(treeEdit: TreeEdit, idGenerator: IdGenerator): void {
	switch (treeEdit.type) {
		case "insert": {
			if (treeEdit.destination.type === "objectPlace") {
				if (idGenerator.getNode(treeEdit.destination.target) === undefined) {
					throw new UsageError(`objectIdKey ${treeEdit.destination.target} does not exist`);
				}
			} else {
				if (idGenerator.getNode(treeEdit.destination.parentId) === undefined) {
					throw new UsageError(`objectIdKey ${treeEdit.destination.parentId} does not exist`);
				}
			}
			break;
		}
		case "remove": {
			if (isRange(treeEdit.source)) {
				const missingObjectIds = [
					treeEdit.source.from.target,
					treeEdit.source.to.target,
				].filter((id) => !idGenerator.getNode(id));

				if (missingObjectIds.length > 0) {
					throw new UsageError(`objectIdKeys [${missingObjectIds}] does not exist`);
				}
			} else if (
				isObjectTarget(treeEdit.source) &&
				idGenerator.getNode(treeEdit.source.target) === undefined
			) {
				throw new UsageError(`objectIdKey ${treeEdit.source.target} does not exist`);
			}
			break;
		}
		case "modify": {
			if (idGenerator.getNode(treeEdit.target.target) === undefined) {
				throw new UsageError(`objectIdKey ${treeEdit.target.target} does not exist`);
			}
			break;
		}
		case "move": {
			const invalidObjectIds: string[] = [];
			// check the source
			if (isRange(treeEdit.source)) {
				const missingObjectIds = [
					treeEdit.source.from.target,
					treeEdit.source.to.target,
				].filter((id) => !idGenerator.getNode(id));

				if (missingObjectIds.length > 0) {
					invalidObjectIds.push(...missingObjectIds);
				}
			} else if (
				isObjectTarget(treeEdit.source) &&
				idGenerator.getNode(treeEdit.source.target) === undefined
			) {
				invalidObjectIds.push(treeEdit.source.target);
			}

			// check the destination
			if (treeEdit.destination.type === "objectPlace") {
				if (idGenerator.getNode(treeEdit.destination.target) === undefined) {
					invalidObjectIds.push(treeEdit.destination.target);
				}
			} else {
				if (idGenerator.getNode(treeEdit.destination.parentId) === undefined) {
					invalidObjectIds.push(treeEdit.destination.parentId);
				}
			}
			if (invalidObjectIds.length > 0) {
				throw new UsageError(`objectIdKeys [${invalidObjectIds}] does not exist`);
			}
			break;
		}
		default: {
			break;
		}
	}
}

const createNodePathRecursive = (
	node: TreeNode | undefined,
	idGenerator: IdGenerator,
	currentPath: NodePath,
): NodePath => {
	if (node === undefined) {
		return currentPath;
	}

	currentPath.push({
		shortId: Tree.shortId(node),
		schemaIdentifier: Tree.schema(node).identifier,
		parentField: Tree.key(node),
	});

	const parentNode = Tree.parent(node);
	return createNodePathRecursive(parentNode, idGenerator, currentPath);
};

/**
 * Creates a diff for an Insert TreeEdit.
 *
 * @remarks
 * This function is only invoked within the "insert" case block.
 *
 * This must only be called AFTER an insertion is made.
 * It generates the insert diff after the node has been successfully inserted, as the node's index may
 * be required to support undoing the insert operation, and we don't know that index until the insert has been made.
 */
function createInsertDiff(
	newlyInsertedNode: TreeNode,
	aiExplanation: string,
	idGenerator: IdGenerator,
): InsertDiff {
	return {
		type: "insert",
		nodePath: createNodePathRecursive(newlyInsertedNode, idGenerator, []),
		nodeContent: JSON.parse(JSON.stringify(newlyInsertedNode)),
		aiExplanation,
	};
}

/**
 * Returns an object identical to the input except that the special 'objectIdKey' field (only intended for use by the LLM agent) is removed if present.
 * @remarks The input object is not modified.
 */
function removeAgentObjectIdField(oldValue: unknown): unknown {
	if (typeof oldValue === "object" && oldValue !== null && !Array.isArray(oldValue)) {
		const { [objectIdKey]: _, ...rest } = oldValue as Record<string, unknown>;
		return rest;
	}
	return oldValue;
}

/**
 * Creates a diff for a Modify TreeEdit.
 *
 * @remarks
 * This function must only be called BEFORE a modify edit is applied.
 * For move operations, the diff is created before the node(s) have been successfully moved,
 * since the original index is needed to restore the node(s) if the move operation need to undo.
 */
function createModifyDiff(treeEdit: Modify, idGenerator: IdGenerator): ModifyDiff {
	const targetNode = getNodeFromTarget(treeEdit.target, idGenerator);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
	const targetNodeAtField: unknown = (targetNode as any)[treeEdit.field];

	if (isPrimitive(targetNodeAtField)) {
		return {
			type: "modify",
			nodePath: createNodePathRecursive(targetNode, idGenerator, [
				{
					shortId: undefined,
					parentField: treeEdit.field,
					// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
					schemaIdentifier: getSchemaIdentifier(treeEdit.modification)!,
				},
			]),
			newValue: treeEdit.modification,
			oldValue: targetNodeAtField,
			aiExplanation: treeEdit.explanation,
		};
	}

	return {
		type: "modify",
		nodePath: createNodePathRecursive(targetNodeAtField as TreeNode, idGenerator, []),
		newValue: treeEdit.modification,
		oldValue: removeAgentObjectIdField(JSON.parse(JSON.stringify(targetNodeAtField))),
		aiExplanation: treeEdit.explanation,
	};
}

/**
 * Creates a diff for a Remove TreeEdit.
 *
 * @remarks
 * This function must only be called BEFORE a remove edit is applied.
 * It generates the remove diff before the node has been successfully removed, as the node's index may
 * be required to support undoing the remove operation, and we don't know that index until the remove has been made.
 */
function createRemoveDiff(
	treeEdit: Remove,
	idGenerator: IdGenerator,
): RemoveNodeDiff | ArraySingleRemoveDiff | ArrayRangeRemoveDiff {
	const source = treeEdit.source;
	if (isObjectTarget(source)) {
		const node = getNodeFromTarget(source, idGenerator);
		const parentNode = Tree.parent(node);
		if (parentNode === undefined) {
			throw new Error("Unexpectedly received a root node as the target of a remove edit");
		} else if (Tree.schema(parentNode).kind === NodeKind.Array) {
			const nodeIndex = Tree.key(node) as number;
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const targetRemovedNode = (parentNode as TreeArrayNode).at(nodeIndex)!;

			if (isPrimitive(targetRemovedNode)) {
				// Note that this cause should not be possible, still putting the error here in case things change so that this function is updated properly
				throw new Error(
					"Unexpectedly recieved a primitive node as the target of a remove edit",
				);
			}

			return {
				type: "remove",
				removalType: "remove-array-single",
				nodePath: createNodePathRecursive(targetRemovedNode as TreeNode, idGenerator, []),
				aiExplanation: treeEdit.explanation,
				nodeContent: removeAgentObjectIdField(JSON.parse(JSON.stringify(targetRemovedNode))),
			};
		} else {
			const fieldKey = Tree.key(node);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
			const targetNodeAtField: unknown = (parentNode as any)[fieldKey];

			if (isPrimitive(targetNodeAtField)) {
				// Note that this cause should not be possible, still putting the error here in case things change so that this function is updated properly
				throw new Error(
					"Unexpectedly recieved a primitive node as the target of a remove field edit",
				);
			}

			return {
				type: "remove",
				removalType: "remove-node",
				nodePath: createNodePathRecursive(targetNodeAtField as TreeNode, idGenerator, []),
				aiExplanation: treeEdit.explanation,
				nodeContent: removeAgentObjectIdField(JSON.parse(JSON.stringify(targetNodeAtField))),
			};
		}
	} else if (isRange(source)) {
		const { array, startIndex, endIndex } = getRangeInfo(source, idGenerator);
		const removedNodePaths: NodePath[] = [];
		const removedNodes: TreeNode[] = [];
		for (let i = startIndex; i < endIndex; i++) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const nodeToRemove = array.at(i)!;
			if (!isPrimitive(nodeToRemove)) {
				removedNodePaths.push(
					createNodePathRecursive(nodeToRemove as TreeNode, idGenerator, []),
				);
				removedNodes.push(nodeToRemove as TreeNode);
			}
		}
		return {
			type: "remove",
			removalType: "remove-array-range",
			nodePaths: removedNodePaths,
			aiExplanation: treeEdit.explanation,
			nodeContents: removedNodes.map((node) =>
				removeAgentObjectIdField(JSON.parse(JSON.stringify(node))),
			),
		};
	} else {
		throw new Error("Invalid source encountered when trying to create diff for remove edit");
	}
}

/**
 * Creates a diff for a Move TreeEdit.
 *
 * @remarks
 * This function must only be called BEFORE a move edit is applied.
 * For move operations, the diff is created before the node(s) have been successfully moved,
 * since the original index is needed to restore the node(s) if the move operation need to undo.
 */
function createMoveDiff(
	treeEdit: Move,
	idGenerator: IdGenerator,
): MoveSingleDiff | MoveRangeDiff {
	const source = treeEdit.source;
	const destination = treeEdit.destination;
	const { array: destinationArrayNode } = getPlaceInfo(destination, idGenerator);

	if (isObjectTarget(source)) {
		const node = getNodeFromTarget(source, idGenerator);
		return {
			type: "move",
			moveType: "move-single",
			sourceNodePath: createNodePathRecursive(node, idGenerator, []),
			destinationNodePath: createNodePathRecursive(destinationArrayNode, idGenerator, []),
			aiExplanation: treeEdit.explanation,
			nodeContent: removeAgentObjectIdField(JSON.parse(JSON.stringify(node))),
		};
	} else if (isRange(source)) {
		const {
			array,
			startIndex: sourceStartIndex,
			endIndex: sourceEndIndex,
		} = getRangeInfo(source, idGenerator);

		const movedNodePaths: NodePath[] = [];
		const movedNodes: TreeNode[] = [];
		for (let i = sourceStartIndex; i < sourceEndIndex; i++) {
			const nodeToMove = array.at(i);
			if (!isPrimitive(nodeToMove)) {
				movedNodePaths.push(createNodePathRecursive(nodeToMove as TreeNode, idGenerator, []));
				movedNodes.push(nodeToMove as TreeNode);
			}
		}

		return {
			type: "move",
			moveType: "move-range",
			sourceNodePaths: movedNodePaths,
			destinationNodePath: createNodePathRecursive(destinationArrayNode, idGenerator, []),
			aiExplanation: treeEdit.explanation,
			nodeContents: movedNodes.map((node) =>
				removeAgentObjectIdField(JSON.parse(JSON.stringify(node))),
			),
		};
	} else {
		throw new Error("Invalid source for move edit");
	}
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
