/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypeIdHelper } from "@fluid-experimental/property-changeset";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { assert } from "@fluidframework/core-utils/internal";
import {
	Any,
	FlexFieldKind as FieldKind,
	FieldKinds,
	FlexFieldSchema,
	LazyTreeNodeSchema,
	SchemaBuilderBase,
	FlexTreeNodeSchema as TreeNodeSchema,
	fail,
	leaf,
} from "@fluidframework/tree/internal";

const nodePropertyType = "NodeProperty";
const referenceGenericTypePrefix = "Reference<";
const referenceType = "Reference";
const basePropertyType = "BaseProperty";
const booleanType = "Bool";
const stringType = "String";
const enumType = "Enum";
const numberType = "Float64";
const numberTypes = new Set<string>([
	"Int8",
	"Int16",
	"Int32",
	"Int64",
	"Uint8",
	"Uint16",
	"Uint32",
	"Uint64",
	"Float32",
	numberType,
	enumType,
]);
const primitiveTypes = new Set([...numberTypes, booleanType, stringType, referenceType]);

/**
 * Key under which a map for arbitrary "NodeProperty" data is stored.
 */
export const nodePropertyField = "properties";

enum PropertyDDSContext {
	single = "single",
	array = "array",
	map = "map",
	set = "set",
}

function isPropertyContext(context: string): context is PropertyDDSContext {
	return context in PropertyDDSContext;
}

function isIgnoreNestedProperties(typeid: string): boolean {
	return typeid === enumType;
}

type InheritingChildrenByType = ReadonlyMap<string, ReadonlySet<string>>;

function getAllInheritingChildrenTypes(): InheritingChildrenByType {
	const inheritingChildrenByType: Map<string, Set<string>> = new Map();
	const allTypes = PropertyFactory.listRegisteredTypes();
	for (const typeid of allTypes) {
		const parents = PropertyFactory.getAllParentsForTemplate(typeid);
		for (const parent of parents) {
			if (!inheritingChildrenByType.has(parent)) {
				inheritingChildrenByType.set(parent, new Set());
			}
			inheritingChildrenByType.get(parent)?.add(typeid);
		}
	}
	return inheritingChildrenByType;
}

type SchemaBuilder = SchemaBuilderBase<string, typeof FieldKinds.required>;

