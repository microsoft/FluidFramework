/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */
import { assert, unreachableCase } from "@fluidframework/core-utils";
import {
	FlexTreeSchema,
	FlexFieldSchema,
	FlexFieldKind,
	FieldKinds,
	FlexAllowedTypes,
	TreeNodeSchemaBase,
	FlexTreeNodeSchema,
	defaultSchemaPolicy,
	FlexMapNodeSchema,
	FlexFieldNodeSchema,
	FlexObjectNodeSchema,
	schemaIsLeaf,
} from "../feature-libraries/index.js";
import { brand, fail, isReadonlyArray, mapIterable } from "../util/index.js";
import { normalizeFlexListEager } from "../feature-libraries/typed-schema/flexList.js";
import { ITreeCursorSynchronous, TreeNodeSchemaIdentifier } from "../core/index.js";
import { TreeContent } from "../shared-tree/index.js";
import {
	InsertableContent,
	extractFactoryContent,
	getClassSchema,
	simpleSchemaSymbol,
} from "./proxies.js";
import { cursorFromNodeData } from "./toMapTree.js";
import {
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	InsertableTreeNodeFromImplicitAllowedTypes,
	NodeKind,
	TreeNodeSchema,
} from "./schemaTypes.js";
import { TreeConfiguration } from "./tree.js";

/**
 * Returns a cursor (in nodes mode) for the root node.
 *
 * @privateRemarks
 * Ideally this would work on any node, not just the root,
 * and the schema would come from the unhydrated node.
 * For now though, this is the only case that's needed, and we do have the data to make it work, so this is fine.
 */
export function cursorFromUnhydratedRoot(
	schema: FlexTreeSchema,
	tree: InsertableTreeNodeFromImplicitAllowedTypes,
): ITreeCursorSynchronous {
	const data = extractFactoryContent(tree as InsertableContent);
	return (
		cursorFromNodeData(data.content, schema, schema.rootFieldSchema.allowedTypeSet) ??
		fail("failed to decode tree")
	);
}

export function toFlexConfig(config: TreeConfiguration): TreeContent {
	const schema = toFlexSchema(config.schema);
	const unhydrated = config.initialTree();
	const initialTree =
		unhydrated === undefined ? undefined : [cursorFromUnhydratedRoot(schema, unhydrated)];
	return {
		schema,
		initialTree,
	};
}

interface SchemaInfo {
	toFlex: () => FlexTreeNodeSchema;
	original: TreeNodeSchema;
}

type SchemaMap = Map<TreeNodeSchemaIdentifier, SchemaInfo>;

/**
 * Generate a {@link FlexTreeSchema} with `root` as the root field.
 *
 * This also has the side effect of populating the cached view schema on the class based schema.
 */
export function toFlexSchema(root: ImplicitFieldSchema): FlexTreeSchema {
	const schemaMap: SchemaMap = new Map();
	const field = convertField(schemaMap, root);
	const nodeSchema = new Map(
		mapIterable(schemaMap, ([key, value]) => {
			const schema = value.toFlex();
			const classSchema = getClassSchema(schema);
			if (classSchema === undefined) {
				assert(schemaIsLeaf(schema), 0x83e /* invalid leaf */);
			} else {
				assert(
					cachedFlexSchemaFromClassSchema(classSchema) === schema,
					0x83f /* mismatched schema */,
				);
			}
			return [key, schema];
		}),
	);

	const typed: FlexTreeSchema = {
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
export function convertField(schemaMap: SchemaMap, schema: ImplicitFieldSchema): FlexFieldSchema {
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
	return FlexFieldSchema.create(kind, allowedTypes);
}

const convertFieldKind = new Map<FieldKind, FlexFieldKind>([
	[FieldKind.Optional, FieldKinds.optional],
	[FieldKind.Required, FieldKinds.required],
]);

/**
 * Normalizes an {@link ImplicitAllowedTypes} into an {@link AllowedTypes}.
 */
export function convertAllowedTypes(
	schemaMap: SchemaMap,
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
	schemaMap: SchemaMap,
	schema: TreeNodeSchema,
): () => FlexTreeNodeSchema {
	const fromMap = schemaMap.get(brand(schema.identifier));
	if (fromMap !== undefined) {
		if (fromMap.original !== schema) {
			// Use JSON.stringify to quote and escape string.
			throw new Error(
				`Multiple schema encountered with the identifier ${JSON.stringify(
					schema.identifier,
				)}. Remove or rename them to avoid the collision.`,
			);
		}
		return fromMap.toFlex;
	}

	const toFlex = () => {
		let out: FlexTreeNodeSchema;
		const kind = schema.kind;
		switch (kind) {
			case NodeKind.Leaf: {
				const cached =
					cachedFlexSchemaFromClassSchema(schema) ??
					fail("leaf schema should be pre-cached");
				assert(schemaIsLeaf(cached), 0x840 /* expected leaf */);
				return cached;
			}
			case NodeKind.Map: {
				const fieldInfo = schema.info as ImplicitAllowedTypes;
				const field = FlexFieldSchema.create(
					FieldKinds.optional,
					convertAllowedTypes(schemaMap, fieldInfo),
				);
				// Lookup of cached schema is done here instead of before since walking the schema recursively to populate schemaMap is still required.
				const cached = cachedFlexSchemaFromClassSchema(schema);
				out = cached ?? FlexMapNodeSchema.create(builder, brand(schema.identifier), field);
				break;
			}
			case NodeKind.Array: {
				const fieldInfo = schema.info as ImplicitAllowedTypes;
				const field = FlexFieldSchema.create(
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
				const fields: Record<string, FlexFieldSchema> = Object.create(null);
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
		assert(out instanceof TreeNodeSchemaBase, 0x841 /* invalid schema produced */);
		{
			const cached = cachedFlexSchemaFromClassSchema(schema);
			if (cached !== undefined) {
				assert(
					cachedFlexSchemaFromClassSchema(schema) === out,
					0x842 /* incorrect flexSchemaSymbol */,
				);
			} else {
				setFlexSchemaFromClassSchema(schema, out);
			}
		}
		(out as any)[simpleSchemaSymbol] = schema;
		return out;
	};
	schemaMap.set(brand(schema.identifier), { original: schema, toFlex });
	return toFlex;
}

/**
 * A symbol for storing FlexTreeSchema on TreeNodeSchema.
 * Eagerly set on leaves, and lazily set for other cases.
 */
export const flexSchemaSymbol: unique symbol = Symbol(`flexSchema`);

export function cachedFlexSchemaFromClassSchema(
	schema: TreeNodeSchema,
): TreeNodeSchemaBase | undefined {
	return (schema as any)[flexSchemaSymbol] as TreeNodeSchemaBase | undefined;
}

export function setFlexSchemaFromClassSchema(
	simple: TreeNodeSchema,
	flex: TreeNodeSchemaBase,
): void {
	(simple as any)[flexSchemaSymbol] = flex;
}
