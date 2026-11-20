/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseProperties } from "@fluidframework/core-interfaces";
import { assert, fail } from "@fluidframework/core-utils/internal";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";
import { tagSchemaArtifacts, UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	aboveRootPlaceholder,
	EmptyKey,
	identifierFieldKindIdentifier,
	keyAsDetachedField,
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	ObjectNodeStoredSchema,
	ValueSchema,
	type FieldKey,
	type IForestSubscription,
	type SchemaAndPolicy,
	type SchemaPolicy,
	type TreeChunk,
	type TreeFieldStoredSchema,
	type TreeNodeStoredSchema,
	type TreeTypeSet,
} from "../../core/index.js";
import {
	allowsValue,
	combineChunks,
	compliesWithMultiplicity,
	chunkFieldForForest,
	FieldKinds,
	getSchemaAndPolicy,
	SchemaValidationError,
	throwOutOfSchema,
	TreeStatus,
	type FlexTreeHydratedContext,
	type HydratedFlexTreeNode,
} from "../../feature-libraries/index.js";
import { brand, getOrCreate, validateIndex } from "../../util/index.js";
import { getInnerNode, getKernel, NodeKind, type TreeNode } from "../core/index.js";
import { isObjectNodeSchema } from "../node-kinds/index.js";

import { verboseTreeAdapter, type VerboseTree, type VerboseTreeNode } from "./verboseTree.js";

/**
 * Reads {@link VerboseTree} data whose object nodes use stored keys.
 */
const storedKeyAdapter = verboseTreeAdapter({});

/**
 * Implementation of {@link (TreeAlpha:interface).insertVerbose}.
 */
export function insertVerbose(
	array: TreeNode,
	index: number,
	content: readonly VerboseTree[],
): void {
	const flexNode = getFlexNodeInDocument(array, "insertVerbose");
	if (getKernel(array).schema.kind !== NodeKind.Array) {
		throw new UsageError(
			"insertVerbose requires an array node: use setVerbose for other nodes.",
		);
	}
	const field = flexNode.getBoxed(EmptyKey);
	validateIndex(index, field, "TreeAlpha.insertVerbose", true);
	const fieldSchema = getStoredSchema(flexNode).getFieldSchema(EmptyKey);
	const checked = new VerboseContentChecker(flexNode.context).checkChildren(
		content,
		fieldSchema.types,
	);
	const { editor, forest } = flexNode.context.checkout;
	editor
		.sequenceField(field.getFieldPath())
		.insert(index, combineChunks(chunkVerboseContent(forest, checked)));
}

/**
 * Implementation of {@link (TreeAlpha:interface).setVerbose}.
 */
export function setVerbose(
	parent: TreeNode,
	key: string,
	content: VerboseTree | undefined,
): void {
	const flexNode = getFlexNodeInDocument(parent, "setVerbose");
	const schema = getKernel(parent).schema;
	let storedKey: FieldKey;
	switch (schema.kind) {
		case NodeKind.Object: {
			assert(isObjectNodeSchema(schema), "Expected object schema");
			const fieldSchema = schema.fields.get(key);
			if (fieldSchema === undefined) {
				throw new UsageError(
					`${JSON.stringify(key)} is not a property of ${schema.identifier}.`,
				);
			}
			storedKey = brand(fieldSchema.storedKey);
			break;
		}
		case NodeKind.Map:
		case NodeKind.Record: {
			storedKey = brand(key);
			break;
		}
		default: {
			throw new UsageError(
				"setVerbose requires an object, map or record node: use insertVerbose for array nodes.",
			);
		}
	}

	const field = flexNode.getBoxed(storedKey);
	const required = field.schema === FieldKinds.required.identifier;
	if (!required && field.schema !== FieldKinds.optional.identifier) {
		throw new UsageError(`The field ${JSON.stringify(key)} cannot be set.`);
	}
	if (content === undefined && field.length === 0) {
		return;
	}
	const checked = new VerboseContentChecker(flexNode.context).checkField(
		content === undefined ? [] : [content],
		getStoredSchema(flexNode).getFieldSchema(storedKey),
	);
	const { editor, forest } = flexNode.context.checkout;
	const newContent =
		checked.length === 0 ? undefined : combineChunks(chunkVerboseContent(forest, checked));
	const path = field.getFieldPath();
	if (required) {
		assert(
			newContent !== undefined,
			"A required field must have been checked to have content",
		);
		editor.valueField(path).set(newContent);
	} else {
		editor.optionalField(path).set(newContent, field.length === 0);
	}
}

