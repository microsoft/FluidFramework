/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
	fail,
	emptyField,
	FieldKinds,
	FieldSchema,
	TreeSchemaIdentifier,
	ValueSchema,
	fieldSchema,
	namedTreeSchema,
	brand,
	EmptyKey,
	SchemaDataAndPolicy,
	SchemaBuilder,
	TreeStoredSchema,
	FieldKindTypes,
	Any,
	TreeSchema,
	LazyTreeSchema,
} from "@fluid-experimental/tree2";
import { PropertyFactory, PropertyTemplate } from "@fluid-experimental/property-properties";
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

function buildTreeSchema(
	builder: SchemaBuilder,
	treeSchemaMap: Map<string, LazyTreeSchema>,
	allChildrenByType: InheritingChildrenByType,
	type: string,
): LazyTreeSchema {
	const splitTypeId = TypeIdHelper.extractContext(type);
	if (splitTypeId.context === "single") {
		let treeSchema = treeSchemaMap.get(splitTypeId.typeid);
		if (treeSchema) {
			return treeSchema;
		}
		if (TypeIdHelper.isPrimitiveType(splitTypeId.typeid)) {
			let value: ValueSchema;
			if (splitTypeId.isEnum) {
				value = ValueSchema.Number;
			} else if (
				splitTypeId.typeid === "String" ||
				splitTypeId.typeid.startsWith(referenceGenericTypePrefix) ||
				splitTypeId.typeid === referenceType
			) {
				value = ValueSchema.String;
			} else if (booleanTypes.has(splitTypeId.typeid)) {
				value = ValueSchema.Boolean;
			} else if (numberTypes.has(splitTypeId.typeid)) {
				value = ValueSchema.Number;
			} else {
				fail(`Unknown primitive typeid: ${splitTypeId.typeid}`);
			}
			treeSchema = builder.object(splitTypeId.typeid, { value });
			treeSchemaMap.set(splitTypeId.typeid, treeSchema);
			return treeSchema;
		} else {
			if (nodePropertyTypes.has(splitTypeId.typeid)) {
				treeSchema = builder.object(splitTypeId.typeid, {
					extraLocalFields: SchemaBuilder.fieldOptional(Any),
				});
				treeSchemaMap.set(splitTypeId.typeid, treeSchema);
				return treeSchema;
			} else {
				const cache: { treeSchema?: LazyTreeSchema } = {};
				treeSchemaMap.set(splitTypeId.typeid, () => cache.treeSchema as TreeSchema);
				const local = {};
				const inheritanceChain = PropertyFactory.getAllParentsForTemplate(
					splitTypeId.typeid,
				);
				inheritanceChain.push(splitTypeId.typeid);

				for (const typeIdInInheritanceChain of inheritanceChain) {
					if (nodePropertyTypes.has(typeIdInInheritanceChain)) {
						continue;
					}

					const propertySchema = PropertyFactory.getTemplate(typeIdInInheritanceChain);
					if (propertySchema === undefined) {
						fail(`Unknown typeid: ${typeIdInInheritanceChain}`);
					}
					if (propertySchema.properties !== undefined) {
						for (const property of propertySchema.properties) {
							if (property.properties && !isIgnoreNestedProperties(property.typeid)) {
								fail(
									`Nested properties are not supported yet (typeid: ${property.typeid})`,
								);
							} else {
								const currentTypeid =
									property.context && property.context !== "single"
										? // TODO: empty typeid will be converted into BaseProperty and then asserted
										  // within the further processing of a non-single context case.
										  // Maybe BaseProperty collections should be allowed or empty typeid asserted here?
										  `${property.context}<${property.typeid || ""}>`
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
					} else if (
						!PropertyFactory.inheritsFrom(typeIdInInheritanceChain, nodePropertyType)
					) {
						fail(
							`"${typeIdInInheritanceChain}" contains no properties and does not inherit from "${nodePropertyType}".`,
						);
					}
				}
				cache.treeSchema = builder.object(splitTypeId.typeid, {
					local,
					extraLocalFields: PropertyFactory.inheritsFrom(
						splitTypeId.typeid,
						nodePropertyType,
					)
						? SchemaBuilder.fieldOptional(Any)
						: undefined,
				});
				return cache.treeSchema;
			}
		}
	} else {
		const anyType =
			TypeIdHelper.extractTypeId(type) === "" && splitTypeId.typeid === basePropertyType;
		const currentTypeid = `${splitTypeId.context}<${anyType ? Any : splitTypeId.typeid}>`;
		const treeSchema = treeSchemaMap.get(currentTypeid);
		if (treeSchema) {
			return treeSchema;
		}
		assert(splitTypeId.typeid !== "", `Missing typeid in collection type "${type}"`);
		assert(
			splitTypeId.typeid !== basePropertyType || anyType,
			`"${basePropertyType}" shall not be used in schemas (typeid "${type}")`,
		);
		const fieldKind =
			splitTypeId.context === "array" ? FieldKinds.sequence : FieldKinds.optional;
		const cache: { treeSchema?: LazyTreeSchema } = {};
		treeSchemaMap.set(currentTypeid, () => cache.treeSchema as TreeSchema);
		const fieldType = buildFieldSchema(
			builder,
			treeSchemaMap,
			allChildrenByType,
			fieldKind,
			anyType ? Any : splitTypeId.typeid,
		);
		switch (splitTypeId.context) {
			case "map":
			case "set": {
				cache.treeSchema = builder.object(currentTypeid, { extraLocalFields: fieldType });
				return cache.treeSchema;
			}
			case "array": {
				cache.treeSchema = builder.object(currentTypeid, {
					local: {
						[EmptyKey]: fieldType,
					},
				});
				return cache.treeSchema;
			}
			default:
				fail(`Unknown context "${splitTypeId.context}" in typeid "${type}" `);
		}
	}
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

export function convertPropertyToSharedTreeStorageSchema<
	Kind extends FieldKindTypes = FieldKindTypes,
>(rootFieldKind: Kind, ...rootTypes: readonly string[]) {
	const builder = new SchemaBuilder("PropertyDDS to SharedTree schema builder");
	const allChildrenByType = getAllInheritingChildrenTypes();
	const treeSchemaMap: Map<string, LazyTreeSchema> = new Map();

	// Extract all referenced typeids for the schema
	const unprocessedTypeIds: string[] = [];
	if (!rootTypes.find((t) => t === Any)) {
		unprocessedTypeIds.push(...mapTypesAndChildren(allChildrenByType, (t) => t, ...rootTypes));
	}

	const referencedTypeIDs = new Set<string>();

	while (unprocessedTypeIds.length > 0) {
		const unprocessedTypeID = unprocessedTypeIds.pop();

		if (!unprocessedTypeID) {
			fail(`Found undefined value in stack of unprocessed type ids.`);
		}

		referencedTypeIDs.add(unprocessedTypeID);

		const schemaTemplate = PropertyFactory.getTemplate(unprocessedTypeID);
		if (schemaTemplate === undefined) {
			fail(`Unknown typeid: ${unprocessedTypeID}`);
		}
		const dependencies = PropertyTemplate.extractDependencies(schemaTemplate);
		unprocessedTypeIds.push(
			...mapTypesAndChildren(allChildrenByType, (t) => {
				if (unprocessedTypeIds.find((unprocessedTypeId) => unprocessedTypeId === t)) return;
				if (referencedTypeIDs.has(t)) return;
				return t;
			}),
			...dependencies,
		);

		// Extract context information (i.e. array, map and set types)
		const extractContexts = (properties: any[]): void => {
			if (properties !== undefined) {
				for (const property of properties || []) {
					if (property.properties) {
						if (isIgnoreNestedProperties(property.typeid)) {
							continue;
						}
						// We have a nested set of properties
						// TODO: We have to create a corresponding nested type
						fail(`Nested properties are not supported yet ${property.typeid}`);
						// extractContexts(property.properties);
					}
					if (property.context && property.context !== "single") {
						referencedTypeIDs.add(`${property.context}<${property.typeid ?? ""}>`);
					}
				}
			}
		};
		extractContexts(schemaTemplate.properties);
	}

	for (const type of [...primitiveTypes, ...nodePropertyTypes]) {
		if (!referencedTypeIDs.has(type)) {
			referencedTypeIDs.add(type);
		}
		if (!referencedTypeIDs.has(`array<${type}>`)) {
			referencedTypeIDs.add(`array<${type}>`);
		}
		if (!referencedTypeIDs.has(`map<${type}>`)) {
			referencedTypeIDs.add(`map<${type}>`);
		}
	}

	// Now we create the actual schemas, since we are now able to reference the dependent types
	for (const referencedTypeId of referencedTypeIDs) {
		if (treeSchemaMap.has(referencedTypeId)) {
			continue;
		}
		buildTreeSchema(builder, treeSchemaMap, allChildrenByType, referencedTypeId);
	}

	const rootSchema = buildFieldSchema(
		builder,
		treeSchemaMap,
		allChildrenByType,
		rootFieldKind,
		...rootTypes,
	);
	return builder.intoDocumentSchema(rootSchema);
}

const allowedCollectionContexts = new Set(["array", "map", "set"]);

/**
 * A helper function to add a complex type to the schema.
 *
 * Complex types are `array`, `map` and `set`.
 * The resulting type added to the schema will have a name
 * in the PropertyDDS format `context<typeName>`.
 *
 * Be aware, that using this function might be very unperformant
 * as it reads all types registered in PropertyDDS schema
 * and creates a shallow copy of the `SchemaDataAndPolicy`.
 *
 * TODO: use new schema API (builder etc.)
 */
export function addComplexTypeToSchema(
	fullSchemaData: SchemaDataAndPolicy,
	context: string,
	typeName: TreeSchemaIdentifier,
): SchemaDataAndPolicy {
	if (!allowedCollectionContexts.has(context)) {
		fail(`Not supported collection context "${context}"`);
	}
	const treeSchema: Map<TreeSchemaIdentifier, TreeStoredSchema> = new Map();
	for (const [k, v] of fullSchemaData.treeSchema) {
		treeSchema.set(k, v);
	}
	const complexTypeName: TreeSchemaIdentifier = brand(`${context}<${typeName}>`);
	const types = mapTypesAndChildren<TreeSchemaIdentifier>(
		getAllInheritingChildrenTypes(),
		(t) => brand(t),
		typeName,
	);
	const typeSchema =
		context === "array"
			? namedTreeSchema({
					name: complexTypeName,
					localFields: {
						[EmptyKey]: fieldSchema(FieldKinds.sequence, types),
					},
					extraLocalFields: emptyField,
			  })
			: namedTreeSchema({
					name: complexTypeName,
					extraLocalFields: fieldSchema(FieldKinds.optional, types),
			  });
	treeSchema.set(complexTypeName, typeSchema);
	const globalSchema: SchemaDataAndPolicy = {
		treeSchema,
		globalFieldSchema: fullSchemaData.globalFieldSchema,
		policy: fullSchemaData.policy,
	};
	return globalSchema;
}

// Concepts currently not mapped / represented in the compiled schema:
//
// * Annotations
// * Length constraints for arrays / strings
// * Constants
// * Values for enums
// * Default values
