/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */
import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	TreeSchema,
	TreeFieldSchema as FlexTreeFieldSchema,
	FieldKind as FlexFieldKind,
	FieldKinds,
	AllowedTypes as FlexAllowedTypes,
	TreeNodeSchemaBase as FlexTreeNodeSchemaBase,
	TreeNodeSchema as FlexTreeNodeSchema,
	defaultSchemaPolicy,
	MapNodeSchema as FlexMapNodeSchema,
	FieldNodeSchema as FlexFieldNodeSchema,
	ObjectNodeSchema as FlexObjectNodeSchema,
	schemaIsLeaf,
} from "../feature-libraries";
import { brand, fail, getOrCreate, isReadonlyArray, mapIterable } from "../util";
import { normalizeFlexListEager } from "../feature-libraries/typed-schema/flexList";
import { extractFactoryContent, getClassSchema, simpleSchemaSymbol } from "../simple-tree/proxies";
import { AllowedUpdateType, ITreeCursorSynchronous, TreeNodeSchemaIdentifier } from "../core";
import { type InitializeAndSchematizeConfiguration } from "../shared-tree";
import { cursorFromNodeData } from "../simple-tree/toMapTree";
import {
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	TreeNodeSchema,
} from "./schemaTypes";
import { TreeConfiguration } from "./tree";

/**
 * Returns a cursor (in nodes mode) for the root node.
 *
 * @privateRemarks
 * Ideally this would work on any node, not just the root,
 * and the schema would come from the unhydrated node.
 * For now though, this is the only case that's needed, and we do have the data to make it work, so this is fine.
 */
export function cursorFromUnhydratedRoot(
	schema: TreeSchema,
	tree: InsertableTreeNodeFromImplicitAllowedTypes,
): ITreeCursorSynchronous {
	const data = extractFactoryContent(tree);
	return (
		cursorFromNodeData(data.content, { schema }, schema.rootFieldSchema.types) ??
		fail("failed to decode tree")
	);
}

export function toFlexConfig(config: TreeConfiguration): InitializeAndSchematizeConfiguration {
	const schema = toFlexSchema(config.schema);
	const unhydrated = config.initialTree();
	const initialTree =
		unhydrated === undefined ? undefined : [cursorFromUnhydratedRoot(schema, unhydrated)];
	return {
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
		initialTree,
	};
}

/**
 * Generate a {@link TreeSchema} with `root` as the root field.
 *
 * This also has the side effect of populating the cached view schema on the class based schema.
 */
export function toFlexSchema(root: ImplicitFieldSchema): TreeSchema {
	const schemaMap: Map<TreeNodeSchemaIdentifier, () => FlexTreeNodeSchema> = new Map();
	const field = convertField(schemaMap, root);
	const nodeSchema = new Map(
		mapIterable(schemaMap, ([key, value]) => {
			const schema = value();
			const classSchema = getClassSchema(schema);
			if (classSchema === undefined) {
				assert(schemaIsLeaf(schema), "invalid leaf");
			} else {
				assert(
					cachedFlexSchemaFromClassSchema(classSchema) === schema,
					"mismatched schema",
				);
			}
			return [key, value()];
		}),
	);

	const typed: TreeSchema = {
		nodeSchema,
		adapters: {},
		rootFieldSchema: field,
		policy: defaultSchemaPolicy,
	};
	return typed;
}

/**
 * Return a flex schema for the provided class schema.
 *
 * This also has the side effect of populating the cached view schema on the class based schema.
 */
export function getFlexSchema(root: TreeNodeSchema): FlexTreeNodeSchema {
	const treeSchema = toFlexSchema(root);
	return treeSchema.rootFieldSchema.monomorphicChildType ?? fail("root should be monomorphic");
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function convertField(
	schemaMap: Map<TreeNodeSchemaIdentifier, () => FlexTreeNodeSchema>,
	schema: ImplicitFieldSchema,
): FlexTreeFieldSchema {
	let kind: FlexFieldKind;
	let types: ImplicitAllowedTypes;
	if (schema instanceof FieldSchema) {
		kind = convertFieldKind.get(schema.kind) ?? fail("Invalid field kind");
		types = schema.allowedTypes;
	} else {
		kind = FieldKinds.required;
		types = schema;
	}
	const allowedTypes = convertAllowedTypes(schemaMap, types);
	return FlexTreeFieldSchema.create(kind, allowedTypes);
}

const convertFieldKind = new Map<FieldKind, FlexFieldKind>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
]);