function buildTreeNodeSchema(
	builder: SchemaBuilder,
	nodeSchemaMap: Map<string, LazyTreeNodeSchema>,
	allChildrenByType: InheritingChildrenByType,
	type: string,
): LazyTreeNodeSchema {
	assert(type !== basePropertyType, 0x6ff /* "BaseProperty" shall not be used in schemas. */);
	const { typeid, context, isEnum } = TypeIdHelper.extractContext(type);
	if (!isPropertyContext(context)) {
		fail(`Unknown context "${context}" in typeid "${type}"`);
	}
	if (context === PropertyDDSContext.single) {
		const typeidAsArray = TypeIdHelper.createSerializationTypeId(
			typeid,
			PropertyDDSContext.array,
			isEnum,
		);
		const typeidAsMap = TypeIdHelper.createSerializationTypeId(
			typeid,
			PropertyDDSContext.map,
			isEnum,
		);
		if (!nodeSchemaMap.has(typeidAsArray)) {
			buildTreeNodeSchema(builder, nodeSchemaMap, allChildrenByType, typeidAsArray);
		}
		if (!nodeSchemaMap.has(typeidAsMap)) {
			buildTreeNodeSchema(builder, nodeSchemaMap, allChildrenByType, typeidAsMap);
		}
		// There must be no difference between `type` and `typeid` within the rest of this block
		// except that `type` keeps `enum<>` pattern whereas `typeid` is a "pure" type.
		// Since SharedTree does not support enums yet, they are considered to be just primitives.
		// In all other cases `type` and `typeid` should be exactly the same.
		// TODO: adapt the code when enums will become supported.
		const nodeSchema = nodeSchemaMap.get(type);
		if (nodeSchema) {
			return nodeSchema;
		}
		if (TypeIdHelper.isPrimitiveType(type)) {
			return buildPrimitiveSchema(builder, nodeSchemaMap, type, isEnum);
		} else {
			assert(type === typeid, 0x700 /* Unexpected typeid discrepancy */);
			const cache: { nodeSchema?: TreeNodeSchema } = {};
			nodeSchemaMap.set(typeid, () => cache.nodeSchema ?? fail("missing schema"));
			const fields = new Map<string, FlexFieldSchema>();
			buildLocalFields(builder, nodeSchemaMap, allChildrenByType, typeid, fields);
			const inheritanceChain = PropertyFactory.getAllParentsForTemplate(typeid);
			for (const inheritanceType of inheritanceChain) {
				buildLocalFields(builder, nodeSchemaMap, allChildrenByType, inheritanceType, fields);
			}
			if (typeid === nodePropertyType) {
				cache.nodeSchema = nodePropertySchema;
				return cache.nodeSchema;
			}
			if (PropertyFactory.inheritsFrom(typeid, nodePropertyType)) {
				assert(
					!fields.has(nodePropertyField),
					0x712 /* name collision for nodePropertyField */,
				);
				fields.set(
					nodePropertyField,
					FlexFieldSchema.create(FieldKinds.required, [nodePropertySchema]),
				);
			}
			const fieldsObject = mapToObject(fields);
			cache.nodeSchema = builder.object(typeid, fieldsObject);
			return cache.nodeSchema;
		}
	} else {
		// `typeid === basePropertyType` is only allowed to happen if type is omitted from a generic typeid (e.g. "array<>").
		// Such generic typeids are also generated when building a field for a collection property w/o typeid.
		const isAnyType = TypeIdHelper.extractTypeId(type) === "" && typeid === basePropertyType;
		assert(
			typeid !== basePropertyType || isAnyType,
			0x701 /* "BaseProperty" shall not be used in schemas. */,
		);
		const currentTypeid = TypeIdHelper.createSerializationTypeId(
			isAnyType ? Any : typeid,
			context,
			isEnum,
		);
		const nodeSchema = nodeSchemaMap.get(currentTypeid);
		if (nodeSchema) {
			return nodeSchema;
		}
		const fieldKind =
			context === PropertyDDSContext.array ? FieldKinds.sequence : FieldKinds.optional;
		const cache: { nodeSchema?: TreeNodeSchema } = {};
		nodeSchemaMap.set(currentTypeid, () => cache.nodeSchema ?? fail("missing schema"));
		const fieldSchema = buildFieldSchema(
			builder,
			nodeSchemaMap,
			allChildrenByType,
			fieldKind,
			isAnyType ? Any : isEnum ? `enum<${typeid}>` : typeid,
		);
		switch (context) {
			case PropertyDDSContext.map: {
				cache.nodeSchema = builder.map(currentTypeid, fieldSchema);
				return cache.nodeSchema;
			}
			case PropertyDDSContext.array: {
				cache.nodeSchema = builder.fieldNode(currentTypeid, fieldSchema);
				return cache.nodeSchema;
			}
			default:
				fail(`Context "${context}" is not supported yet`);
		}
	}
}

function mapToObject<MapValue>(map: Map<string, MapValue>): Record<string, MapValue> {
	const objectMap: Record<string, MapValue> = {};
	for (const [key, value] of map.entries()) {
		// This code has to be careful to avoid assigned to __proto__ or similar built in fields.
		Object.defineProperty(objectMap, key, {
			enumerable: true,
			configurable: true,
			writable: true,
			value,
		});
	}
	return objectMap;
}

/**
 * Adds fields to the provided map.
 */
function buildLocalFields(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeNodeSchema>,
	allChildrenByType: InheritingChildrenByType,
	typeid: string,
	local: Map<string, FlexFieldSchema>,
): void {
	const schemaTemplate = PropertyFactory.getTemplate(typeid);
	if (schemaTemplate === undefined) {
		fail(`Unknown typeid "${typeid}"`);
	}
	// This call can be deeply recursive returning not yet created schemas,
	// e.g., for a "parent -> child -> parent" inheritance chain, so that
	// a) the result of this call can't be used here to get the inherited fields and
	// b) that's why templates are used below instead.
	buildTreeNodeSchema(builder, treeSchemaMap, allChildrenByType, typeid);
	if (schemaTemplate.properties !== undefined) {
		for (const property of schemaTemplate.properties) {
			if (property.properties && !isIgnoreNestedProperties(property.typeid)) {
				fail(
					`Nested properties are not supported yet (in property "${property.id}" of type "${typeid}")`,
				);
			} else {
				assert(
					property.typeid !== basePropertyType,
					0x702 /* "BaseProperty" shall not be used in schemas. */,
				);
				const currentTypeid =
					property.context && property.context !== PropertyDDSContext.single
						? TypeIdHelper.createSerializationTypeId(
								property.typeid ?? "",
								property.context,
								false,
							)
						: property.typeid ?? Any;
				local.set(
					property.id,
					buildFieldSchema(
						builder,
						treeSchemaMap,
						allChildrenByType,
						property.optional ? FieldKinds.optional : FieldKinds.required,
						currentTypeid,
					),
				);
			}
		}
	}
}

