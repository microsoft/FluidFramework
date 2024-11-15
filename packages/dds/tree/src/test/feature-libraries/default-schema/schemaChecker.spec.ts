/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

// Reaching into internal module just to test it
import {
	SchemaValidationErrors,
	compliesWithMultiplicity,
	isFieldInSchema,
	isNodeInSchema,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/default-schema/schemaChecker.js";
import {
	cursorForJsonableTreeNode,
	defaultSchemaPolicy,
	FieldKinds,
	mapTreeFromCursor,
} from "../../../feature-libraries/index.js";
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
	type TreeFieldStoredSchema,
	type TreeNodeSchemaIdentifier,
	type TreeNodeStoredSchema,
	type Value,
} from "../../../core/index.js";
import { brand } from "../../../util/index.js";
import { testTrees } from "../../testTrees.js";
import { testIdCompressor } from "../../utils.js";

/**
 * Creates a schema and policy. Indicates stored schema validation should be performed.
 */
function createSchemaAndPolicy(
	nodeSchema: Map<TreeNodeSchemaIdentifier, TreeNodeStoredSchema> = new Map(),
	fieldKinds: Map<FieldKindIdentifier, FieldKindData> = new Map(),
): SchemaAndPolicy {
	return {
		schema: {
			nodeSchema,
		},
		policy: {
			fieldKinds,
			// Note: the value of 'validateSchema' doesn't matter for the tests in this file because they're testing a
			// layer where we already decided that we are doing validation and are validating that it works correctly.
			validateSchema: true,
		},
	};
}

/**
 * Helper for building {@link TreeFieldStoredSchema}.
 */
function getFieldSchema(
	kind: { identifier: FieldKindIdentifier },
	allowedTypes?: Iterable<TreeNodeSchemaIdentifier>,
): TreeFieldStoredSchema {
	return {
		kind: kind.identifier,
		types: new Set(allowedTypes),
	};
}

function createLeafNode(
	nodeSchemaIdentifier: string,
	value: Value,
	valueSchema: ValueSchema,
): { node: MapTree; schema: TreeNodeStoredSchema } {
	return {
		node: {
			type: brand(nodeSchemaIdentifier),
			value,
			fields: new Map(),
		},
		schema: new LeafNodeStoredSchema(valueSchema),
	};
}

function createNonLeafNode<
	T extends TreeNodeStoredSchema = MapNodeStoredSchema | ObjectNodeStoredSchema,
