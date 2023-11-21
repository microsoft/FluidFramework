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
} from "../feature-libraries";
import { brand, fail, getOrCreate, isReadonlyArray } from "../util";
import { normalizeFlexListEager } from "../feature-libraries/typed-schema/flexList";
import { extractFactoryContent, simpleSchemaSymbol } from "../simple-tree/proxies";
import { AllowedUpdateType, ITreeCursorSynchronous, TreeNodeSchemaIdentifier } from "../core";
import { type InitializeAndSchematizeConfiguration } from "../shared-tree";
import { TreeNode, Unhydrated } from "../simple-tree";
import { cursorFromNodeData } from "../simple-tree/toMapTree";
import {
	FieldKind,
	FieldSchema,
	ImplicitAllowedTypes,
	ImplicitFieldSchema,
	LeafNodeSchema,
	NodeKind,
	TreeNodeSchema,
} from "./schemaFactory";
import { TreeConfiguration } from "./tree";
import {
	cachedFlexSchemaFromClassSchema,
	flexSchemaSymbol,
	setFlexSchemaFromClassSchema,
} from "./cachedFlexSchemaFromClassSchema";

/**
 * @remarks
 * Ideally this would work on any node, not just the root,
 * and the schema would come from the unhydrated node.
 * For now though, this is the only case thats needed, and we do have the data to make it work, so this is fine.
 */
export function cursorFromUnhydratedRoot(
	schema: TreeSchema,
	tree: Unhydrated<TreeNode>,
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
	const initialTree = [cursorFromUnhydratedRoot(schema, unhydrated as Unhydrated<TreeNode>)];
	return {
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
		initialTree,
	};
}

export function toFlexSchema(implicitRoot: ImplicitFieldSchema): TreeSchema {
	const schemaMap: Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema> = new Map();
	const field = convertField(schemaMap, implicitRoot);

	const typed: TreeSchema = {
		nodeSchema: schemaMap,
		adapters: {},
		rootFieldSchema: field,
		policy: defaultSchemaPolicy,
	};
	return typed;
}

/**
 * Normalizes an {@link ImplicitFieldSchema} into a {@link TreeFieldSchema}.
 */
export function convertField(
	schemaMap: Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema>,
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
 * Normalizes an {@link ImplicitAllowedTypes} into  {@link AllowedTypes}.
 */
export function convertAllowedTypes(
	schemaMap: Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema>,
	schema: ImplicitAllowedTypes,
): FlexAllowedTypes {
	if (isReadonlyArray(schema)) {
		return normalizeFlexListEager(schema).map((item) => convertNodeSchema(schemaMap, item));
	}
	return [convertNodeSchema(schemaMap, schema)];
}

const builder = { name: "simple schema" };

/**
 * Normalizes an {@link ImplicitAllowedTypes} into  {@link AllowedTypes}.
 */
export function convertNodeSchema(
	schemaMap: Map<TreeNodeSchemaIdentifier, FlexTreeNodeSchema>,
	schema: TreeNodeSchema,
): FlexTreeNodeSchema {
	const final = getOrCreate(schemaMap, schema.identifier, () => {
		let out: FlexTreeNodeSchema;
		const kind = schema.kind;
		switch (kind) {
			case NodeKind.Leaf: {
				assert(schema instanceof LeafNodeSchema, "invalid leaf schema");
				return (schema as any)[flexSchemaSymbol] as FlexTreeNodeSchema;
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
					FieldKinds.optional,
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
					// This code has to be careful to avoid assigned to __proto__ or similar built in fields.
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
	if (schema.kind !== NodeKind.Leaf) {
		assert(
			(final as any)[simpleSchemaSymbol] === schema,
			"multiple view schema for the same identifier",
		);
	}
	return final;
}