function buildPrimitiveSchema(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeNodeSchema>,
	typeid: string,
	isEnum?: boolean,
): TreeNodeSchema {
	let nodeSchema: TreeNodeSchema;
	if (typeid === stringType) {
		nodeSchema = leaf.string;
	} else if (typeid.startsWith(referenceGenericTypePrefix) || typeid === referenceType) {
		// Strongly typed wrapper around a string
		nodeSchema = builder.fieldNode(typeid, leaf.string);
	} else if (typeid === booleanType) {
		nodeSchema = leaf.boolean;
	} else if (typeid === numberType) {
		nodeSchema = leaf.number;
	} else if (numberTypes.has(typeid) || isEnum) {
		// Strongly typed wrapper around a number
		nodeSchema = builder.fieldNode(typeid, leaf.number);
	} else {
		// If this case occurs, there is definetely a problem with the ajv template,
		// as unknown primitives should be issued there otherwise.
		fail(`Unknown primitive typeid "${typeid}"`);
	}
	treeSchemaMap.set(typeid, nodeSchema);
	return nodeSchema;
}

function buildFieldSchema<Kind extends FieldKind = FieldKind>(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeNodeSchema>,
	allChildrenByType: InheritingChildrenByType,
	fieldKind: Kind,
	...fieldTypes: readonly string[]
): FlexFieldSchema<Kind> {
	const allowedTypes: Set<LazyTreeNodeSchema> = new Set();
	let isAny = false;
	for (const typeid of fieldTypes) {
		if (typeid === Any) {
			isAny = true;
			continue;
		}
		allowedTypes.add(buildTreeNodeSchema(builder, treeSchemaMap, allChildrenByType, typeid));
		const inheritingTypes = allChildrenByType.get(typeid) ?? new Set();
		for (const inheritingType of inheritingTypes) {
			allowedTypes.add(
				buildTreeNodeSchema(builder, treeSchemaMap, allChildrenByType, inheritingType),
			);
		}
	}
	return isAny
		? FlexFieldSchema.create(fieldKind, [Any])
		: FlexFieldSchema.create(fieldKind, [...allowedTypes]);
}

const builtinBuilder: SchemaBuilder = new SchemaBuilderBase(FieldKinds.required, {
	scope: "com.fluidframework.PropertyDDSBuiltIn",
	name: "PropertyDDS to SharedTree builtin schema builder",
	libraries: [leaf.library],
});
// TODO:
// It might make sense for all builtins (not specific to the particular schema being processed),
// to be put into one library like this.
export const nodePropertySchema = builtinBuilder.map(
	nodePropertyType,
	FlexFieldSchema.create(FieldKinds.optional, [Any]),
);
const builtinLibrary = builtinBuilder.intoLibrary();

/**
 * Creates a TreeSchema out of PropertyDDS schema templates.
 * The templates must be registered beforehand using {@link PropertyFactory.register}.
 * @param rootFieldKind - The kind of the root field.
 * @param allowedRootTypes - The types of children nodes allowed for the root field.
 * @param extraTypes - The extra types which can't be found when traversing across
 * the PropertyDDS schema inheritances / dependencies starting from
 * the root schema or built-in node property schemas.
 * @internal
 */
export function convertPropertyToSharedTreeSchema<Kind extends FieldKind = FieldKind>(
	rootFieldKind: Kind,
	allowedRootTypes: Any | ReadonlySet<string>,
	extraTypes?: ReadonlySet<string>,
) {
	const builder = new SchemaBuilderBase(FieldKinds.required, {
		scope: "converted",
		name: "PropertyDDS to SharedTree schema builder",
		libraries: [builtinLibrary],
	});
	const allChildrenByType = getAllInheritingChildrenTypes();
	const treeSchemaMap: Map<string, LazyTreeNodeSchema> = new Map();

	primitiveTypes.forEach((primitiveType) =>
		buildTreeNodeSchema(builder, treeSchemaMap, allChildrenByType, primitiveType),
	);
	// That's enough to just add "NodeProperty" type as all other
	// dependent built-in types will be added through inheritances.
	buildTreeNodeSchema(builder, treeSchemaMap, allChildrenByType, nodePropertyType);
	extraTypes?.forEach((extraType) =>
		buildTreeNodeSchema(builder, treeSchemaMap, allChildrenByType, extraType),
	);

	const allowedTypes = allowedRootTypes === Any ? [Any] : [...allowedRootTypes];
	const rootSchema = buildFieldSchema(
		builder,
		treeSchemaMap,
		allChildrenByType,
		rootFieldKind,
		...allowedTypes,
	);
	return builder.intoSchema(rootSchema);
}
