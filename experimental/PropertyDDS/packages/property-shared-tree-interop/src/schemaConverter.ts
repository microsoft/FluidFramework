/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	emptyField,
	FieldKinds,
	FieldSchema,
	LocalFieldKey,
	NamedTreeSchema,
	neverTree,
	rootFieldKey,
	SchemaData,
	StoredSchemaRepository,
	TreeSchemaIdentifier,
	ValueSchema,
	lookupTreeSchema,
	fieldSchema,
	brand,
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
]);

export function convertPSetSchema(
	typeid: string,
	repository: StoredSchemaRepository,
	rootFieldSchema: FieldSchema,
): void {
	const treeSchema = new Map();
	// Extract all referenced typeids for the schema
	const unprocessedTypeIds = [typeid];
	const referencedTypeIDs = new Set<TreeSchemaIdentifier>();

	while (unprocessedTypeIds.length > 0) {
		const unprocessedTypeID = unprocessedTypeIds.pop();

		if (!unprocessedTypeID) {
			return;
		}

		referencedTypeIDs.add(unprocessedTypeID as TreeSchemaIdentifier);

		const schemaTemplate = PropertyFactory.getTemplate(unprocessedTypeID);
		if (schemaTemplate === undefined) {
			throw new Error(`Unknown typeid: ${typeid}`);
		}
		const dependencies = PropertyTemplate.extractDependencies(
			schemaTemplate,
		) as TreeSchemaIdentifier[];
		for (const dependencyTypeId of dependencies) {
			if (!referencedTypeIDs.has(dependencyTypeId)) {
				unprocessedTypeIds.push(dependencyTypeId as string);
			}
		}

		// Extract context information (i.e. array, map and set types)
		const extractContexts = (properties: any[]): void => {
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
		};
		extractContexts(schemaTemplate.properties);
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
					splitTypeId.typeid.startsWith("Reference<")
				) {
					valueType = ValueSchema.String;
				} else if (booleanTypes.has(splitTypeId.typeid)) {
					valueType = ValueSchema.Boolean;
				} else if (numberTypes.has(splitTypeId.typeid)) {
					valueType = ValueSchema.Number;
				} else {
					throw new Error(`Unknown primitive typeid: ${splitTypeId.typeid}`);
				}

				typeSchema = {
					name: referencedTypeId,
					localFields: new Map(),
					globalFields: new Set(),
					extraLocalFields: emptyField,
					extraGlobalFields: false,
					value: valueType,
				};
				// }
			} else {
				if (splitTypeId.typeid === "NodeProperty") {
					typeSchema = {
						name: referencedTypeId,
						localFields: new Map(),
						globalFields: new Set(),
						extraLocalFields: {
							kind: FieldKinds.optional.identifier,
						},
						extraGlobalFields: false,
						value: ValueSchema.Nothing,
					};
				} else {
					const localFields = new Map<LocalFieldKey, FieldSchema>();
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
						for (const property of schema.properties) {
							if (property.properties) {
								// TODO: Handle nested properties
							} else {
								let currentTypeid = property.typeid as string;
								if (property.context && property.context !== "single") {
									currentTypeid = `${property.context}<${
										property.currentTypeid || ""
									}>`;
								}

								localFields.set(
									property.id as LocalFieldKey,
									fieldSchema(
										property.optional ? FieldKinds.optional : FieldKinds.value,
										[brand(currentTypeid)],
									),
								);
							}
						}
					}

					typeSchema = {
						name: referencedTypeId,
						localFields,
						globalFields: new Set(),
						extraLocalFields: PropertyFactory.inheritsFrom(
							splitTypeId.typeid,
							"NodeProperty",
						)
							? {
									kind: FieldKinds.optional.identifier,
							  }
							: emptyField,
						extraGlobalFields: false,
						value: ValueSchema.Nothing,
					};
				}
			}
		} else {
			const kind =
				splitTypeId.context === "array"
					? FieldKinds.sequence.identifier
					: FieldKinds.optional.identifier;

			const fieldType =
				splitTypeId.typeid !== "" && splitTypeId.typeid !== "BaseProperty"
					? {
							kind,
							types: new Set([
								// TODO: How do we handle inheritance here?
								splitTypeId.typeid as TreeSchemaIdentifier,
							]),
					  }
					: {
							kind,
					  };
			switch (splitTypeId.context) {
				case "map":
				case "set":
					typeSchema = {
						name: referencedTypeId,
						localFields: new Map(),
						globalFields: new Set(),
						extraLocalFields: fieldType,
						extraGlobalFields: false,
						value: ValueSchema.Nothing,
					};

					break;
				case "array":
					typeSchema = {
						name: referencedTypeId,
						localFields: new Map<LocalFieldKey, FieldSchema>([
							// TODO: What should be the key we use for the entries?
							// Should this be standardized?
							["entries" as LocalFieldKey, fieldType],
						]),
						globalFields: new Set(),
						extraLocalFields: emptyField,
						extraGlobalFields: false,
						value: ValueSchema.Nothing,
					};
					break;
				default:
					throw new Error(`Unknown context in typeid: ${splitTypeId.context}`);
			}
		}
		treeSchema.set(referencedTypeId, typeSchema);
	}
	const fullSchemaData: SchemaData = {
		treeSchema,
		globalFieldSchema: new Map([[rootFieldKey, rootFieldSchema]]),
	};
	repository.update(fullSchemaData);
}

// Concepts currently not mapped / represented in the compiled schema:
//
// * Annotations
// * Length constraints for arrays / strings
// * Constants
// * Values for enums
// * Default values
