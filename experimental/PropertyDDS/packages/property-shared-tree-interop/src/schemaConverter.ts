/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	fail,
	FieldKinds,
	FieldSchema,
	ValueSchema,
	EmptyKey,
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
const nodePropertyTypes = new Set([nodePropertyType, "NamedNodeProperty", "RelationshipProperty"]);
const booleanTypes = new Set(["Bool"]);
const numberTypes = new Set<string>([
	"Int8",
	"Uint8",
	"Int16",
	"Uint16",
	"Int32",
	"Int64",
	"Uint64",
	"Uint32",
	"Float32",
	"Float64",
	"Enum",
]);
const primitiveTypes = new Set<string>([
	"Bool",
	"String",
	"Int8",
	"Uint8",
	"Int16",
	"Uint16",
	"Int32",
	"Int64",
	"Uint64",
	"Uint32",
	"Float32",
	"Float64",
	"Enum",
	"Reference",
]);

type PropertyContext = Brand<"single" | "array" | "map" | "set", "PropertyDDSContext">;

const singleContext: PropertyContext = brand("single");
const arrayContext: PropertyContext = brand("array");
const mapContext: PropertyContext = brand("map");

function isPropertyContext(context: string): context is PropertyContext {
	return context in { single: true, array: true, map: true, set: true };
}

