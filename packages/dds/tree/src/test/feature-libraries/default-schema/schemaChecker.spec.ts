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

function createLeafNode(
	nodeSchemaIdentifier: string,
	value: Value,
	valueSchema: ValueSchema,
): { node: MapTree; schema: LeafNodeStoredSchema } {
	return {
		node: {
			type: brand(nodeSchemaIdentifier),
			value,
			fields: new Map(),
		},
		schema: new LeafNodeStoredSchema(valueSchema),
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

describe.only("schema validation", () => {
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
		it(`not in schema due to missing node schema entry in schemaCollection`, () => {
			const schemaAndPolicy: SchemaAndPolicy = {
				schema: emptySchemaCollection,
				policy: emptySchemaPolicy,
			};

			assert.equal(
				isNodeInSchema(
					createLeafNode("myNumberNode", 1, ValueSchema.Number).node,
					schemaAndPolicy,
				),
				SchemaValidationErrors.Node_MissingSchema,
			);
		});

		describe("LeafNodeStoredSchema", () => {
			it("in schema", () => {
				const { node, schema } = createLeafNode("myNode", 1, ValueSchema.Number);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([[node.type, schema]]),
					},
					policy: emptySchemaPolicy,
				};
				assert.equal(isNodeInSchema(node, schemaAndPolicy), SchemaValidationErrors.NoError);
			});

			it("not in schema due to invalid value", () => {
				const { node, schema } = createLeafNode("myNode", "string", ValueSchema.Number); // "string" is not a number
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([[node.type, schema]]),
					},
					policy: emptySchemaPolicy,
				};
				assert.equal(
					isNodeInSchema(node, schemaAndPolicy),
					SchemaValidationErrors.LeafNode_InvalidValue,
				);
			});

			it(`not in schema due to missing value`, () => {
				const { node, schema } = createLeafNode("myNode", undefined, ValueSchema.Number);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([[node.type, schema]]),
					},
					policy: emptySchemaPolicy,
				};
				assert.equal(
					isNodeInSchema(node, schemaAndPolicy),
					SchemaValidationErrors.LeafNode_InvalidValue,
				);
			});

			it(`not in schema due to having fields`, () => {
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const stringNode = createLeafNode("myStringNode", "string", ValueSchema.String);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([[numberNode.node.type, numberNode.schema]]),
					},
					policy: emptySchemaPolicy,
				};
				numberNode.node.fields.set(brand("prop1"), [stringNode.node]);
				assert.equal(
					isNodeInSchema(numberNode.node, schemaAndPolicy),
					SchemaValidationErrors.LeafNode_FieldsNotAllowed,
				);
			});
		});

		describe("MapNodeStoredSchema", () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const stringNode = createLeafNode("myStringNode", "string", ValueSchema.String);

			it(`in schema (nodes of a single type)`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.node.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredNumberNode,
				);
				const mapNode = createNonLeafNode("myNumberMapNode", new Map());
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
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
				mapNode.fields.set(brand("prop1"), [numberNode.node]);
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`in schema (nodes of several types)`, () => {
				const fieldSchema_requiredUnionNode = getFieldSchema(FieldKinds.required, [
					numberNode.node.type,
					stringNode.node.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredUnionNode,
				);
				const mapNode = createNonLeafNode("myUnionMapNode", new Map());
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
							[stringNode.node.type, stringNode.schema],
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
				mapNode.fields.set(brand("prop1"), [numberNode.node]);
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);

				// In schema after adding a string node
				mapNode.fields.set(brand("prop2"), [stringNode.node]);
				assert.equal(
					isNodeInSchema(mapNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`not in schema due to having a value`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.node.type,
				]);
				const mapNodeSchema: TreeNodeStoredSchema = new MapNodeStoredSchema(
					fieldSchema_requiredNumberNode,
				);
				const mapNode = createNonLeafNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode.node]]]),
				);
				mapNode.value = "something that's not undefined";

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
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
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);

			it(`in schema with required field`, () => {
				const fieldSchema_requiredNumberNode = getFieldSchema(FieldKinds.required, [
					numberNode.node.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("numberProp"), fieldSchema_requiredNumberNode]]),
				);
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("numberProp"), [numberNode.node]]]),
				);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
							[objectNode.type, nodeSchema_object],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_requiredNumberNode.kind, FieldKinds.required],
						]),
					},
				};

				// In schema when empty optional and sequence fields don't exist
				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`in schema with empty optional field`, () => {
				// Note there's a sequence field here to test that both optional and sequence fields
				// can "not exist" in a node and it's still in schema, since both of those kinds of fields
				// can be empty and when they are they shouldn't exist in the node.
				const fieldSchema_optionalNumberNode = getFieldSchema(FieldKinds.optional, [
					numberNode.node.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("numberProp"), fieldSchema_optionalNumberNode]]),
				);
				const objectNode = createNonLeafNode("myObjectNode", new Map());
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
							[objectNode.type, nodeSchema_object],
						]),
					},
					policy: {
						fieldKinds: new Map([
							[fieldSchema_optionalNumberNode.kind, FieldKinds.optional],
						]),
					},
				};

				// In schema when optional field is empty
				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`not in schema due to having a field not present in its defined schema`, () => {
				const fieldSchema_optionalNumber = getFieldSchema(FieldKinds.optional, [
					numberNode.node.type,
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
							[numberNode.node.type, numberNode.schema],
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
					numberNode.node.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("requiredProp"), fieldSchema_requiredNumber]]),
				);

				// Create an object node with no fields at all; particularly it doesn't have the required 'requiredProp' field
				const objectNode = createNonLeafNode("myObjectNode", new Map([]));

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
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
					numberNode.node.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("requiredProp"), fieldSchema_requiredNumber]]),
				);

				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode.node]]]),
				);
				objectNode.value = "something that's not undefined";

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
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

			it(`not in schema if one of its fields is not in schema`, () => {
				const fieldSchema_requiredNumber = getFieldSchema(FieldKinds.required, [
					numberNode.node.type,
				]);
				const nodeSchema_object: TreeNodeStoredSchema = new ObjectNodeStoredSchema(
					new Map([[brand("requiredProp"), fieldSchema_requiredNumber]]),
				);

				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode.node]]]),
				);

				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([
							[numberNode.node.type, numberNode.schema],
							[objectNode.type, nodeSchema_object],
						]),
					},
					// Field kind is missing from the policy
					policy: emptySchemaPolicy,
				};

				assert.equal(
					isNodeInSchema(objectNode, schemaAndPolicy),
					SchemaValidationErrors.Field_KindNotInSchemaPolicy,
				);
			});
		});
	});

	describe("isFieldInSchema", () => {
		it(`not in schema if field kind not supported by schema policy`, () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
			const schemaAndPolicy: SchemaAndPolicy = {
				schema: {
					nodeSchema: new Map([[numberNode.node.type, numberNode.schema]]),
				},
				policy: emptySchemaPolicy,
			};

			// FieldKinds.required is used above but missing in the schema policy
			assert.equal(
				isFieldInSchema([numberNode.node], fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.Field_KindNotInSchemaPolicy,
			);
		});

		it(`not in schema if type of a child node is not supported by field`, () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const fieldSchema = getFieldSchema(FieldKinds.sequence, [numberNode.node.type]);
			const schemaAndPolicy: SchemaAndPolicy = {
				schema: {
					nodeSchema: new Map([[numberNode.node.type, numberNode.schema]]),
				},
				policy: {
					fieldKinds: new Map([[fieldSchema.kind, FieldKinds.sequence]]),
				},
			};
			// Field does not support string nodes
			assert.equal(
				isFieldInSchema(
					[createLeafNode("myStringNode", "myStringValue", ValueSchema.String).node],
					fieldSchema,
					schemaAndPolicy,
				),
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
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const fieldSchema = getFieldSchema(fieldKind, [numberNode.node.type]);
				const schemaAndPolicy: SchemaAndPolicy = {
					schema: {
						nodeSchema: new Map([[numberNode.node.type, numberNode.schema]]),
					},
					policy: {
						fieldKinds: new Map([[fieldSchema.kind, fieldKind]]),
					},
				};
				const childNodes: MapTree[] = [];
				for (let i = 0; i < howManyChildNodes; i++) {
					childNodes.push(numberNode.node);
				}

				assert.equal(
					isFieldInSchema(childNodes, fieldSchema, schemaAndPolicy),
					expectedResult,
				);
			});
		}
	});
});