/**
 * Normalizes an {@link ImplicitAllowedTypes} into an {@link AllowedTypes}.
 */
export function convertAllowedTypes(
	schemaMap: Map<TreeNodeSchemaIdentifier, () => FlexTreeNodeSchema>,
	schema: ImplicitAllowedTypes,
): FlexAllowedTypes {
	if (isReadonlyArray(schema)) {
		return normalizeFlexListEager(schema).map((item) => convertNodeSchema(schemaMap, item));
	}
	return [convertNodeSchema(schemaMap, schema)];
}

const builder = { name: "simple schema" };

/**
 * Converts a {@link TreeNodeSchema} into a {@link FlexTreeNodeSchema}.
 * Ensures all types reachable from `schema` are included in `schemaMap`.
 *
 * Return value (and entries in map) are lazy to allow recursive types to work.
 * This laziness does NOT extend to adding entries to `schemaMap`:
 * all referenced types are added to it before this function returns.
 */
export function convertNodeSchema(
	schemaMap: Map<TreeNodeSchemaIdentifier, () => FlexTreeNodeSchema>,
	schema: TreeNodeSchema,
): () => FlexTreeNodeSchema {
	// TODO: nice error if multiple schema have the same identifier
	const final = getOrCreate(schemaMap, schema.identifier, () => () => {
		let out: FlexTreeNodeSchema;
		const kind = schema.kind;
		switch (kind) {
			case NodeKind.Leaf: {
				const cached =
					cachedFlexSchemaFromClassSchema(schema) ??
					fail("leaf schema should be pre-cached");
				assert(schemaIsLeaf(cached), "expected leaf");
				return cached;
			}
			case NodeKind.Map: {
				const fieldInfo = schema.info as ImplicitAllowedTypes;
				const field = FlexTreeFieldSchema.create(
					FieldKinds.optional,
					convertAllowedTypes(schemaMap, fieldInfo),
				);
				// Lookup of cached schema is done here instead of before since walking the schema recursively to populate schemaMap is still required.
				const cached = cachedFlexSchemaFromClassSchema(schema);
				out = cached ?? FlexMapNodeSchema.create(builder, brand(schema.identifier), field);
				break;
			}
			case NodeKind.List: {
				const fieldInfo = schema.info as ImplicitAllowedTypes;
				const field = FlexTreeFieldSchema.create(
					FieldKinds.sequence,
					convertAllowedTypes(schemaMap, fieldInfo),
				);
				const cached = cachedFlexSchemaFromClassSchema(schema);
				out =
					cached ?? FlexFieldNodeSchema.create(builder, brand(schema.identifier), field);
				break;
			}
			case NodeKind.Object: {
				const info = schema.info as Record<string, ImplicitFieldSchema>;
				const fields: Record<string, FlexTreeFieldSchema> = Object.create(null);
				for (const [key, value] of Object.entries(info)) {
					// This code has to be careful to avoid assigning to __proto__ or similar built-in fields.
					Object.defineProperty(fields, key, {
						enumerable: true,
						configurable: false,
						writable: false,
						value: convertField(schemaMap, value),
					});
				}
				const cached = cachedFlexSchemaFromClassSchema(schema);
				out =
					cached ??
					FlexObjectNodeSchema.create(builder, brand(schema.identifier), fields);
				break;
			}
			default:
				unreachableCase(kind);
		}
		assert(out instanceof FlexTreeNodeSchemaBase, "invalid schema produced");
		{
			const cached = cachedFlexSchemaFromClassSchema(schema);
			if (cached !== undefined) {
				assert(
					cachedFlexSchemaFromClassSchema(schema) === out,
					"incorrect flexSchemaSymbol",
				);
			} else {
				setFlexSchemaFromClassSchema(schema, out);
			}
		}
		(out as any)[simpleSchemaSymbol] = schema;
		return out;
	});
	return final;
}

/**
 * A symbol for storing FlexTreeSchema on TreeNodeSchema.
 * Eagerly set on leaves, and lazily set for other cases.
 */
export const flexSchemaSymbol: unique symbol = Symbol(`flexSchema`);

export function cachedFlexSchemaFromClassSchema(
	schema: TreeNodeSchema,
): FlexTreeNodeSchemaBase | undefined {
	return (schema as any)[flexSchemaSymbol] as FlexTreeNodeSchemaBase | undefined;
}

export function setFlexSchemaFromClassSchema(
	simple: TreeNodeSchema,
	flex: FlexTreeNodeSchemaBase,
): void {
	(simple as any)[flexSchemaSymbol] = flex;
}
