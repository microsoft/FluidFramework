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

function loadInheritedChildren(): Map<string, Set<string>> {
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

function getInheritedChildrenForType(
	inheritedChildrenByType: Map<string, ReadonlySet<string>>,
	typeid: string,
): ReadonlySet<TreeSchemaIdentifier> {
	return getInheritedChildrenForTypes(inheritedChildrenByType, new Set([typeid]));
}

function getInheritedChildrenForTypes(
	inheritedChildrenByType: Map<string, ReadonlySet<string>>,
	types: ReadonlySet<string>,
): ReadonlySet<TreeSchemaIdentifier> {
	const result = new Set<TreeSchemaIdentifier>();
	for (const type of types) {
		result.add(brand(type));
		const strSet = inheritedChildrenByType.get(type) ?? new Set();
		for (const str of strSet) {
			result.add(brand(str));
		}
	}
	return result;
}

export function convertPSetSchemaToSharedTreeLls(
	repository: StoredSchemaRepository,
	rootFieldSchema: FieldSchema,
): void {
	const inheritedChildrenByType = loadInheritedChildren();
	const globalTreeSchema: Map<TreeSchemaIdentifier, NamedTreeSchema> = new Map();
	// Extract all referenced typeids for the schema
	const unprocessedTypeIds: TreeSchemaIdentifier[] = [];
	const rootBaseTypes = rootFieldSchema.types ?? fail("Expected root types");
	const rootTypes = getInheritedChildrenForTypes(inheritedChildrenByType, rootBaseTypes);
	for (const type of rootTypes) {
		unprocessedTypeIds.push(type);
	}
	const unprocessedTypeIdsSet: Set<string> = new Set(unprocessedTypeIds);
	const referencedTypeIDs = new Set<TreeSchemaIdentifier>();

	while (unprocessedTypeIds.length > 0) {
		const unprocessedTypeID = unprocessedTypeIds.pop();

		if (!unprocessedTypeID) {
			return;
		}

		referencedTypeIDs.add(unprocessedTypeID);

		const schemaTemplate = PropertyFactory.getTemplate(unprocessedTypeID);
		if (schemaTemplate === undefined) {
			throw new Error(`Unknown typeid: ${unprocessedTypeID}`);
		}
		const dependencies = PropertyTemplate.extractDependencies(
			schemaTemplate,
		) as TreeSchemaIdentifier[];
		for (const dependencyTypeId of dependencies) {
			const idsSet = getInheritedChildrenForType(inheritedChildrenByType, dependencyTypeId);
			idsSet.forEach((id) => {
				if (!referencedTypeIDs.has(dependencyTypeId) && !unprocessedTypeIdsSet.has(id)) {
					unprocessedTypeIds.push(id);
					unprocessedTypeIdsSet.add(id);
				}
			});
		}

		// Extract context information (i.e. array, map and set types)
		const extractContexts = (properties: any[]): void => {
			if (properties !== undefined) {
				for (const property of properties || []) {
					if (property.properties) {
						// We have a nested set of properties
						// TODO: We have to create a corresponding nested type
						extractContexts(property.properties);
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
					splitTypeId.typeid.startsWith("Reference<") ||
					splitTypeId.typeid === "Reference"
				) {
					valueType = ValueSchema.String;
				} else if (booleanTypes.has(splitTypeId.typeid)) {
					valueType = ValueSchema.Boolean;
				} else if (numberTypes.has(splitTypeId.typeid)) {
					valueType = ValueSchema.Number;
				} else {
					throw new Error(`Unknown primitive typeid: ${splitTypeId.typeid}`);
				}

				typeSchema = namedTreeSchema({
					name: referencedTypeId,
					extraLocalFields: emptyField,
					value: valueType,
				});
				// }
			} else {
				if (splitTypeId.typeid === "NodeProperty") {
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
						if (typeIdInInheritanceChain === "NodeProperty") {
							continue;
						}

						const schema = PropertyFactory.getTemplate(typeIdInInheritanceChain);
						if (schema === undefined) {
							throw new Error(
								`Unknown typeid referenced: ${typeIdInInheritanceChain}`,
							);
						}
						if (schema.properties !== undefined) {
							for (const property of schema.properties) {
								if (
									property.properties &&
									!isIgnoreNestedProperties(property.typeid)
								) {
									// TODO: Handle nested properties
								} else {
									let currentTypeid = property.typeid as string;
									let types;
									if (property.context && property.context !== "single") {
										currentTypeid = `${property.context}<${
											property.typeid || ""
										}>`;
										types = new Set<TreeSchemaIdentifier>();
										types.add(currentTypeid as TreeSchemaIdentifier);
									} else {
										types = getInheritedChildrenForType(
											inheritedChildrenByType,
											currentTypeid,
										);
									}

									localFields[property.id] = fieldSchema(
										property.optional ? FieldKinds.optional : FieldKinds.value,
										types,
									);
								}
							}
						}
					}

					typeSchema = namedTreeSchema({
						name: referencedTypeId,
						localFields,
						extraLocalFields: PropertyFactory.inheritsFrom(
							splitTypeId.typeid,
							"NodeProperty",
						)
							? fieldSchema(FieldKinds.optional)
							: emptyField,
					});
				}
			}
		} else {
			const fieldKind =
				splitTypeId.context === "array" ? FieldKinds.sequence : FieldKinds.optional;

			const fieldType = fieldSchema(
				fieldKind,
				splitTypeId.typeid !== "" && splitTypeId.typeid !== "BaseProperty"
					? [brand(splitTypeId.typeid)]
					: undefined,
			);
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
					throw new Error(`Unknown context in typeid: ${splitTypeId.context}`);
			}
		}
		globalTreeSchema.set(referencedTypeId, typeSchema);
	}
	const fullSchemaData: SchemaData = {
		treeSchema: globalTreeSchema,
		globalFieldSchema: new Map([
			[rootFieldKey, convertRootFieldSchema(inheritedChildrenByType, rootFieldSchema)],
		]),
	};
	repository.update(fullSchemaData);
}

function convertRootFieldSchema(
	inheritedChildrenByType,
	rootFieldSchema: FieldSchema,
): FieldSchema {
	const types: Set<TreeType> = new Set();
	const myFieldSchema: FieldSchema = {
		kind: rootFieldSchema.kind,
		types,
	};
	const origTypes: TreeTypeSet = rootFieldSchema.types ?? new Set();
	if (myFieldSchema.types) {
		for (const type of origTypes) {
			const children = getInheritedChildrenForType(inheritedChildrenByType, type);
			children.forEach((child) => types.add(brand(child)));
		}
	}
	return myFieldSchema;
}

// Concepts currently not mapped / represented in the compiled schema:
//
// * Annotations
// * Length constraints for arrays / strings
// * Constants
// * Values for enums
// * Default values