function isIgnoreNestedProperties(typeid: string): boolean {
	return typeid === "Enum";
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

function mapTypesAndChildren<T>(
	allChildrenByType: InheritingChildrenByType,
	f: (t: string) => T | undefined,
	...types: readonly string[]
): Set<T> {
	const output = new Set<T>();
	let result: T | undefined;
	for (const typeid of types) {
		result = f(typeid);
		if (result) output.add(result);
		const inheritingTypes = allChildrenByType.get(typeid) ?? new Set();
		for (const inheritingType of inheritingTypes) {
			result = f(inheritingType);
			if (result) output.add(result);
		}
	}
	return output;
}

// TODO: clarify `enum` context
function buildTreeSchema(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeSchema>,
	allChildrenByType: InheritingChildrenByType,
	type: string,
): LazyTreeSchema {
	const { typeid, context } = TypeIdHelper.extractContext(type);
	if (!isPropertyContext(context)) {
		fail(`Unknown context "${context}" in typeid "${type}" `);
	}
	if (context === singleContext) {
		const typeidAsArray = TypeIdHelper.createSerializationTypeId(typeid, arrayContext, false);
		const typeidAsMap = TypeIdHelper.createSerializationTypeId(typeid, mapContext, false);
		if (!treeSchemaMap.has(typeidAsArray)) {
			buildTreeSchema(builder, treeSchemaMap, allChildrenByType, typeidAsArray);
		}
		if (!treeSchemaMap.has(typeidAsMap)) {
			buildTreeSchema(builder, treeSchemaMap, allChildrenByType, typeidAsMap);
		}
		const treeSchema = treeSchemaMap.get(typeid);
		if (treeSchema) {
			return treeSchema;
		}
		if (TypeIdHelper.isPrimitiveType(typeid)) {
			return buildPrimitiveSchema(builder, treeSchemaMap, typeid);
		} else {
			const cache: { treeSchema?: TreeSchema } = {};
			treeSchemaMap.set(typeid, () => cache.treeSchema as TreeSchema);
			const local = {};
			const schemaTemplate = PropertyFactory.getTemplate(typeid);
			if (schemaTemplate === undefined) {
				fail(`Unknown typeid "${typeid}"`);
			}
			const inheritanceChain = PropertyFactory.getAllParentsForTemplate(typeid);
			for (const typeIdInInheritanceChain of inheritanceChain) {
				const inheritedSchema = buildTreeSchema(
					builder,
					treeSchemaMap,
					allChildrenByType,
					typeIdInInheritanceChain,
				);
				(typeof inheritedSchema === "function"
					? inheritedSchema()
					: inheritedSchema
				).localFields.forEach((field, key) => (local[key] = field));
			}
			const extraLocalFields = PropertyFactory.inheritsFrom(typeid, nodePropertyType)
				? SchemaBuilder.fieldOptional(Any)
				: undefined;
			if (schemaTemplate.properties !== undefined) {
				for (const property of schemaTemplate.properties) {
					if (property.properties && !isIgnoreNestedProperties(property.typeid)) {
						fail(
							`Nested properties are not supported yet (property "${property.id}" of type "${typeid}")`,
						);
					} else {
						const currentTypeid =
							property.context && property.context !== singleContext
								? TypeIdHelper.createSerializationTypeId(
										property.typeid ?? "",
										property.context,
										false,
								  )
								: property.typeid;
						local[property.id] = buildFieldSchema(
							builder,
							treeSchemaMap,
							allChildrenByType,
							property.optional ? FieldKinds.optional : FieldKinds.value,
							currentTypeid,
						);
					}
				}
			} else if (!extraLocalFields) {
				fail(
					`"${typeid}" is not primitive, contains no properties and does not inherit from "${nodePropertyType}".`,
				);
			}
			cache.treeSchema = builder.object(typeid, {
				local,
				extraLocalFields,
			});
			return cache.treeSchema;
		}
	} else {
		const isAnyType = TypeIdHelper.extractTypeId(type) === "" && typeid === basePropertyType;
		const currentTypeid = TypeIdHelper.createSerializationTypeId(
			isAnyType ? Any : typeid,
			context,
			false,
		);
		const treeSchema = treeSchemaMap.get(currentTypeid);
		if (treeSchema) {
			return treeSchema;
		}
		if (typeid === "") {
			fail(`Missing typeid in collection type "${type}"`);
		}
		if (typeid === basePropertyType && !isAnyType) {
			fail(`"${basePropertyType}" shall not be used in schemas (typeid "${type}").`);
		}
		const fieldKind = context === arrayContext ? FieldKinds.sequence : FieldKinds.optional;
		const cache: { treeSchema?: TreeSchema } = {};
		treeSchemaMap.set(currentTypeid, () => cache.treeSchema as TreeSchema);
		const fieldType = buildFieldSchema(
			builder,
			treeSchemaMap,
			allChildrenByType,
			fieldKind,
			isAnyType ? Any : typeid,
		);
		switch (context) {
			case mapContext: {
				cache.treeSchema = builder.object(currentTypeid, { extraLocalFields: fieldType });
				return cache.treeSchema;
			}
			case arrayContext: {
				cache.treeSchema = builder.object(currentTypeid, {
					local: {
						[EmptyKey]: fieldType,
					},
				});
				return cache.treeSchema;
			}
			default:
				fail(`Context "${context}" is not supported yet`);
		}
	}
}

function buildPrimitiveSchema(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeSchema>,
	typeid: string,
	isEnum?: boolean,
): TreeSchema {
	let value: ValueSchema;
	if (isEnum) {
		value = ValueSchema.Number;
	} else if (
		typeid === "String" ||
		typeid.startsWith(referenceGenericTypePrefix) ||
		typeid === referenceType
	) {
		value = ValueSchema.String;
	} else if (booleanTypes.has(typeid)) {
		value = ValueSchema.Boolean;
	} else if (numberTypes.has(typeid)) {
		value = ValueSchema.Number;
	} else {
		fail(`Unknown primitive typeid: ${typeid}`);
	}
	const treeSchema = builder.object(typeid, { value });
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
	if (!fieldTypes.length || fieldTypes.find((t) => t === Any)) {
		return SchemaBuilder.field(fieldKind, Any);
	}
	const allowedTypes = mapTypesAndChildren(
		allChildrenByType,
		(child) => buildTreeSchema(builder, treeSchemaMap, allChildrenByType, child),
		...fieldTypes,
	);
	return SchemaBuilder.field(fieldKind, ...allowedTypes);
}

/**
 * Creates a TypedSchemaCollection out of PropertyDDS schema templates.
 * The templates must be registered beforehand using {@link PropertyFactory.register}.
 * @param rootFieldKind - The kind of the root field.
 * @param allowedRootTypes - The types of children nodes allowed for the root field.
 */
export function convertPropertyToSharedTreeStorageSchema<
	Kind extends FieldKindTypes = FieldKindTypes,
>(
	rootFieldKind: Kind,
	allowedRootTypes: Any | ReadonlySet<string>,
	extraTypes?: ReadonlySet<string>,
) {
	const builder = new SchemaBuilder("PropertyDDS to SharedTree schema builder");
	const allChildrenByType = getAllInheritingChildrenTypes();
	const treeSchemaMap: Map<string, LazyTreeSchema> = new Map();

	const referencedTypeIDs =
		allowedRootTypes === Any || allowedRootTypes.has(Any)
			? new Set<string>()
			: mapTypesAndChildren(allChildrenByType, (t) => t, ...allowedRootTypes);

	for (const typeid of [...primitiveTypes, ...nodePropertyTypes]) {
		referencedTypeIDs.add(typeid);
	}

	if (extraTypes) {
		extraTypes.forEach((typeid) => referencedTypeIDs.add(typeid));
	}

	for (const referencedTypeId of referencedTypeIDs) {
		buildTreeSchema(builder, treeSchemaMap, allChildrenByType, referencedTypeId);
	}

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

// Concepts currently not mapped / represented in the compiled schema:
//
// * Annotations
// * Length constraints for arrays / strings
// * Constants
// * Values for enums
// * Default values
// * Inline type definitions (aka "nested properties") which requires auto-generated type IDs (e.g. "Test:Person$address-1.0.0")