/**
 * Gets the flex tree node of `node`, which must be in the document of a tree.
 */
function getFlexNodeInDocument(node: TreeNode, apiName: string): HydratedFlexTreeNode {
	if (getKernel(node).getStatus() !== TreeStatus.InDocument) {
		throw new UsageError(
			`${apiName} requires a node in a document. Content for unhydrated nodes can be created with importVerbose.`,
		);
	}
	const flexNode = getInnerNode(node);
	assert(flexNode.isHydrated(), "A node in the document must be hydrated");
	return flexNode;
}

function getStoredSchema(flexNode: HydratedFlexTreeNode): TreeNodeStoredSchema {
	return (
		flexNode.context.schema.nodeSchema.get(flexNode.type) ??
		fail("A node in the document must have a stored schema")
	);
}

/**
 * Chunks checked content for insertion into `forest`.
 */
function chunkVerboseContent(
	forest: IForestSubscription,
	content: readonly VerboseTree[],
): TreeChunk[] {
	const root: VerboseTreeNode = {
		type: aboveRootPlaceholder,
		fields: content as VerboseTree[],
	};
	return chunkFieldForForest(forest, storedKeyAdapter, root, keyAsDetachedField(EmptyKey));
}

function isVerboseTreeNode(node: VerboseTree): node is VerboseTreeNode {
	return typeof node === "object" && node !== null && !isFluidHandle(node);
}

/**
 * The children of the field `key` of `node`.
 */
function getChildren(node: VerboseTreeNode, key: FieldKey): readonly VerboseTree[] {
	const fields = node.fields;
	if (Array.isArray(fields)) {
		return key === EmptyKey ? fields : [];
	}
	if (!Object.prototype.hasOwnProperty.call(fields, key)) {
		return [];
	}
	const child = fields[key];
	return child === undefined ? [] : [child];
}

/**
 * The keys of the non-empty fields of `node`.
 */
function getNonEmptyFieldKeys(node: VerboseTreeNode): FieldKey[] {
	const fields = node.fields;
	if (Array.isArray(fields)) {
		return fields.length === 0 ? [] : [EmptyKey];
	}
	return Object.keys(fields).filter((key) => fields[key] !== undefined) as FieldKey[];
}

/**
 * The number of non-empty fields of `node`.
 */
function countNonEmptyFields(node: VerboseTreeNode): number {
	const fields = node.fields;
	if (Array.isArray(fields)) {
		return fields.length === 0 ? 0 : 1;
	}
	let count = 0;
	for (const key of Object.keys(fields)) {
		if (fields[key] !== undefined) {
			count++;
		}
	}
	return count;
}

/**
 * Checks {@link VerboseTree} content with stored keys against the stored schema of a tree it is inserted into.
 *
 * @remarks
 * Applies the checks {@link isFieldInSchema} applies to other content inserted into the tree, and reports errors the same way.
 * An identifier field without content gets a new identifier from the tree, as when constructing a node.
 * Content is not modified: nodes which get identifiers are copied (along with their ancestors in the content),
 * with their fields in the order of the stored schema.
 */
class VerboseContentChecker {
	private readonly schemaAndPolicy: SchemaAndPolicy;

	/**
	 * The path, from the inserted content, to the field or node being checked.
	 */
	private readonly path: (string | number)[] = [];

	public constructor(private readonly context: FlexTreeHydratedContext) {
		this.schemaAndPolicy = getSchemaAndPolicy(context);
	}

	/**
	 * Checks `children` as the content of a field with schema `fieldSchema`.
	 * @returns `children`, or a copy of it holding nodes which got identifiers.
	 */
	public checkField(
		children: readonly VerboseTree[],
		fieldSchema: TreeFieldStoredSchema,
	): readonly VerboseTree[] {
		const kind = this.schemaAndPolicy.policy.fieldKinds.get(fieldSchema.kind);
		if (kind === undefined) {
			this.fail(SchemaValidationError.Field_KindNotInSchemaPolicy, {
				fieldKind: fieldSchema.kind,
			});
		}
		const multiplicityError = compliesWithMultiplicity(children.length, kind.multiplicity);
		if (multiplicityError !== undefined) {
			this.fail(
				multiplicityError,
				{ fieldKind: fieldSchema.kind },
				{ childCount: children.length },
			);
		}
		return this.checkChildren(children, fieldSchema.types);
	}

