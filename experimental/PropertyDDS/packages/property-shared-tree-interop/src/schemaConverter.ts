/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	fail,
	emptyField,
	FieldKinds,
	FieldSchema,
	NamedTreeSchema,
	neverTree,
	rootFieldKey,
	SchemaData,
	StoredSchemaRepository,
	TreeSchemaIdentifier,
	ValueSchema,
	lookupTreeSchema,
	fieldSchema,
	namedTreeSchema,
	brand,
	EmptyKey,
	TreeTypeSet,
	TreeType,
} from "@fluid-internal/tree";
import { PropertyFactory, PropertyTemplate } from "@fluid-experimental/property-properties";
import { TypeIdHelper } from "@fluid-experimental/property-changeset";

const nodePropertyType = "NodeProperty";
const referenceGenericTypePrefix = "Reference<";
const referenceType = "Reference";
const basePropertyType = "BaseProperty";
const booleanTypes = new Set(["Bool"]);
const numberTypes = new Set([
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
const primitiveTypes = new Set([
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
]);

function isIgnoreNestedProperties(typeid: string): boolean {
	return typeid === "Enum";
}

function getAllInheritingChildrenTypes(): Map<string, Set<string>> {
	const inheritedChildren: Map<string, Set<string>> = new Map();
	const allTypes = PropertyFactory.listRegisteredTypes();
	for (const typeid of allTypes) {
		const parents = PropertyFactory.getAllParentsForTemplate(typeid);
		for (const parent of parents) {
			if (!inheritedChildren.has(parent)) {
				inheritedChildren.set(parent, new Set());
			}
			inheritedChildren.get(parent)?.add(typeid);
		}
	}
	return inheritedChildren;
}

function getChildrenForType(
	inheritingChildrenByType: Map<string, ReadonlySet<string>>,
	typeid: string,
): ReadonlySet<TreeSchemaIdentifier> {
	const childrenTypes = new Set<TreeSchemaIdentifier>();
	const inheritingTypes = inheritingChildrenByType.get(typeid) ?? new Set();
	for (const inheritingType of inheritingTypes) {
		childrenTypes.add(brand(inheritingType));
	}
	return childrenTypes;
}

export function convertPropertyToSharedTreeStorageSchema(
	repository: StoredSchemaRepository,
	rootFieldSchema: FieldSchema,
): void {
	const inheritingChildrenByType = getAllInheritingChildrenTypes();
	const globalTreeSchema: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
	// Extract all referenced typeids for the schema
	const unprocessedTypeIds: TreeSchemaIdentifier[] = [];
	const rootBaseTypes = rootFieldSchema.types ?? fail("Expected root types");
	for (const rootBaseType of rootBaseTypes) {
		unprocessedTypeIds.push(rootBaseType);
		unprocessedTypeIds.push(...getChildrenForType(inheritingChildrenByType, rootBaseType));
	}
	const referencedTypeIDs = new Set<TreeSchemaIdentifier>();

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
		const dependencies = PropertyTemplate.extractDependencies(
			schemaTemplate,
		) as TreeSchemaIdentifier[];
		for (const dependencyTypeId of dependencies) {
			[
				dependencyTypeId,
				...getChildrenForType(inheritingChildrenByType, dependencyTypeId),
			].forEach((id) => {
				if (
					!referencedTypeIDs.has(id) &&
					!unprocessedTypeIds.find((unprocessedTypeId) => unprocessedTypeId === id)
				) {
					unprocessedTypeIds.push(id);
				}
			});
		}

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
						referencedTypeIDs.add(
							`${property.context}<${property.typeid}>` as TreeSchemaIdentifier,
						);
					}
					if (TypeIdHelper.isPrimitiveType(property.typeid)) {
						referencedTypeIDs.add(property.typeid);
					}
				}
			}
		};
		extractContexts(schemaTemplate.properties);
	}

	for (const type of primitiveTypes) {
		const typeid: TreeSchemaIdentifier = brand(type);
		if (!referencedTypeIDs.has(typeid)) {
			referencedTypeIDs.add(typeid);
		}
	}

	// Now we create the actual schemas, since we are now able to reference the dependent types
	for (const referencedTypeId of referencedTypeIDs.values()) {
		if (lookupTreeSchema(repository, referencedTypeId) !== neverTree) {
			continue;
		}

		const splitTypeId = TypeIdHelper.extractContext(referencedTypeId);
		let typeSchema: NamedTreeSchema | undefined;

		if (splitTypeId.context === "single") {
			if (TypeIdHelper.isPrimitiveType(splitTypeId.typeid)) {
				// @TODO for simplicity we convert it to native string
				// if (splitTypeId.typeid === "String") {
				//     // String is a special case, we actually have to represent it as a sequence
				//     typeSchema = {
				//             name: referencedTypeId,
				//             localFields: new Map<LocalFieldKey, FieldSchema>([
				//                 // TODO: What should be the key we use for the entries? Should this be standardized?
				//                 ["entries" as LocalFieldKey, {
				//                     kind: FieldKinds.sequence.identifier,
				//                     types: new Set([
				//                         // TODO: Which type do we use for characters?
				//                     ]),
				//                 }],
				//             ]),
				//             globalFields: new Set(),
				//             extraLocalFields: emptyField,
				//             extraGlobalFields: false,
				//             value: ValueSchema.Nothing,
				//         };
				// } else {
				let valueType: ValueSchema;
				if (splitTypeId.isEnum) {
					valueType = ValueSchema.Number;
				} else if (
					splitTypeId.typeid === "String" ||
					splitTypeId.typeid.startsWith(referenceGenericTypePrefix) ||
					splitTypeId.typeid === referenceType
				) {
					valueType = ValueSchema.String;
				} else if (booleanTypes.has(splitTypeId.typeid)) {
					valueType = ValueSchema.Boolean;
				} else if (numberTypes.has(splitTypeId.typeid)) {
					valueType = ValueSchema.Number;
				} else {
					fail(`Unknown primitive typeid: ${splitTypeId.typeid}`);
				}

				typeSchema = namedTreeSchema({
					name: referencedTypeId,
					extraLocalFields: emptyField,
					value: valueType,
				});
				// }
			} else {
				if (splitTypeId.typeid === nodePropertyType) {
					typeSchema = namedTreeSchema({
						name: referencedTypeId,
						extraLocalFields: fieldSchema(FieldKinds.optional),
					});
				} else {
					const localFields = {};
					const inheritanceChain = PropertyFactory.getAllParentsForTemplate(
						splitTypeId.typeid,
					);
					inheritanceChain.push(splitTypeId.typeid);

					for (const typeIdInInheritanceChain of inheritanceChain) {
						if (typeIdInInheritanceChain === nodePropertyType) {
							continue;
						}

						const schema = PropertyFactory.getTemplate(typeIdInInheritanceChain);
						if (schema === undefined) {
							fail(`Unknown typeid referenced: ${typeIdInInheritanceChain}`);
						}
						if (schema.properties !== undefined) {
							for (const property of schema.properties) {
								if (
									property.properties &&
									!isIgnoreNestedProperties(property.typeid)
								) {
									fail(
										`Nested properties are not supported yet ${property.typeid}`,
									);
								} else {
									let currentTypeid = property.typeid;
									const types = new Set<TreeSchemaIdentifier>();
									if (property.context && property.context !== "single") {
										currentTypeid = `${property.context}<${
											property.typeid || ""
										}>`;
									} else if (inheritingChildrenByType.has(currentTypeid)) {
										for (const childType of getChildrenForType(
											inheritingChildrenByType,
											currentTypeid,
										)) {
											types.add(childType);
										}
									}
									types.add(brand(currentTypeid));

									localFields[property.id] = fieldSchema(
										property.optional ? FieldKinds.optional : FieldKinds.value,
										types,
									);
								}
							}
						} else if (
							!PropertyFactory.inheritsFrom(
								typeIdInInheritanceChain,
								nodePropertyType,
							)
						) {
							fail(
								`"${typeIdInInheritanceChain}" contains no properties and does not inherit from "NodeProperty".`,
							);
						}
					}

					typeSchema = namedTreeSchema({
						name: referencedTypeId,
						localFields,
						extraLocalFields: PropertyFactory.inheritsFrom(
							splitTypeId.typeid,
							nodePropertyType,
						)
							? fieldSchema(FieldKinds.optional)
							: emptyField,
					});
				}
			}
		} else {
			const fieldKind =
				splitTypeId.context === "array" ? FieldKinds.sequence : FieldKinds.optional;
			let localFieldTypes: Set<TreeSchemaIdentifier> | undefined;
			if (splitTypeId.typeid !== "" && splitTypeId.typeid !== basePropertyType) {
				localFieldTypes = new Set<TreeSchemaIdentifier>([brand(splitTypeId.typeid)]);
				getChildrenForType(inheritingChildrenByType, splitTypeId.typeid).forEach(
					(childType) => localFieldTypes?.add(childType),
				);
			}
			const fieldType = fieldSchema(fieldKind, localFieldTypes);
			switch (splitTypeId.context) {
				case "map":
				case "set":
					typeSchema = namedTreeSchema({
						name: referencedTypeId,
						extraLocalFields: fieldType,
					});

					break;
				case "array":
					typeSchema = namedTreeSchema({
						name: referencedTypeId,
						localFields: {
							[EmptyKey]: fieldType,
						},
						extraLocalFields: emptyField,
					});
					break;
				default:
					fail(`Unknown context in typeid: ${splitTypeId.context}`);
			}
		}
		globalTreeSchema.set(referencedTypeId, typeSchema);
	}
	const fullSchemaData: SchemaData = {
		treeSchema: globalTreeSchema,
		globalFieldSchema: new Map([
			[
				rootFieldKey,
				enhanceRootFieldSchemaWithChildren(inheritingChildrenByType, rootFieldSchema),
			],
		]),
	};
	repository.update(fullSchemaData);
}

function enhanceRootFieldSchemaWithChildren(
	inheritedChildrenByType,
	rootFieldSchema: FieldSchema,
): FieldSchema {
	const types: Set<TreeType> = new Set();
	const enhancedRootFieldSchema: FieldSchema = {
		kind: rootFieldSchema.kind,
		types,
	};
	const rootBaseTypes: TreeTypeSet = rootFieldSchema.types ?? fail("Expected root types");
	for (const rootBaseType of rootBaseTypes) {
		types.add(rootBaseType);
		const children = getChildrenForType(inheritedChildrenByType, rootBaseType);
		children.forEach((child) => types.add(brand(child)));
	}

	return enhancedRootFieldSchema;
}

// Concepts currently not mapped / represented in the compiled schema:
//
// * Annotations
// * Length constraints for arrays / strings
// * Constants
// * Values for enums
// * Default values