>(
	nodeSchemaIdentifier: string,
	fields: Map<FieldKey, MapTree[]>,
	schema: T,
): { node: MapTree; schema: TreeNodeStoredSchema } {
	return {
		node: {
			type: brand(nodeSchemaIdentifier),
			value: undefined,
			fields,
		},
		schema,
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
		it(`skips validation if stored schema is completely empty`, () => {
			assert.equal(
				isNodeInSchema(
					createLeafNode("myNumberNode", 1, ValueSchema.Number).node,
					createSchemaAndPolicy(), // Note this passes an empty stored schema
				),
				SchemaValidationErrors.NoError,
			);
		});

		it(`not in schema due to missing node schema entry in schemaCollection`, () => {
			const { node: stringNode, schema: stringSchema } = createLeafNode(
				"myStringNode",
				"string",
				ValueSchema.String,
			);
			assert.equal(
				isNodeInSchema(
					createLeafNode("myNumberNode", 1, ValueSchema.Number).node,
					// Note, this cannot use an empty stored schema because that would skip validation,
					// So just putting a schema for a node that is not the one we pass in for validation.
					createSchemaAndPolicy(new Map([[stringNode.type, stringSchema]])),
				),
				SchemaValidationErrors.Node_MissingSchema,
			);
		});

		describe("LeafNodeStoredSchema", () => {
			it("in schema", () => {
				const { node, schema } = createLeafNode("myNode", 1, ValueSchema.Number);
				const schemaAndPolicy = createSchemaAndPolicy(new Map([[node.type, schema]]));
				assert.equal(isNodeInSchema(node, schemaAndPolicy), SchemaValidationErrors.NoError);
			});

			it("not in schema due to invalid value", () => {
				const { node, schema } = createLeafNode("myNode", "string", ValueSchema.Number); // "string" is not a number
				const schemaAndPolicy = createSchemaAndPolicy(new Map([[node.type, schema]]));
				assert.equal(
					isNodeInSchema(node, schemaAndPolicy),
					SchemaValidationErrors.LeafNode_InvalidValue,
				);
			});

			it(`not in schema due to missing value`, () => {
				const { node, schema } = createLeafNode("myNode", undefined, ValueSchema.Number);
				const schemaAndPolicy = createSchemaAndPolicy(new Map([[node.type, schema]]));
				assert.equal(
					isNodeInSchema(node, schemaAndPolicy),
					SchemaValidationErrors.LeafNode_InvalidValue,
				);
			});

			it(`not in schema due to having fields`, () => {
				const { node, schema } = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const stringNode = createLeafNode("myStringNode", "string", ValueSchema.String);
				const schemaAndPolicy = createSchemaAndPolicy(new Map([[node.type, schema]]));
				const outOfSchemaNode: MapTree = {
					type: node.type,
					value: node.value,
					fields: new Map([[brand("prop1"), [stringNode.node]]]),
				};

				assert.equal(
					isNodeInSchema(outOfSchemaNode, schemaAndPolicy),
					SchemaValidationErrors.LeafNode_FieldsNotAllowed,
				);
			});
		});

		describe("MapNodeStoredSchema", () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const stringNode = createLeafNode("myStringNode", "string", ValueSchema.String);

			it("in schema", () => {
				const fieldSchema = getFieldSchema(FieldKinds.required, [
					numberNode.node.type,
					stringNode.node.type,
				]);
				const mapNode = createNonLeafNode(
					"myUnionMapNode",
					new Map([
						[brand("prop1"), [numberNode.node]],
						[brand("prop2"), [stringNode.node]],
					]),
					new MapNodeStoredSchema(fieldSchema),
				);
				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[stringNode.node.type, stringNode.schema],
						[mapNode.node.type, mapNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.required]]),
				);

				assert.equal(
					isNodeInSchema(mapNode.node, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it("in schema while empty", () => {
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
				const mapNode = createNonLeafNode(
					"myMapNode",
					new Map(),
					new MapNodeStoredSchema(fieldSchema),
				);
				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[mapNode.node.type, mapNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.required]]),
				);

				assert.equal(
					isNodeInSchema(mapNode.node, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it("not in schema due to having a value", () => {
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
				const mapNode = createNonLeafNode(
					"myNumberMapNode",
					new Map([[brand("prop1"), [numberNode.node]]]),
					new MapNodeStoredSchema(fieldSchema),
				);

				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[mapNode.node.type, mapNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.required]]),
				);

				const outOfSchemaNode: MapTree = {
					type: mapNode.node.type,
					value: "something that's not undefined",
					fields: mapNode.node.fields,
				};

				assert.equal(
					isNodeInSchema(outOfSchemaNode, schemaAndPolicy),
					SchemaValidationErrors.NonLeafNode_ValueNotAllowed,
				);
			});
		});

		describe("ObjectNodeStoredSchema", () => {
			it(`in schema with required field`, () => {
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("numberProp"), [numberNode.node]]]),
					new ObjectNodeStoredSchema(new Map([[brand("numberProp"), fieldSchema]])),
				);
				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[objectNode.node.type, objectNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.required]]),
				);

				assert.equal(
					isNodeInSchema(objectNode.node, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`in schema with empty optional field`, () => {
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const fieldSchema = getFieldSchema(FieldKinds.optional, [numberNode.node.type]);
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map(),
					new ObjectNodeStoredSchema(new Map([[brand("numberProp"), fieldSchema]])),
				);
				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[objectNode.node.type, objectNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.optional]]),
				);

				assert.equal(
					isNodeInSchema(objectNode.node, schemaAndPolicy),
					SchemaValidationErrors.NoError,
				);
			});

			it(`not in schema due to having a field not present in its defined schema`, () => {
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const fieldSchema = getFieldSchema(FieldKinds.optional, [numberNode.node.type]);

				// "prop2" is not defined as a field in the object node schema
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop2"), []]]),
					new ObjectNodeStoredSchema(new Map([[brand("prop1"), fieldSchema]])),
				);

				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[objectNode.node.type, objectNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.optional]]),
				);

				assert.equal(
					isNodeInSchema(objectNode.node, schemaAndPolicy),
					SchemaValidationErrors.ObjectNode_FieldNotInSchema,
				);
			});

			it(`not in schema due to not having a required field from its defined schema`, () => {
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
				// 'requiredProp' field is not present in the node
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([]),
					new ObjectNodeStoredSchema(new Map([[brand("requiredProp"), fieldSchema]])),
				);

				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[objectNode.node.type, objectNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.required]]),
				);

				assert.equal(
					isNodeInSchema(objectNode.node, schemaAndPolicy),
					SchemaValidationErrors.Field_IncorrectMultiplicity,
				);
			});

			it(`not in schema due to having a value`, () => {
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode.node]]]),
					new ObjectNodeStoredSchema(new Map([[brand("requiredProp"), fieldSchema]])),
				);

				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[objectNode.node.type, objectNode.schema],
					]),
					new Map([[fieldSchema.kind, FieldKinds.required]]),
				);

				const outOfSchemaNode: MapTree = {
					type: objectNode.node.type,
					value: "something that's not undefined",
					fields: objectNode.node.fields,
				};

				assert.equal(
					isNodeInSchema(outOfSchemaNode, schemaAndPolicy),
					SchemaValidationErrors.NonLeafNode_ValueNotAllowed,
				);
			});

			it(`not in schema if one of its fields is not in schema`, () => {
				const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
				const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
				const objectNode = createNonLeafNode(
					"myObjectNode",
					new Map([[brand("prop1"), [numberNode.node]]]),
					new ObjectNodeStoredSchema(new Map([[brand("requiredProp"), fieldSchema]])),
				);

				// Field kind is missing from the policy
				const schemaAndPolicy = createSchemaAndPolicy(
					new Map([
						[numberNode.node.type, numberNode.schema],
						[objectNode.node.type, objectNode.schema],
					]),
				);

				assert.equal(
					isNodeInSchema(objectNode.node, schemaAndPolicy),
					SchemaValidationErrors.Field_KindNotInSchemaPolicy,
				);
			});
		});
	});

	describe("isFieldInSchema", () => {
		it("in schema", () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
			const schemaAndPolicy = createSchemaAndPolicy(
				new Map([[numberNode.node.type, numberNode.schema]]),
				new Map([[fieldSchema.kind, FieldKinds.required]]),
			);

			const field: MapTree[] = [numberNode.node];

			assert.equal(
				isFieldInSchema(field, fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.NoError,
			);
		});

		it(`not in schema if field kind not supported by schema policy`, () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
			const schemaAndPolicy = createSchemaAndPolicy(
				new Map([[numberNode.node.type, numberNode.schema]]),
			);

			// FieldKinds.required is used above but missing in the schema policy
			assert.equal(
				isFieldInSchema([numberNode.node], fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.Field_KindNotInSchemaPolicy,
			);
		});

		it(`not in schema if type of a child node is not supported by field`, () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const fieldSchema = getFieldSchema(FieldKinds.sequence, [numberNode.node.type]);
			const schemaAndPolicy = createSchemaAndPolicy(
				new Map([[numberNode.node.type, numberNode.schema]]),
				new Map([[fieldSchema.kind, FieldKinds.sequence]]),
			);

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

		it("not in schema due to field multiplicity not respected", () => {
			const numberNode = createLeafNode("myNumberNode", 1, ValueSchema.Number);
			const fieldSchema = getFieldSchema(FieldKinds.required, [numberNode.node.type]);
			const schemaAndPolicy = createSchemaAndPolicy(
				new Map([[numberNode.node.type, numberNode.schema]]),
				new Map([[fieldSchema.kind, FieldKinds.required]]),
			);

			const emptyField: MapTree[] = [];

			assert.equal(
				isFieldInSchema(emptyField, fieldSchema, schemaAndPolicy),
				SchemaValidationErrors.Field_IncorrectMultiplicity,
			);
		});
	});

	describe("testTrees", () => {
		for (const testTree of testTrees) {
			it(testTree.name, () => {
				const mapTrees = testTree
					.treeFactory(testIdCompressor)
					.map((j) => mapTreeFromCursor(cursorForJsonableTreeNode(j)));
				const schema = testTree.schemaData;
				assert.equal(
					isFieldInSchema(mapTrees, schema.rootFieldSchema, {
						schema,
						policy: defaultSchemaPolicy,
					}),
					SchemaValidationErrors.NoError,
				);
			});
		}
	});
});