	/**
	 * Checks that each of `children` is a node of one of `types` in schema.
	 * @returns `children`, or a copy of it holding nodes which got identifiers.
	 */
	public checkChildren(
		children: readonly VerboseTree[],
		types: TreeTypeSet,
	): readonly VerboseTree[] {
		let result: VerboseTree[] | undefined;
		for (let index = 0; index < children.length; index++) {
			// Not `?? oob()`: a child can be `null` (a null leaf).
			const child = children[index] as VerboseTree;
			this.path.push(index);
			const type = storedKeyAdapter.type(child);
			if (!types.has(type)) {
				this.fail(SchemaValidationError.Field_NodeTypeNotAllowed, {
					nodeType: type,
					allowedTypes: JSON.stringify([...types].sort()),
				});
			}
			const checked = this.checkNode(child, type);
			this.path.pop();
			if (checked !== child) {
				result ??= [...children];
				result[index] = checked;
			}
		}
		return result ?? children;
	}

	private checkNode(node: VerboseTree, type: string): VerboseTree {
		const schema = this.schemaAndPolicy.schema.nodeSchema.get(brand(type));
		if (schema === undefined) {
			this.fail(SchemaValidationError.Node_MissingSchema, { nodeType: type });
		}
		if (schema instanceof LeafNodeStoredSchema) {
			if (isVerboseTreeNode(node)) {
				const keys = getNonEmptyFieldKeys(node);
				if (keys.length > 0) {
					this.fail(SchemaValidationError.LeafNode_FieldsNotAllowed, {
						nodeType: type,
						unexpectedFields: JSON.stringify(keys.sort()),
					});
				}
			}
			const value = isVerboseTreeNode(node) ? undefined : node;
			if (!allowsValue(schema.leafValue, value)) {
				this.fail(
					SchemaValidationError.LeafNode_InvalidValue,
					{ nodeType: type, expectedValueType: ValueSchema[schema.leafValue] },
					{ actualValueType: value === null ? "null" : typeof value },
				);
			}
			return node;
		}
		if (!isVerboseTreeNode(node)) {
			this.fail(
				SchemaValidationError.NonLeafNode_ValueNotAllowed,
				{ nodeType: type },
				{ actualValueType: node === null ? "null" : typeof node },
			);
		}
		if (schema instanceof ObjectNodeStoredSchema) {
			return this.checkObjectNode(node, schema);
		}
		if (schema instanceof MapNodeStoredSchema) {
			return this.checkMapNode(node, schema);
		}
		fail("Unknown TreeNodeStoredSchema type");
	}

