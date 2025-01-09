/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils";
import { UsageError } from "@fluidframework/telemetry-utils/internal";
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
} from "./agentEditTypes.js";
import type { IdGenerator } from "./idGenerator.js";
import type { JsonValue } from "./jsonTypes.js";
import { toDecoratedJson } from "./promptGeneration.js";
import { fail, findClosestStringMatch } from "./utils.js";

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

function getSchemaIdentifier(content: TreeEditValue): string | undefined {
	const sf = new SchemaFactory(undefined);

	switch (typeof content) {
		case "boolean": {
			return sf.boolean.identifier;
		}
		case "number": {
			return sf.number.identifier;
		}
		case "string": {
			return sf.string.identifier;
		}
		case "object": {
			if (content === null) {
				return sf.null.identifier;
			}
			if (Array.isArray(content)) {
				throw new UsageError("Arrays are not currently supported in this context");
			}
			if (isFluidHandle(content)) {
				return sf.handle.identifier;
			}
			return content[typeField];
		}
		default: {
			throw new UsageError("Unsupported content type");
		}
	}
}

function contentWithIds(content: TreeNode, idGenerator: IdGenerator): TreeEditObject {
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
): TreeEdit {
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
						...treeEdit,
						content: contentWithIds(insertNode, idGenerator),
					};
				}
			}
			fail("inserted node must be of an allowed type");
		}
		case "remove": {
			const source = treeEdit.source;
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
					(parentNode as TreeArrayNode).removeAt(nodeIndex);
				} else {
					const fieldKey = Tree.key(node);
					const parentSchema = Tree.schema(parentNode);
					const fieldSchema =
						(parentSchema.info as Record<string, ImplicitFieldSchema>)[fieldKey] ??
						fail("Expected field schema");
					if (fieldSchema instanceof FieldSchema && fieldSchema.kind === FieldKind.Optional) {
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
				array.removeRange(startIndex, endIndex);
			}
			return treeEdit;
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
			// if fieldSchema is a LeafnodeSchema, we can check that it's a valid type and set the field.
			if (isPrimitive(modification)) {
				try {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(node as any)[treeEdit.field] = modification;
				} catch (error) {
					if (error instanceof UsageError) {
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
					}
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
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(node as any)[treeEdit.field] = constructedModification;
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
					(node as any)[treeEdit.field] = constructedModification;
				}
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
				? treeEdit
				: {
						...treeEdit,
						modification: contentWithIds(insertedObject, idGenerator),
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
			}
			return treeEdit;
		}
		default: {
			fail("invalid tree edit");
		}
	}
}

/**
 * Produces a useful, context-rich error message for the LLM when the LLM produces an {@link ModifyEdit} that either references a nonexistant field or an invalid type for the selected field.
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
	if (errorType === "NONEXISTENT_FIELD") {
		const nodeFieldNames = Object.keys(nodeFieldSchemas);
		const closestPossibleMatchForField = findClosestStringMatch(
			modifyEdit.field,
			nodeFieldNames,
		);

		let closestPossibleMatchForFieldMessage = "";
		if (closestPossibleMatchForField !== "") {
			const targetFieldNodeSchema = nodeFieldSchemas[closestPossibleMatchForField];
			const allowedTypeIdentifiers: string[] =
				targetFieldNodeSchema instanceof FieldSchema
					? [...targetFieldNodeSchema.allowedTypeSet.values()].map(
							(schema) => schema.identifier,
						)
					: [(targetFieldNodeSchema as TreeNodeSchema).identifier];
			closestPossibleMatchForFieldMessage = ` If you are sure you are trying to modify this node, did you mean to use the field \`${closestPossibleMatchForField}\` which has the following set of allowed types: \`[${allowedTypeIdentifiers.map((id) => `'${id}'`).join(", ")}]\`?`;
		}

		messageSuffix = ` The node's field you selected for modification \`${modifyEdit.field}\` does not exist in this nodes schema. The set of available fields for this node are: \`[${nodeFieldNames.map((field) => `'${field}'`).join(", ")}]\`.${closestPossibleMatchForFieldMessage}`;
	} else if (errorType === "INVALID_TYPE") {
		const targetFieldNodeSchema = nodeFieldSchemas[modifyEdit.field];
		const allowedTypeIdentifiers =
			targetFieldNodeSchema instanceof FieldSchema
				? [
						[...targetFieldNodeSchema.allowedTypeSet.values()].map(
							(schema) => schema.identifier,
						),
					]
				: [(targetFieldNodeSchema as TreeNodeSchema).identifier];

		// TODO: If the invalid modification is a new object, it won't be clear what part of the object is invalid for the given type. If we could give some more detailed guidance on what was wrong with the object it would be ideal.
		messageSuffix = ` You cannot set the node's field \`${modifyEdit.field}\` to the value \`${modifyEdit.modification}\` with type \`${typeof modifyEdit.modification}\` because this type is incompatible with all of the types allowed by the node's schema. The set of allowed types are \`[${allowedTypeIdentifiers.map((id) => `'${id}'`).join(", ")}]\`.`;
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

function getRangeInfo(range: Range, idGenerator: IdGenerator): RangeInfo {
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

interface SchemaInfo {
	treeNodeSchema: TreeNodeSchema;
	simpleNodeSchema: new (dummy: unknown) => TreeNode;
}

function getSimpleNodeSchema(node: TreeNode): SchemaInfo {
	const treeNodeSchema = Tree.schema(node);
	const simpleNodeSchema = treeNodeSchema as unknown as new (dummy: unknown) => TreeNode;
	return { treeNodeSchema, simpleNodeSchema };
}
