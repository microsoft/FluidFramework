/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	fail,
	FieldKinds,
	FieldSchema,
	ValueSchema,
	SchemaBuilder,
	FieldKindTypes,
	Any,
	TreeSchema,
	LazyTreeSchema,
	brand,
	Brand,
} from "@fluid-experimental/tree2";
import { PropertyFactory } from "@fluid-experimental/property-properties";
import { TypeIdHelper } from "@fluid-experimental/property-changeset";

const nodePropertyType = "NodeProperty";
const referenceGenericTypePrefix = "Reference<";
const referenceType = "Reference";
const basePropertyType = "BaseProperty";
const booleanType = "Bool";
const stringType = "String";
const enumType = "Enum";
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
	"Float64",
	enumType,
]);
const primitiveTypes = new Set([...numberTypes, booleanType, stringType, referenceType]);

type PropertyDDSContext = Brand<"single" | "array" | "map" | "set", "PropertyDDSContext">;

const singleContext: PropertyDDSContext = brand("single");
const arrayContext: PropertyDDSContext = brand("array");
const mapContext: PropertyDDSContext = brand("map");

function isPropertyContext(context: string): context is PropertyDDSContext {
	return context in { single: true, array: true, map: true, set: true };
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

function buildTreeSchema(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeSchema>,
	allChildrenByType: InheritingChildrenByType,
	type: string,
): LazyTreeSchema {
	assert(type !== basePropertyType, `"BaseProperty" shall not be used in schemas.`);
	const { typeid, context, isEnum } = TypeIdHelper.extractContext(type);
	if (!isPropertyContext(context)) {
		fail(`Unknown context "${context}" in typeid "${type}"`);
	}
	if (context === singleContext) {
		const typeidAsArray = TypeIdHelper.createSerializationTypeId(typeid, arrayContext, isEnum);
		const typeidAsMap = TypeIdHelper.createSerializationTypeId(typeid, mapContext, isEnum);
		if (!treeSchemaMap.has(typeidAsArray)) {
			buildTreeSchema(builder, treeSchemaMap, allChildrenByType, typeidAsArray);
		}
		if (!treeSchemaMap.has(typeidAsMap)) {
			buildTreeSchema(builder, treeSchemaMap, allChildrenByType, typeidAsMap);
		}
		// There must be no difference between `type` and `typeid` within the rest of this block
		// except that `type` keeps `enum<>` pattern whereas `typeid` is a "pure" type.
		// Since SharedTree does not support enums yet, they are considered to be just primitives.
		// In all other cases `type` and `typeid` should be exactly the same.
		// TODO: adapt the code when enums will become supported.
		const treeSchema = treeSchemaMap.get(type);
		if (treeSchema) {
			return treeSchema;
		}
		if (TypeIdHelper.isPrimitiveType(type)) {
			return buildPrimitiveSchema(builder, treeSchemaMap, type, isEnum);
		} else {
			assert(type === typeid, "Unexpected typeid discrepancy");
			const cache: { treeSchema?: TreeSchema } = {};
			treeSchemaMap.set(typeid, () => cache.treeSchema as TreeSchema);
			const local = buildLocalFields(builder, treeSchemaMap, allChildrenByType, typeid, {});
			const inheritanceChain = PropertyFactory.getAllParentsForTemplate(typeid);
			for (const inheritanceType of inheritanceChain) {
				buildLocalFields(builder, treeSchemaMap, allChildrenByType, inheritanceType, local);
			}
			cache.treeSchema = PropertyFactory.inheritsFrom(typeid, nodePropertyType)
				? builder.object(typeid, {
						local,
						extraLocalFields: SchemaBuilder.fieldOptional(Any),
				  })
				: builder.struct(typeid, local);
			return cache.treeSchema;
		}
	} else {
		// `typeid === basePropertyType` is only allowed to happen if type is omitted from a generic typeid (e.g. "array<>").
		// Such generic typeids are also generated when building a field for a collection property w/o typeid.
		const isAnyType = TypeIdHelper.extractTypeId(type) === "" && typeid === basePropertyType;
		assert(
			typeid !== basePropertyType || isAnyType,
			`"BaseProperty" shall not be used in schemas.`,
		);
		const currentTypeid = TypeIdHelper.createSerializationTypeId(
			isAnyType ? Any : typeid,
			context,
			isEnum,
		);
		const treeSchema = treeSchemaMap.get(currentTypeid);
		if (treeSchema) {
			return treeSchema;
		}
		const fieldKind = context === arrayContext ? FieldKinds.sequence : FieldKinds.optional;
		const cache: { treeSchema?: TreeSchema } = {};
		treeSchemaMap.set(currentTypeid, () => cache.treeSchema as TreeSchema);
		const fieldSchema = buildFieldSchema(
			builder,
			treeSchemaMap,
			allChildrenByType,
			fieldKind,
			isAnyType ? Any : isEnum ? `enum<${typeid}>` : typeid,
		);
		switch (context) {
			case mapContext: {
				cache.treeSchema = builder.map(currentTypeid, fieldSchema);
				return cache.treeSchema;
			}
			case arrayContext: {
				cache.treeSchema = builder.fieldNode(currentTypeid, fieldSchema);
				return cache.treeSchema;
			}
			default:
				fail(`Context "${context}" is not supported yet`);
		}
	}
}

function buildLocalFields(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeSchema>,
	allChildrenByType: InheritingChildrenByType,
	typeid: string,
	local: { [key: string]: FieldSchema },
): { readonly [key: string]: FieldSchema } {
	const schemaTemplate = PropertyFactory.getTemplate(typeid);
	if (schemaTemplate === undefined) {
		fail(`Unknown typeid "${typeid}"`);
	}
	// This call can be deeply recursive returning not yet created schemas,
	// e.g., for a "parent -> child -> parent" inheritance chain, so that
	// a) the result of this call can't be used here to get the inherited fields and
	// b) that's why templates are used below instead.
	buildTreeSchema(builder, treeSchemaMap, allChildrenByType, typeid);
	if (schemaTemplate.properties !== undefined) {
		for (const property of schemaTemplate.properties) {
			if (property.properties && !isIgnoreNestedProperties(property.typeid)) {
				fail(
					`Nested properties are not supported yet (in property "${property.id}" of type "${typeid}")`,
				);
			} else {
				assert(
					property.typeid !== basePropertyType,
					`"BaseProperty" shall not be used in schemas.`,
				);
				const currentTypeid =
					property.context && property.context !== singleContext
						? TypeIdHelper.createSerializationTypeId(
								property.typeid ?? "",
								property.context,
								false,
						  )
						: property.typeid ?? Any;
				local[property.id] = buildFieldSchema(
					builder,
					treeSchemaMap,
					allChildrenByType,
					property.optional ? FieldKinds.optional : FieldKinds.value,
					currentTypeid,
				);
			}
		}
	}
	return local;
}

function buildPrimitiveSchema(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeSchema>,
	typeid: string,
	isEnum?: boolean,
): TreeSchema {
	let valueSchema: ValueSchema;
	if (
		typeid === stringType ||
		typeid.startsWith(referenceGenericTypePrefix) ||
		typeid === referenceType
	) {
		valueSchema = ValueSchema.String;
	} else if (typeid === booleanType) {
		valueSchema = ValueSchema.Boolean;
	} else if (numberTypes.has(typeid) || isEnum) {
		valueSchema = ValueSchema.Number;
	} else {
		// If this case occurs, there is definetely a problem with the ajv template,
		// as unknown primitives should be issued there otherwise.
		fail(`Unknown primitive typeid "${typeid}"`);
	}
	const treeSchema = builder.primitive(typeid, valueSchema);
	treeSchemaMap.set(typeid, treeSchema);
	return treeSchema;
}

function buildFieldSchema<Kind extends FieldKindTypes = FieldKindTypes>(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeSchema>,
	allChildrenByType: InheritingChildrenByType,
	fieldKind: Kind,
	...fieldTypes: readonly string[]
): FieldSchema {
	const allowedTypes: Set<LazyTreeSchema> = new Set();
	let isAny = false;
	for (const typeid of fieldTypes) {
		if (typeid === Any) {
			isAny = true;
			continue;
		}
		allowedTypes.add(buildTreeSchema(builder, treeSchemaMap, allChildrenByType, typeid));
		const inheritingTypes = allChildrenByType.get(typeid) ?? new Set();
		for (const inheritingType of inheritingTypes) {
			allowedTypes.add(
				buildTreeSchema(builder, treeSchemaMap, allChildrenByType, inheritingType),
			);
		}
	}
	return isAny
		? SchemaBuilder.field(fieldKind, Any)
		: SchemaBuilder.field(fieldKind, ...allowedTypes);
}

/**
 * Creates a TypedSchemaCollection out of PropertyDDS schema templates.
 * The templates must be registered beforehand using {@link PropertyFactory.register}.
 * @param rootFieldKind - The kind of the root field.
 * @param allowedRootTypes - The types of children nodes allowed for the root field.
 * @param extraTypes - The extra types which can't be found when traversing across
 * the PropertyDDS schema inheritances / dependencies starting from
 * the root schema or built-in node property schemas.
 */
export function convertPropertyToSharedTreeSchema<Kind extends FieldKindTypes = FieldKindTypes>(
	rootFieldKind: Kind,
	allowedRootTypes: Any | ReadonlySet<string>,
	extraTypes?: ReadonlySet<string>,
) {
	const builder = new SchemaBuilder("PropertyDDS to SharedTree schema builder");
	const allChildrenByType = getAllInheritingChildrenTypes();
	const treeSchemaMap: Map<string, LazyTreeSchema> = new Map();

	primitiveTypes.forEach((primitiveType) =>
		buildTreeSchema(builder, treeSchemaMap, allChildrenByType, primitiveType),
	);
	// That's enough to just add "NodeProperty" type as all other
	// dependent built-in types will be added through inheritances.
	buildTreeSchema(builder, treeSchemaMap, allChildrenByType, nodePropertyType);
	extraTypes?.forEach((extraType) =>
		buildTreeSchema(builder, treeSchemaMap, allChildrenByType, extraType),
	);

	const allowedTypes = allowedRootTypes === Any ? [Any] : [...allowedRootTypes];
	const rootSchema = buildFieldSchema(
		builder,
		treeSchemaMap,
		allChildrenByType,
		rootFieldKind,
		...allowedTypes,
	);
	return builder.intoDocumentSchema(rootSchema);
}
