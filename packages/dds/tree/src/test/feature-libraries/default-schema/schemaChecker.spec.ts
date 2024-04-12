/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Reaching into internal module just to test it
import {
	SchemaValidationErrors,
	compliesWithMultiplicity,
	isFieldInSchema,
	isNodeInSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-schema/schemaChecker.js";
import { FieldKinds, type FlexFieldKind } from "../../../feature-libraries/index.js";
import {
	LeafNodeStoredSchema,
	MapNodeStoredSchema,
	Multiplicity,
	ObjectNodeStoredSchema,
	ValueSchema,
	type FieldKey,
	type FieldKindData,
	type FieldKindIdentifier,
	type MapTree,
	type SchemaAndPolicy,
	type SchemaPolicy,
	type StoredSchemaCollection,
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type Value,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import { MockHandle } from "@fluidframework/test-runtime-utils/internal";

const emptySchemaPolicy: SchemaPolicy = {
	fieldKinds: new Map(),
};

const emptySchemaCollection: StoredSchemaCollection = {
	nodeSchema: new Map(),
};

/**
 * Helper for building {@link TreeFieldStoredSchema}.
 */
function getFieldSchema(
	kind: { identifier: FieldKindIdentifier },
	allowedTypes?: Iterable<TreeNodeSchemaIdentifier>,
): TreeFieldStoredSchema {
	return {
		kind: kind.identifier,
		types: allowedTypes === undefined ? undefined : new Set(allowedTypes),
	};
}

function createLeafNode(nodeSchemaIdentifier: string, value: Value): MapTree {
	return {
		type: brand(nodeSchemaIdentifier),
		value,
		fields: new Map(),
	};
}
function createNonLeafNode(
	nodeSchemaIdentifier: string,
	fields: Map<FieldKey, MapTree[]>,
): MapTree {
	return {
		type: brand(nodeSchemaIdentifier),
		value: undefined,
		fields,
	};
}

describe("schema validation", () => {
	describe("compliesWithMultiplicity", () => {
		const multiplicityTestCases: [
			kind: Multiplicity,
			numberToTest: number,
			expectedResult: boolean,
		][] = [
			[Multiplicity.Forbidden, 0, true],
			[Multiplicity.Forbidden, 1, false],
			[Multiplicity.Single, 0, false],
			[Multiplicity.Single, 1, true],
			[Multiplicity.Single, 2, false],
			[Multiplicity.Sequence, 0, true],
			[Multiplicity.Sequence, 1, true],
			[Multiplicity.Sequence, 2, true],
			[Multiplicity.Optional, 0, true],
			[Multiplicity.Optional, 1, true],
			[Multiplicity.Optional, 2, false],
		];
		for (const [kind, numberToTest, expectedResult] of multiplicityTestCases) {
			it(`compliesWithMultiplicity(${numberToTest}, ${Multiplicity[kind]}) === ${expectedResult}`, () => {
				const actual = compliesWithMultiplicity(numberToTest, kind);
				assert.equal(actual, expectedResult);
			});
		}
	});

	describe("isNodeInSchema", () => {
		describe("LeafNodeStoredSchema", () => {
			const numberNode = createLeafNode("myNumberNode", 1);
			const stringNode = createLeafNode("myStringNode", "string");
			const booleanNode = createLeafNode("myBooleanNode", false);
			const nullNode = createLeafNode("myNullNode", null);
			const undefinedNode = createLeafNode("myUndefinedNode", undefined);
			const fluidHandleNode = createLeafNode("myFluidHandleNode", new MockHandle(undefined));
			const nodeCases = [
				numberNode,
				stringNode,
				booleanNode,
				nullNode,
				fluidHandleNode,
				undefinedNode,
			];

			// Making the key of the record a ValueSchema ensures that we'll get compile-time errors if we add new
			// ValueSchema values but forget to add test cases for them.
			const testCases = {
				[ValueSchema.Number]: {
					schema: new LeafNodeStoredSchema(ValueSchema.Number),
					positiveNodeType: numberNode,
				},
				[ValueSchema.String]: {
					schema: new LeafNodeStoredSchema(ValueSchema.String),
					positiveNodeType: stringNode,
				},
				[ValueSchema.Boolean]: {
					schema: new LeafNodeStoredSchema(ValueSchema.Boolean),
					positiveNodeType: booleanNode,
				},
				[ValueSchema.Null]: {
					schema: new LeafNodeStoredSchema(ValueSchema.Null),
					positiveNodeType: nullNode,
				},
				[ValueSchema.FluidHandle]: {
					schema: new LeafNodeStoredSchema(ValueSchema.FluidHandle),
					positiveNodeType: fluidHandleNode,
				},
			} satisfies Record<ValueSchema, unknown>;

			for (const [key, testCaseData] of Object.entries(testCases)) {
				describe(`ValueSchema.${ValueSchema[parseInt(key, 10)]}`, () => {
					for (const node of nodeCases) {
						const expectedResult =
							testCaseData.positiveNodeType === node
								? SchemaValidationErrors.NoError
								: SchemaValidationErrors.LeafNode_InvalidValue;
						const title =
							expectedResult === SchemaValidationErrors.NoError
								? "in schema"
								: "not in schema";
						it(`${node.type} is ${title}`, () => {
							const schemaAndPolicy: SchemaAndPolicy = {
								schema: { nodeSchema: new Map([[node.type, testCaseData.schema]]) },
								policy: emptySchemaPolicy,
							};
							assert.equal(isNodeInSchema(node, schemaAndPolicy), expectedResult);
						});
					}
				});
			}

			it(`not in schema due to missing schema entry in schemaCollection`, () => {
				assert.equal(
					isNodeInSchema(numberNode, {
						schema: emptySchemaCollection,
						policy: emptySchemaPolicy,
					}),
					SchemaValidationErrors.Node_MissingSchema,
				);
			});

			it(`not in schema due to having fields`, () => {
				const numberNodeWithFields = createLeafNode("myNumberNodeWithFields", 1);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[
								numberNodeWithFields.type,
								new LeafNodeStoredSchema(ValueSchema.Number),
							],
						]),
					},
					policy: emptySchemaPolicy,
				};
				numberNodeWithFields.fields.set(brand("prop1"), [stringNode]);
				assert.equal(
					isNodeInSchema(numberNodeWithFields, schemaAndPolicy),
					SchemaValidationErrors.LeafNode_FieldsNotAllowed,
				);
			});
		});

		describe("MapNodeStoredSchema", () => {
			const numberNode = createLeafNode("myNumberNode", 1);
			const stringNode = createLeafNode("myStringNode", "string");

			it(`in schema (nodes of a single type)`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredNumberNode,
				);
				const mapNode = createNonLeafNode("myNumberMapNode", new Map());
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[mapNode.type, mapNodeSchema],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
						]),
					},
				};

				// In schema while empty
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a number node
				mapNode.fields.set(brand("prop1"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`in schema (nodes of several types)`, () => {
				const fieldSchema_requiredUnionNode = getFieldSchema(FieldKinds.required, [
					numberNode.type,
					stringNode.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredUnionNode,
				);
				const mapNode = createNonLeafNode("myUnionMapNode", new Map());
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[stringNode.type, new LeafNodeStoredSchema(ValueSchema.String)],
							[mapNode.type, mapNodeSchema],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_requiredUnionNode.kind, FieldKinds.required],
						]),
					},
				};

				// In schema while empty
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a number node
				mapNode.fields.set(brand("prop1"), [numberNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a string node
				mapNode.fields.set(brand("prop2"), [stringNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`not in schema due to missing schema entry in schemaCollection`, () => {
				// Schema for a map node whose fields are required and must contain a number.
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.type]);
				const schema = new MapNodeStoredSchema(fieldSchema);

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: emptySchemaCollection,
					policy: {
						fieldKinds: new Map([[fieldSchema.kind, FieldKinds.required]]),
					},
				};

				// numberNode.type is not in the schema collection
				const mapNode_oneNumber = createNonLeafNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				assert.equal(
					isNodeInSchema(mapNode_oneNumber, schemaAndPolicy),
					SchemaValidationErrors.Node_MissingSchema,
				);
			});

			it(`not in schema due to missing FieldKind entry in schemaPolicy`, () => {
				// Schema for a map node whose fields are required and must contain a number.
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					getFieldSchema(FieldKinds.required, [numberNode.type]),
				);

				// numberNode.type is not in the schema collection
				const mapNode_oneNumber = createNonLeafNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[mapNode_oneNumber.type, mapNodeSchema],
						]),
					},
					policy: emptySchemaPolicy,
				};

				assert.equal(
					isNodeInSchema(mapNode_oneNumber, schemaAndPolicy),
					SchemaValidationErrors.Field_KindNotInSchemaPolicy,
				);
			});

			it(`not in schema if nodes are not allowed by field`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const fieldSchema_requiredStringNode = getFieldSchema(FieldKinds.required, [
					stringNode.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredNumberNode,
				);
				const mapNode = createNonLeafNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[mapNode.type, mapNodeSchema],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
							[fieldSchema_requiredStringNode.kind, FieldKinds.required],
						]),
					},
				};

				// In schema with one number node
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);

				// Not in schema after adding a string node
				mapNode.fields.set(brand("prop2"), [stringNode]);
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.Field_NodeTypeNotAllowed,
				);
			});

			it(`not in schema due to having a value`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredNumberNode,
				);
				const mapNode = createNonLeafNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);
				mapNode.value = "something that's not undefined";

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[mapNode.type, mapNodeSchema],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
						]),
					},
				};

				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NonLeafNode_ValueNotAllowed,
				);
			});
		});

		describe("ObjectNodeStoredSchema", () => {
			const numberNode = createLeafNode("myNumberNode", 1);
			const stringNode = createLeafNode("myStringNode", "string");
			const booleanNode = createLeafNode("myBooleanNode", false);
			const nullNode = createLeafNode("myNullNode", null);
			const fluidHandleNode = createLeafNode("myFluidHandleNode", new MockHandle(undefined));

			it(`in schema (direct children of different leaf types)`, () => {
				// Note there's a sequence field here to test that both optional and sequence fields
				// can "not exist" in a node and it's still in schema, since both of those kinds of fields
				// can be empty and when they are they shouldn't exist in the node.
				const fieldSchema_optionalNumberNode = getFieldSchema(FieldKinds.optional, [
					numberNode.type,
				]);
				const fieldSchema_optionalStringNode = getFieldSchema(FieldKinds.optional, [
					stringNode.type,
				]);
				const fieldSchema_sequenceBooleanNode = getFieldSchema(FieldKinds.sequence, [
					booleanNode.type,
				]);
				const fieldSchema_optionalNullNode = getFieldSchema(FieldKinds.optional, [
					nullNode.type,
				]);
				const fieldSchema_optionalFluidHandleNode = getFieldSchema(FieldKinds.optional, [
					fluidHandleNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([
						[brand("numberProp"), fieldSchema_optionalNumberNode],
						[brand("stringProp"), fieldSchema_optionalStringNode],
						[brand("booleanProp"), fieldSchema_sequenceBooleanNode],
						[brand("nullProp"), fieldSchema_optionalNullNode],
						[brand("fluidHandleProp"), fieldSchema_optionalFluidHandleNode],
					]),
				);
				const objectNode = createNonLeafNode("myObjectNode", new Map());
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[stringNode.type, new LeafNodeStoredSchema(ValueSchema.String)],
							[booleanNode.type, new LeafNodeStoredSchema(ValueSchema.Boolean)],
							[nullNode.type, new LeafNodeStoredSchema(ValueSchema.Null)],
							[
								fluidHandleNode.type,
								new LeafNodeStoredSchema(ValueSchema.FluidHandle),
							],
							[objectNode.type, nodeSchema_object],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_optionalNumberNode.kind, FieldKinds.optional],
							[fieldSchema_optionalStringNode.kind, FieldKinds.optional],
							// Need the cast so the Map instantiation doesn't complain about
							// the type for its values
							[
								fieldSchema_sequenceBooleanNode.kind,
								FieldKinds.sequence as FieldKindData,
							],
							[fieldSchema_optionalNullNode.kind, FieldKinds.optional],
							[fieldSchema_optionalFluidHandleNode.kind, FieldKinds.optional],
						]),
					},
				};

				// In schema when empty optional and sequence fields don't exist
				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding optional and sequence fields with values
				objectNode.fields.set(brand("numberProp"), [numberNode]);
				objectNode.fields.set(brand("stringProp"), [stringNode]);
				objectNode.fields.set(brand("booleanProp"), [booleanNode, booleanNode]);
				objectNode.fields.set(brand("nullProp"), [nullNode]);
				objectNode.fields.set(brand("fluidHandleProp"), [fluidHandleNode]);
				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`not in schema due to missing node schema entry in schemaCollection`, () => {
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.type]);
				const nodeSchema: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("prop1"), fieldSchema]]),
				);
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						// The object node's schema is missing in the map
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						]),
					},
					policy: {
						fieldKinds: new Map([[fieldSchema.kind, FieldKinds.required]]),
					},
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.Node_MissingSchema,
				);
			});

			it(`not in schema due to missing FieldKind entry in schemaPolicy`, () => {
				const fieldSchema_requiredNumber = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("prop1"), fieldSchema_requiredNumber]]),
				);

				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[objectNode.type, nodeSchema_object],
						]),
					},
					policy: emptySchemaPolicy,
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.Field_KindNotInSchemaPolicy,
				);
			});

			it(`not in schema due to having a field not present in its defined schema`, () => {
				const fieldSchema_optionalNumber = getFieldSchema(FieldKinds.optional, [
					numberNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("prop1"), fieldSchema_optionalNumber]]),
				);

				// "prop2" is not defined as a field in the object node schema
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop2"), []]]),
				);

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[objectNode.type, nodeSchema_object],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_optionalNumber.kind, FieldKinds.optional],
						]),
					},
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.ObjectNode_FieldNotInSchema,
				);
			});

			it(`not in schema due to not having a required field from its defined schema`, () => {
				const fieldSchema_requiredNumber = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("requiredProp"), fieldSchema_requiredNumber]]),
				);

				// Create an object node with no fields at all; particularly it doesn't have the required 'requiredProp' field
				const objectNode = createNonLeafNode("myObjectNode", new Map([]));

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[objectNode.type, nodeSchema_object],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_requiredNumber.kind, FieldKinds.required],
						]),
					},
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.Field_IncorrectMultiplicity,
				);
			});

			it(`not in schema due to having a value`, () => {
				const fieldSchema_requiredNumber = getFieldSchema(FieldKinds.required, [
					numberNode.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("requiredProp"), fieldSchema_requiredNumber]]),
				);

				// Create an object node with no fields at all; particularly it doesn't have the required 'requiredProp' field
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode]]]),
				);
				objectNode.value = "something that's not undefined";

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
							[objectNode.type, nodeSchema_object],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_requiredNumber.kind, FieldKinds.required],
						]),
					},
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.NonLeafNode_ValueNotAllowed,
				);
			});
		});
	});

	describe("isFieldInSchema", () => {
		it(`not in schema if field kind not supported by schema policy`, () => {
			const numberNode = createLeafNode("myNumberNode", 1);
			const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.type]);
			const schemaAndPolicy: SchemaAndPolicy = {
				schema: {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				},
				policy: emptySchemaPolicy,
			};

			// FieldKinds.required is used above but missing in the schema policy
			assert.equal(
				isFieldInSchema([numberNode], fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.Field_KindNotInSchemaPolicy,
			);
		});

		it(`not in schema if type of a child node is not supported by field`, () => {
			const numberNode = createLeafNode("myNumberNode", 1);
			const stringNode = createLeafNode("myStringNode", "myStringValue");
			const fieldSchema = getFieldSchema(FieldKinds.sequence, [numberNode.type]);
			const schemaAndPolicy: SchemaAndPolicy = {
				schema: {
					nodeSchema: new Map([
						[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
					]),
				},
				policy: {
					fieldKinds: new Map([[fieldSchema.kind, FieldKinds.sequence]]),
				},
			};
			// Confirm that the field supports number nodes
			assert.equal(
				isFieldInSchema([numberNode], fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.NoError,
			);

			// Field does not support string nodes
			assert.equal(
				isFieldInSchema([stringNode], fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.Field_NodeTypeNotAllowed,
			);

			// Still fails even if there are other valid nodes for the field
			assert.equal(
				isFieldInSchema([numberNode, stringNode, numberNode], fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.Field_NodeTypeNotAllowed,
			);
		});

		const isFieldInSchema_multiplicityTestCases: [
			kind: FlexFieldKind,
			numberToTest: number,
			expectedResult: SchemaValidationErrors,
		][] = [
			[FieldKinds.required, 0, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.required, 1, SchemaValidationErrors.NoError],
			[FieldKinds.required, 2, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.forbidden, 0, SchemaValidationErrors.NoError],
			[FieldKinds.forbidden, 1, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.optional, 0, SchemaValidationErrors.NoError],
			[FieldKinds.optional, 1, SchemaValidationErrors.NoError],
			[FieldKinds.optional, 2, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.sequence, 0, SchemaValidationErrors.NoError],
			[FieldKinds.sequence, 1, SchemaValidationErrors.NoError],
			[FieldKinds.sequence, 2, SchemaValidationErrors.NoError],
			[FieldKinds.nodeKey, 0, SchemaValidationErrors.Field_IncorrectMultiplicity],
			[FieldKinds.nodeKey, 1, SchemaValidationErrors.NoError],
			[FieldKinds.nodeKey, 2, SchemaValidationErrors.Field_IncorrectMultiplicity],
		];
		for (const [
			fieldKind,
			howManyChildNodes,
			expectedResult,
		] of isFieldInSchema_multiplicityTestCases) {
			it(`correctly validates field multiplicity: (${fieldKind.identifier}, ${howManyChildNodes}) => ${expectedResult}`, () => {
				const numberNode = createLeafNode("myNumberNode", 1);
				const fieldSchema = getFieldSchema(fieldKind, [numberNode.type]);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.type, new LeafNodeStoredSchema(ValueSchema.Number)],
						]),
					},
					policy: {
						fieldKinds: new Map([[fieldSchema.kind, fieldKind]]),
					},
				};
				const childNodes: MapTree[] = [];
				for (let i = 0; i < howManyChildNodes; i++) {
					childNodes.push(numberNode);
				}

				assert.equal(
					isFieldInSchema(childNodes, fieldSchema, schemaAndPolicy),
					expectedResult,
				);
			});
		}
	});
});