	private checkObjectNode(
		node: VerboseTreeNode,
		schema: ObjectNodeStoredSchema,
	): VerboseTreeNode {
		// Fields whose checked content differs from the node's.
		let replaced: Map<FieldKey, readonly VerboseTree[]> | undefined;
		let nonEmptyFieldCount = 0;
		for (const { key, schema: fieldSchema, checkWhenEmpty } of getObjectFieldChecks(
			this.schemaAndPolicy.policy,
			schema,
		)) {
			const children = getChildren(node, key);
			let content = children;
			if (children.length > 0) {
				nonEmptyFieldCount++;
			} else if (!checkWhenEmpty) {
				continue;
			} else if (fieldSchema.kind === identifierFieldKindIdentifier) {
				const { nodeKeyManager } = this.context;
				content = [
					nodeKeyManager.stabilizeNodeIdentifier(nodeKeyManager.generateLocalNodeIdentifier()),
				];
			}
			this.path.push(key);
			const checked = this.checkField(content, fieldSchema);
			this.path.pop();
			if (checked !== children) {
				replaced ??= new Map();
				replaced.set(key, checked);
			}
		}

		// The stored schema of a node does not allow fields it does not list,
		// whether or not the view schema allows unknown optional fields.
		if (countNonEmptyFields(node) !== nonEmptyFieldCount) {
			this.fail(SchemaValidationError.ObjectNode_FieldNotInSchema, {
				nodeType: node.type,
				unexpectedFields: JSON.stringify(
					getNonEmptyFieldKeys(node)
						.filter((key) => !schema.objectNodeFields.has(key))
						.sort(),
				),
			});
		}

		if (replaced === undefined) {
			return node;
		}
		const sequence = replaced.get(EmptyKey);
		if (Array.isArray(node.fields) && sequence !== undefined && replaced.size === 1) {
			return { type: node.type, fields: [...sequence] };
		}
		const fields: Exclude<VerboseTreeNode["fields"], unknown[]> = {};
		for (const key of schema.objectNodeFields.keys()) {
			const children = replaced.get(key) ?? getChildren(node, key);
			assert(
				children.length <= 1,
				"Only the field of an array node can have several children",
			);
			if (children.length > 0) {
				defineField(fields, key, children[0] as VerboseTree);
			}
		}
		return { type: node.type, fields };
	}
	private checkMapNode(node: VerboseTreeNode, schema: MapNodeStoredSchema): VerboseTreeNode {
		if (Array.isArray(node.fields)) {
			// Children in an array are the field under the empty key.
			const children = node.fields;
			if (children.length === 0) {
				return node;
			}
			this.path.push(EmptyKey);
			const checked = this.checkField(children, schema.mapFields);
			this.path.pop();
			return checked === children ? node : { type: node.type, fields: [...checked] };
		}
		let fields: Exclude<VerboseTreeNode["fields"], unknown[]> | undefined;
		for (const key of getNonEmptyFieldKeys(node)) {
			const children = getChildren(node, key);
			this.path.push(key);
			const checked = this.checkField(children, schema.mapFields);
			this.path.pop();
			if (checked !== children) {
				fields ??= { ...node.fields };
				defineField(fields, key, checked[0] as VerboseTree);
			}
		}
		return fields === undefined ? node : { type: node.type, fields };
	}

	private fail(
		error: SchemaValidationError,
		schemaArtifacts: Record<string, string>,
		properties?: ITelemetryBaseProperties,
	): never {
		throwOutOfSchema({
			error,
			path: [...this.path],
			telemetryProperties: { ...tagSchemaArtifacts(schemaArtifacts), ...properties },
		});
	}
}

/**
 * A field of an object node's stored schema, as {@link VerboseContentChecker} checks it.
 */
interface ObjectFieldCheck {
	readonly key: FieldKey;
	readonly schema: TreeFieldStoredSchema;
	/**
	 * Whether the field is checked when a node has no content for it.
	 * @remarks
	 * Checking an empty field can only fail (when its kind is not in the schema policy or requires content)
	 * or give it content (an identifier field gets a new identifier): other empty fields are skipped.
	 */
	readonly checkWhenEmpty: boolean;
}

/**
 * For each schema policy, the {@link ObjectFieldCheck}s of each object node stored schema, in the order of its fields.
 */
const objectFieldChecks = new WeakMap<
	SchemaPolicy,
	WeakMap<ObjectNodeStoredSchema, readonly ObjectFieldCheck[]>
>();

function getObjectFieldChecks(
	policy: SchemaPolicy,
	schema: ObjectNodeStoredSchema,
): readonly ObjectFieldCheck[] {
	const bySchema = getOrCreate(objectFieldChecks, policy, () => new WeakMap());
	return getOrCreate(bySchema, schema, () =>
		Array.from(schema.objectNodeFields, ([key, fieldSchema]): ObjectFieldCheck => {
			const kind = policy.fieldKinds.get(fieldSchema.kind);
			return {
				key,
				schema: fieldSchema,
				checkWhenEmpty:
					kind === undefined ||
					fieldSchema.kind === identifierFieldKindIdentifier ||
					compliesWithMultiplicity(0, kind.multiplicity) !== undefined,
			};
		}),
	);
}

/**
 * Sets the field `key` of `fields` to `child`, as an own property even when `key` is the name of an inherited property.
 */
function defineField(
	fields: Exclude<VerboseTreeNode["fields"], unknown[]>,
	key: string,
	child: VerboseTree,
): void {
	Object.defineProperty(fields, key, {
		value: child,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}
